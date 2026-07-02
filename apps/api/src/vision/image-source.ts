import { BadRequestException } from '@nestjs/common';
import { lookup } from 'dns/promises';
import { isIP } from 'net';

/**
 * Guarda anti-SSRF + carregamento de imagem para o VisionModule.
 *
 * O servidor busca a imagem a partir de uma URL fornecida pelo cliente, então
 * a URL só pode ser http(s) público — bloqueia localhost, IPs privados,
 * link-local e o metadata de cloud (169.254.169.254). Mesma proteção já
 * aplicada no protótipo Gemini (`analyze-image.service.ts`), aqui isolada em
 * funções puras e testáveis para ser reaplicada a cada URL de imagem.
 */

/** true se o IP for loopback/privado/link-local/reservado (IPv4 e IPv6). */
export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split('.').map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    return (
      a === 0 || // 0.0.0.0/8
      a === 10 || // 10.0.0.0/8
      a === 127 || // loopback
      (a === 169 && b === 254) || // link-local (inclui metadata 169.254.169.254)
      (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
      (a === 192 && b === 168) || // 192.168.0.0/16
      (a === 100 && b >= 64 && b <= 127) // CGNAT 100.64.0.0/10
    );
  }
  if (v === 6) {
    const lower = ip.toLowerCase();
    // IPv4 mapeado (::ffff:a.b.c.d) — valida o IPv4 embutido.
    const mapped = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return (
      lower === '::1' || // loopback
      lower === '::' || // unspecified
      lower.startsWith('fc') || // fc00::/7 unique local
      lower.startsWith('fd') ||
      lower.startsWith('fe8') || // fe80::/10 link-local
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    );
  }
  // Não reconhecido como IP → bloqueia por segurança.
  return true;
}

/**
 * Valida que a URL é http(s) e que o host NÃO resolve para um IP interno.
 * Lança BadRequestException caso contrário (anti-SSRF). Roda antes de qualquer
 * fetch da imagem.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('URL de imagem inválida.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException('URL de imagem deve usar http ou https.');
  }

  const host = url.hostname;
  let addresses: string[];
  if (isIP(host)) {
    addresses = [host];
  } else {
    try {
      const records = await lookup(host, { all: true });
      addresses = records.map((r) => r.address);
    } catch {
      throw new BadRequestException('Não foi possível resolver o host da imagem.');
    }
  }

  if (addresses.length === 0 || addresses.some((ip) => isPrivateIp(ip))) {
    throw new BadRequestException('URL de imagem aponta para um endereço não permitido.');
  }
}

/**
 * Busca uma imagem pública e devolve base64 (sem prefixo data:) + mimeType.
 * Aplica a guarda anti-SSRF antes do fetch. Lança BadRequestException em falha.
 */
export async function fetchImageAsBase64(
  rawUrl: string,
  timeoutMs = 15000,
): Promise<{ base64: string; mimeType: string }> {
  await assertPublicHttpUrl(rawUrl);

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    res = await fetch(rawUrl, { signal: controller.signal });
  } catch {
    throw new BadRequestException('Falha ao baixar a imagem informada.');
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new BadRequestException(`Falha ao baixar a imagem (HTTP ${res.status}).`);
  }

  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim();
  if (contentType && !contentType.startsWith('image/')) {
    throw new BadRequestException('A URL informada não aponta para uma imagem.');
  }

  const buf = Buffer.from(await res.arrayBuffer());
  return {
    base64: buf.toString('base64'),
    mimeType: contentType || 'image/jpeg',
  };
}

/** Remove o prefixo `data:image/...;base64,` se o cliente enviar a imagem inline. */
export function stripDataUrlPrefix(input: string): string {
  const match = input.match(/^data:[^;]+;base64,(.*)$/s);
  return match ? match[1] : input;
}
