const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string | null; role: string };
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
