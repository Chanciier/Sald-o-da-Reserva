const BASE = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

export interface AuthUserDto {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
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

export async function guestCheckoutApi(
  name: string,
  phone: string,
  cpf: string,
  turnstileToken?: string,
): Promise<AuthTokens> {
  return post<AuthTokens>('/auth/guest-checkout', {
    name,
    phone,
    cpf,
    ...(turnstileToken && { turnstileToken }),
  });
}

export interface ClubSignupResponse {
  orderId: string;
  // Só vêm quando quem assinou era convidado — o backend cria a sessão na
  // mesma chamada (ver ClubSignupService). Quem já estava logado usa a
  // própria sessão e o backend não devolve nada disso.
  accessToken?: string;
  refreshToken?: string;
  user?: AuthUserDto;
}

export async function clubSignupApi(
  name: string,
  phone: string,
  cpf: string,
  token?: string,
  turnstileToken?: string,
): Promise<ClubSignupResponse> {
  const res = await fetch(`${BASE}/club-signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify({ name, phone, cpf, ...(turnstileToken && { turnstileToken }) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as ClubSignupResponse;
}

export interface ClubMembershipStatus {
  isMember: boolean;
  validUntil: string | null;
}

// Chamado ao sair do campo CPF em /assinar-clube, antes de ir pro pagamento
// — avisa "você já é sócio até DD/MM" pra quem já assinou (pelo site ou na
// loja física). Fail-open no backend (ver ClubSignupService.checkCpfStatus):
// erro aqui nunca deveria travar a tela, mas se travar, quem chama trata
// como "não deu pra confirmar" e deixa seguir.
export async function checkClubCpfApi(cpf: string): Promise<ClubMembershipStatus> {
  const res = await fetch(`${BASE}/club-signup/check-cpf/${cpf}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as ClubMembershipStatus;
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

export async function verifyEmailApi(token: string): Promise<{ message: string }> {
  return post<{ message: string }>('/auth/verify-email', { token });
}

export async function resendVerificationApi(token: string): Promise<{ message: string }> {
  const res = await fetch(`${BASE}/auth/resend-verification`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((data as { message?: string }).message ?? 'Erro ao reenviar e-mail.');
  return data as { message: string };
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
