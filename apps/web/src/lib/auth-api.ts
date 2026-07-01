const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export interface AuthUserDto {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export async function loginApi(
  email: string,
  password: string,
  turnstileToken?: string,
): Promise<AuthTokens> {
  return post<AuthTokens>('/auth/login', {
    email,
    password,
    ...(turnstileToken && { turnstileToken }),
  });
}

export async function registerApi(
  name: string,
  email: string,
  password: string,
  turnstileToken?: string,
): Promise<AuthTokens> {
  return post<AuthTokens>('/auth/register', {
    name,
    email,
    password,
    ...(turnstileToken && { turnstileToken }),
  });
}

export async function refreshApi(refreshToken: string): Promise<AuthTokens> {
  const res = await fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${refreshToken}`,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Sessão expirada.');
  return data as AuthTokens;
}

export async function getMeApi(token: string): Promise<AuthUserDto & { createdAt: string }> {
  const res = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { message?: string }).message ?? 'Erro ao carregar perfil.');
  return data as AuthUserDto & { createdAt: string };
}

export async function updateMeApi(
  token: string,
  updates: { name?: string; phone?: string },
): Promise<AuthUserDto> {
  const res = await fetch(`${BASE}/auth/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(updates),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Erro ao salvar perfil.');
  return data as AuthUserDto;
}

export async function uploadAvatarApi(token: string, file: File): Promise<AuthUserDto> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/auth/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Erro ao enviar imagem.');
  return data as AuthUserDto;
}
