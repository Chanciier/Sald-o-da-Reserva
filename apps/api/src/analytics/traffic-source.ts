const SOURCE_PATTERNS: [RegExp, string][] = [
  [/google|bing|yahoo|duckduckgo|baidu/i, 'Busca orgânica'],
  [/facebook|instagram|fb\.com|l\.facebook/i, 'Meta (Facebook/Instagram)'],
  [/whatsapp/i, 'WhatsApp'],
  [/t\.co|twitter\.com|x\.com/i, 'Twitter/X'],
  [/mercadolivre|mercadolibre/i, 'Mercado Livre'],
  [/shopee/i, 'Shopee'],
];

export function referrerHost(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

// Classifica a origem de uma sessão em um rótulo legível. UTM explícito tem
// prioridade (campanha rastreada); sem UTM, cai para heurística por domínio
// do referrer; sem referrer, é acesso direto (digitou a URL/favorito/app).
export function classifyTrafficSource(
  referrer: string | null | undefined,
  utmSource: string | null | undefined,
  frontendHost: string,
): string {
  if (utmSource) return utmSource.trim().toLowerCase();

  const host = referrerHost(referrer);
  if (!host) return 'Direto';
  if (host === frontendHost) return 'Interno';

  for (const [pattern, label] of SOURCE_PATTERNS) {
    if (pattern.test(host)) return label;
  }
  return host;
}
