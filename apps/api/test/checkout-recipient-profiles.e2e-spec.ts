/**
 * E2E do fluxo de perfis de recebimento / endereços salvos no checkout.
 *
 * Diferente dos demais specs (unitários, Prisma mockado), este arquivo faz
 * chamadas HTTP reais contra uma instância JÁ RODANDO da API local
 * (`npm run start:dev` apontando para o Postgres/Redis do docker-compose) —
 * não sobe uma segunda instância em processo. Requer:
 *   - Docker Postgres/Redis no ar (docker compose up -d postgres redis)
 *   - API local rodando em API_BASE_URL (padrão http://localhost:3001/api/v1)
 *     com CHECKOUT_SAVED_PROFILES_ENABLED=dev (ou admins/beta/all) para que
 *     os endpoints de perfil não retornem 404.
 *
 * Escopo: cobre o fluxo de RETIRADA (perfil próprio, perfil de outro usuário,
 * CPF inválido, endereço incompleto, edição de perfil não afeta pedido
 * antigo). O fluxo de ENTREGA com frete real (Melhor Envio) não é exercitado
 * aqui porque o token local do Melhor Envio está expirado (gotcha conhecido
 * do ambiente, não relacionado a esta feature) — esse caminho é coberto a
 * nível de serviço em checkout.service.spec.ts (ShippingService mockado).
 */

const API = process.env.API_BASE_URL ?? 'http://localhost:3001/api/v1';

