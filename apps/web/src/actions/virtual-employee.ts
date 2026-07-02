import type { IdentificationResult, VisionResult } from '@/types/virtual-employee';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

async function post<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `Erro ${res.status}`);
  return json as T;
}

/** VisionModule: extrai atributos visuais de 1-5 fotos já hospedadas (URLs públicas). */
export async function analyzeVision(token: string, imageUrls: string[]): Promise<VisionResult> {
  return post<VisionResult>('/vision/analyze', token, { imageUrls });
}

/** IdentificationModule: gera título/descrição/especificações/categoria/tags/slug/meta a partir do Vision. */
export async function generateIdentification(
  token: string,
  vision: VisionResult,
): Promise<IdentificationResult> {
  const { brand, model, category, color, material, dimensions, condition, features, keywords } =
    vision;
  return post<IdentificationResult>('/identification/generate', token, {
    brand,
    model,
    category,
    color,
    material,
    dimensions,
    condition,
    features,
    keywords,
  });
}
