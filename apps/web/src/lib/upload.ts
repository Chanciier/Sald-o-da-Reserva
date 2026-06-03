import type { ImageData } from '@/types/image';

const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export type UploadFolder = 'products' | 'users' | 'categories' | 'banners';

export async function uploadImages(
  files: File[],
  folder: UploadFolder,
  token: string,
): Promise<ImageData[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));

  const res = await fetch(`${BASE}/uploads/${folder}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Erro ${res.status}`);
  }

  return res.json() as Promise<ImageData[]>;
}

export async function deleteImage(folder: string, filename: string, token: string): Promise<void> {
  const res = await fetch(`${BASE}/uploads/${folder}/${filename}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? `Erro ${res.status}`);
  }
}