async function api<T>(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

const E2E_PASSWORD = 'TesteSenha123!';

// Reaproveita um usuário fixo entre execuções (login) em vez de registrar um
// novo a cada corrida — o endpoint de registro tem rate-limit agressivo
// (proteção real contra abuso) que múltiplas execuções deste E2E esgotam
// rapidamente. Só registra na primeiríssima execução (quando o login falha).
async function registerAndLogin(emailPrefix: string) {
  const email = `${emailPrefix}@example.com`;

  const login = await api<{ accessToken: string; user: { id: string } }>('/auth/login', {
    method: 'POST',
    body: { email, password: E2E_PASSWORD, turnstileToken: 'skip' },
  });
  if (login.status === 200) {
    return { token: login.data.accessToken, userId: login.data.user.id, email };
  }

  const res = await api<{ accessToken: string; user: { id: string } }>('/auth/register', {
    method: 'POST',
    body: { name: 'E2E Test User', email, password: E2E_PASSWORD, turnstileToken: 'skip' },
  });
  if (res.status !== 201) {
    throw new Error(
      `Falha ao registrar usuário de teste: ${res.status} ${JSON.stringify(res.data)}`,
    );
  }
  return { token: res.data.accessToken, userId: res.data.user.id, email };
}

async function firstActiveProductId(): Promise<string> {
  const res = await api<{ data: { id: string }[] }>('/products?limit=1&status=ACTIVE');
  if (!Array.isArray(res.data?.data) || !res.data.data.length) {
    throw new Error('Nenhum produto ACTIVE disponível no banco local para rodar o E2E.');
  }
  return res.data.data[0].id;
}

async function addToCartAndCheckout(
  token: string,
  productId: string,
  extra: Record<string, unknown>,
) {
  const cart = await api('/cart/items', {
    method: 'POST',
    token,
    body: { productId, quantity: 1 },
  });
  if (cart.status !== 200 && cart.status !== 201) {
    throw new Error(`Falha ao adicionar ao carrinho: ${cart.status} ${JSON.stringify(cart.data)}`);
  }
  return api<Record<string, unknown>>('/checkout', {
    method: 'POST',
    token,
    body: {
      deliveryMethod: 'PICKUP',
      customerPhone: '12991234567',
      ...extra,
    },
  });
}

describe('E2E — perfis de recebimento no checkout (retirada na loja)', () => {
  let userAToken: string;
  let userBToken: string;
  let productId: string;

  beforeAll(async () => {
    const flags = await api<{ savedProfilesEnabled: boolean }>('/checkout/feature-flags').catch(
      () => null,
    );
    if (!flags) {
      throw new Error(
        `API local não respondeu em ${API}. Suba a API antes de rodar este E2E (ver cabeçalho do arquivo).`,
      );
    }

    const a = await registerAndLogin('e2e-recipient-a');
    const b = await registerAndLogin('e2e-recipient-b');
    userAToken = a.token;
    userBToken = b.token;
    productId = await firstActiveProductId();
  }, 30_000);

  it('feature flag: reports enabled for this environment (must be dev/admins/beta/all to run the rest)', async () => {
    const res = await api<{ savedProfilesEnabled: boolean }>('/checkout/feature-flags', {
      token: userAToken,
    });
    expect(res.status).toBe(200);
    if (!res.data.savedProfilesEnabled) {
      throw new Error(
        'CHECKOUT_SAVED_PROFILES_ENABLED está desligada nesta API — os demais testes deste ' +
          'arquivo (que dependem dos endpoints /recipient-profiles) serão pulados/falhar. ' +
          'Rode a API local com CHECKOUT_SAVED_PROFILES_ENABLED=dev para este E2E.',
      );
    }
  });

  it('old flow (no profile): PICKUP order snapshots buyerName/cpf inline, exactly as before', async () => {
    const res = await addToCartAndCheckout(userAToken, productId, {
      buyerName: 'Cliente Inline',
      cpf: '11122233396',
    });

    expect(res.status).toBe(201);
    expect(res.data.buyerName).toBe('Cliente Inline');
    expect(res.data.recipientProfileId).toBeNull();
    expect(res.data.recipientDocument).toBe('11122233396');
    expect(res.data.recipientDocumentType).toBe('CPF');
  });

  it('rejects creating a profile with an invalid document length', async () => {
    const res = await api('/recipient-profiles', {
      method: 'POST',
      token: userAToken,
      body: { label: 'Inválido', name: 'X', document: '123' },
    });
    expect(res.status).toBe(400);
  });

  it('rejects creating a saved address with a missing required field', async () => {
    const created = await api<{ id: string }>('/recipient-profiles', {
      method: 'POST',
      token: userAToken,
      body: { label: 'Perfil p/ endereço incompleto', name: 'X', document: '11122233396' },
    });
    expect(created.status).toBe(201);

    const res = await api(`/recipient-profiles/${created.data.id}/addresses`, {
      method: 'POST',
      token: userAToken,
      // faltando `city`
      body: {
        label: 'Casa',
        postalCode: '12345-678',
        street: 'Rua A',
        number: '1',
        neighborhood: 'Centro',
        state: 'SP',
      },
    });
    expect(res.status).toBe(400);
  });

  it('full flow: create profile, reuse it for a PICKUP order, another user cannot see/use it', async () => {
    const createRes = await api<{ id: string; label: string; name: string }>(
      '/recipient-profiles',
      {
        method: 'POST',
        token: userAToken,
        body: { label: 'Perfil Reutilizável', name: 'Maria Souza', document: '22233344400' },
      },
    );
    expect(createRes.status).toBe(201);
    const profileId = createRes.data.id;

    // Retirada pelo titular, usando o perfil: buyerName/documento vêm do perfil,
    // não do que for (ou não) enviado inline no body.
    const orderRes = await addToCartAndCheckout(userAToken, productId, {
      recipientProfileId: profileId,
    });
    expect(orderRes.status).toBe(201);
    expect(orderRes.data.buyerName).toBe('Maria Souza');
    expect(orderRes.data.recipientProfileId).toBe(profileId);
    expect(orderRes.data.recipientDocument).toBe('22233344400');

    // Perfil de outro usuário: 404 genérico, não vaza existência.
    const otherUserRead = await api(`/recipient-profiles/${profileId}`, { token: userBToken });
    expect(otherUserRead.status).toBe(404);

    const otherUserCheckout = await addToCartAndCheckout(userBToken, productId, {
      recipientProfileId: profileId,
    });
    expect(otherUserCheckout.status).toBe(404);

    // Editar o perfil DEPOIS não deve alterar o pedido já criado (snapshot).
    const updateRes = await api(`/recipient-profiles/${profileId}`, {
      method: 'PATCH',
      token: userAToken,
      body: { name: 'Maria Souza (nome alterado)' },
    });
    expect(updateRes.status).toBe(200);

    const orderId = orderRes.data.id as string;
    const orderAfterEdit = await api<{ buyerName: string; recipientDocument: string }>(
      `/orders/${orderId}`,
      { token: userAToken },
    );
    expect(orderAfterEdit.data.buyerName).toBe('Maria Souza');
    expect(orderAfterEdit.data.recipientDocument).toBe('22233344400');
  });
});
