'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Link2,
  TrendingUp,
  Wallet,
  Clock,
  BadgeCheck,
  Instagram,
  Facebook,
  Music2,
  KeyRound,
  Search,
  MousePointerClick,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

type PixKeyType = 'CPF' | 'EMAIL' | 'PHONE' | 'RANDOM';

interface Application {
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  fullName: string;
  cpf: string;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  reviewNote: string | null;
}

interface Affiliate {
  id: string;
  code: string;
  isActive: boolean;
  pixKey: string | null;
  pixKeyType: PixKeyType | null;
}

interface Commission {
  id: string;
  orderId: string;
  baseAmount: number;
  rate: number;
  amount: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
}

interface Withdrawal {
  id: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'REJECTED';
  pixKey: string;
  pixKeyType: PixKeyType;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
}

interface ClickStat {
  productId: string;
  productName: string | null;
  productSlug: string | null;
  count: number;
}

interface AffiliateMe {
  application: Application | null;
  affiliate: Affiliate | null;
  config: { commissionRate: number; cookieDays: number; minWithdrawal: number };
  totals: { available: number; pending: number; paid: number };
  clicks: ClickStat[];
  commissions: Commission[];
  withdrawals: Withdrawal[];
}

interface ProductItem {
  id: string;
  name: string;
  slug: string;
}

const PIX_KEY_LABEL: Record<PixKeyType, string> = {
  CPF: 'CPF',
  EMAIL: 'E-mail',
  PHONE: 'Telefone',
  RANDOM: 'Aleatória',
};

const COMMISSION_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  AVAILABLE: { label: 'Disponível', cls: 'bg-blue-100 text-blue-800' },
  PAID: { label: 'Paga', cls: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
};

const WITHDRAWAL_STATUS: Record<Withdrawal['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Em análise', cls: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-800' },
};

async function apiFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers ?? {}),
    },
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function onlyDigits(v: string) {
  return v.replace(/\D/g, '');
}

interface ApplyForm {
  fullName: string;
  cpf: string;
  instagram: string;
  facebook: string;
  tiktok: string;
}

export default function AfiliadoPage() {
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const [origin, setOrigin] = useState('');

  useEffect(() => setOrigin(window.location.origin), []);

  const { data, isLoading } = useQuery<AffiliateMe>({
    queryKey: ['affiliate-me'],
    queryFn: () => apiFetch(`${API}/affiliates/me`, token!),
    enabled: !!token,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const { application, affiliate } = data;

  // D) Aprovado → painel completo
  if (affiliate) {
    return (
      <AffiliatePanel data={data} affiliate={affiliate} origin={origin} token={token!} qc={qc} />
    );
  }

  // B) Em análise
  if (application?.status === 'PENDING') {
    return (
      <div className="mx-auto max-w-xl space-y-5">
        <h1 className="text-xl font-bold">Programa de Afiliados</h1>
        <div className="rounded-xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-yellow-100">
            <Clock className="size-7 text-yellow-700" />
          </div>
          <h2 className="mt-4 text-lg font-bold">Solicitação em análise</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Recebemos sua solicitação para o programa de afiliados. Nossa equipe está analisando e
            você será avisado assim que houver uma resposta.
          </p>
        </div>
      </div>
    );
  }

  // A) Sem nada / C) Rejeitado → formulário
  return <ApplyView application={application} user={user} token={token!} qc={qc} />;
}

// ── A / C: Formulário de solicitação ────────────────────────────────────────
function ApplyView({
  application,
  user,
  token,
  qc,
}: {
  application: Application | null;
  user: ReturnType<typeof useAuth>['user'];
  token: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const rejected = application?.status === 'REJECTED';
  const [form, setForm] = useState<ApplyForm>({
    fullName: user?.name ?? application?.fullName ?? '',
    cpf: application?.cpf ?? '',
    instagram: application?.instagram ?? '',
    facebook: application?.facebook ?? '',
    tiktok: application?.tiktok ?? '',
  });
  const [error, setError] = useState('');

  const apply = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`${API}/affiliates/me/apply`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-me'] }),
    onError: (e: Error) => setError(e.message),
  });

  const cpfDigits = onlyDigits(form.cpf);
  const hasSocial = !!form.instagram.trim() || !!form.facebook.trim() || !!form.tiktok.trim();
  const cpfValid = cpfDigits.length === 11;
  const canSubmit = !!form.fullName.trim() && cpfValid && hasSocial;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.fullName.trim()) return setError('Informe seu nome completo.');
    if (!cpfValid) return setError('Informe um CPF válido (11 dígitos).');
    if (!hasSocial) return setError('Informe pelo menos uma rede social.');
    apply.mutate({
      fullName: form.fullName.trim(),
      cpf: cpfDigits,
      instagram: form.instagram.trim() || undefined,
      facebook: form.facebook.trim() || undefined,
      tiktok: form.tiktok.trim() || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <h1 className="text-xl font-bold">Programa de Afiliados</h1>

      {rejected && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 shadow-sm">
          <h2 className="font-semibold text-destructive">Solicitação não aprovada</h2>
          {application?.reviewNote ? (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Motivo: <span className="text-foreground">{application.reviewNote}</span>
            </p>
          ) : (
            <p className="mt-1.5 text-sm text-muted-foreground">
              Sua solicitação anterior não foi aprovada. Você pode revisar os dados e enviar
              novamente.
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <TrendingUp className="size-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">
              {rejected ? 'Reenviar solicitação' : 'Seja um afiliado'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Ganhe <strong>comissão</strong> sobre cada produto vendido por quem você indicar. Sem
              custo para participar.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium">Nome completo *</label>
            <input
              type="text"
              value={form.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              placeholder="Seu nome completo"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium">CPF *</label>
            <input
              type="text"
              inputMode="numeric"
              value={form.cpf}
              onChange={(e) =>
                setForm((f) => ({ ...f, cpf: onlyDigits(e.target.value).slice(0, 11) }))
              }
              placeholder="Apenas números"
              maxLength={11}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {form.cpf && !cpfValid && (
              <p className="mt-1 text-xs text-destructive">O CPF deve ter 11 dígitos.</p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium">
              Redes sociais{' '}
              <span className="font-normal text-muted-foreground">(informe ao menos uma)</span>
            </p>
            <div className="flex items-center gap-2">
              <Instagram className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={form.instagram}
                onChange={(e) => setForm((f) => ({ ...f, instagram: e.target.value }))}
                placeholder="@seu_instagram"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <Facebook className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={form.facebook}
                onChange={(e) => setForm((f) => ({ ...f, facebook: e.target.value }))}
                placeholder="seu perfil no Facebook"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex items-center gap-2">
              <Music2 className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="text"
                value={form.tiktok}
                onChange={(e) => setForm((f) => ({ ...f, tiktok: e.target.value }))}
                placeholder="@seu_tiktok"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || apply.isPending}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {apply.isPending
              ? 'Enviando...'
              : rejected
                ? 'Reenviar solicitação'
                : 'Solicitar afiliação'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── D: Painel do afiliado aprovado ──────────────────────────────────────────
function CopyLinkButton({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // ignore
        }
      }}
      title="Copiar link"
      className="flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
    >
      {copied ? <Check className="size-3.5 text-green-600" /> : <Copy className="size-3.5" />}
      {copied ? 'Copiado!' : 'Copiar'}
    </button>
  );
}

function AffiliatePanel({
  data,
  affiliate,
  origin,
  token,
  qc,
}: {
  data: AffiliateMe;
  affiliate: Affiliate;
  origin: string;
  token: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const { config, totals, clicks, commissions, withdrawals } = data;

  const [pixKeyType, setPixKeyType] = useState<PixKeyType>(affiliate.pixKeyType ?? 'CPF');
  const [pixKey, setPixKey] = useState(affiliate.pixKey ?? '');
  const [pixError, setPixError] = useState('');
  const [withdrawError, setWithdrawError] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const { data: productsData, isLoading: productsLoading } = useQuery<{ data: ProductItem[] }>({
    queryKey: ['products-affiliate'],
    queryFn: () => fetch(`${API}/products?status=ACTIVE&limit=200`).then((r) => r.json()),
    staleTime: 60_000,
  });

  const allProducts = productsData?.data ?? [];
  const clickMap = new Map(clicks.map((c) => [c.productId, c.count]));
  const filteredProducts = productSearch.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(productSearch.trim().toLowerCase()))
    : allProducts;

  const savePix = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`${API}/affiliates/me/pix`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-me'] }),
    onError: (e: Error) => setPixError(e.message),
  });

  const withdraw = useMutation({
    mutationFn: () => apiFetch(`${API}/affiliates/me/withdraw`, token, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['affiliate-me'] }),
    onError: (e: Error) => setWithdrawError(e.message),
  });

  function handleSavePix(e: React.FormEvent) {
    e.preventDefault();
    setPixError('');
    if (!pixKey.trim()) return setPixError('Informe a chave Pix.');
    savePix.mutate({ pixKey: pixKey.trim(), pixKeyType });
  }

  const hasPix = !!affiliate.pixKey;
  const canWithdraw = totals.available >= config.minWithdrawal && hasPix;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Programa de Afiliados</h1>

      {/* Links por produto */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Link2 className="size-4 text-primary" />
            Links por produto
          </p>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar produto..."
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              className="h-8 w-48 rounded-lg border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        {productsLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !filteredProducts.length ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {productSearch ? 'Nenhum produto encontrado.' : 'Nenhum produto disponível.'}
          </p>
        ) : (
          <div className="max-h-96 divide-y overflow-y-auto">
            {filteredProducts.map((p) => {
              const count = clickMap.get(p.id) ?? 0;
              const productLink = `${origin}/produtos/${p.slug}?ref=${affiliate.code}`;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {productLink}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {count > 0 && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MousePointerClick className="size-3.5" />
                        {count}
                      </span>
                    )}
                    <CopyLinkButton link={productLink} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="border-t px-5 py-2 text-xs text-muted-foreground">
          O link de afiliado dura apenas durante a sessão do visitante. Código:{' '}
          <span className="font-mono font-semibold">{affiliate.code}</span>
        </p>
      </div>

      {/* Saldos */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="size-3.5" /> Disponível
          </p>
          <p className="mt-1 text-2xl font-bold text-primary">{fmt(totals.available)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" /> Em processamento
          </p>
          <p className="mt-1 text-2xl font-bold">{fmt(totals.pending)}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <BadgeCheck className="size-3.5" /> Já recebido
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">{fmt(totals.paid)}</p>
        </div>
      </div>

      {/* Chave Pix + Saque */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <p className="mb-3 flex items-center gap-1.5 text-sm font-medium">
          <KeyRound className="size-4 text-primary" />
          Chave Pix para recebimento
        </p>
        <form onSubmit={handleSavePix} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Tipo</label>
              <select
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value as PixKeyType)}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="CPF">CPF</option>
                <option value="EMAIL">E-mail</option>
                <option value="PHONE">Telefone</option>
                <option value="RANDOM">Aleatória</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium">Chave</label>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                placeholder="Sua chave Pix"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          {pixError && <p className="text-xs text-destructive">{pixError}</p>}
          <button
            type="submit"
            disabled={savePix.isPending}
            className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            {savePix.isPending ? 'Salvando...' : 'Salvar chave Pix'}
          </button>
        </form>

        <div className="mt-4 border-t pt-4">
          {withdrawError && <p className="mb-2 text-xs text-destructive">{withdrawError}</p>}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Saque mínimo de {fmt(config.minWithdrawal)}.{' '}
              {!hasPix && 'Cadastre sua chave Pix para sacar.'}
            </p>
            <button
              onClick={() => {
                setWithdrawError('');
                withdraw.mutate();
              }}
              disabled={!canWithdraw || withdraw.isPending}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {withdraw.isPending ? 'Solicitando...' : 'Solicitar saque'}
            </button>
          </div>
        </div>
      </div>

      {/* Histórico de comissões */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold">Histórico de comissões</h2>
        </div>
        {!commissions.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhuma comissão ainda. Compartilhe seu link para começar a ganhar.
          </p>
        ) : (
          <div className="divide-y">
            {commissions.map((c) => {
              const st = COMMISSION_STATUS[c.status] ?? {
                label: c.status,
                cls: 'bg-muted text-muted-foreground',
              };
              return (
                <div key={c.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      Pedido #{c.orderId.slice(-8).toUpperCase()}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {c.rate}% de {fmt(c.baseAmount)}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{fmt(c.amount)}</p>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Histórico de saques */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3">
          <h2 className="font-semibold">Histórico de saques</h2>
        </div>
        {!withdrawals.length ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            Nenhum saque solicitado ainda.
          </p>
        ) : (
          <div className="divide-y">
            {withdrawals.map((w) => {
              const st = WITHDRAWAL_STATUS[w.status];
              return (
                <div key={w.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {fmt(w.amount)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {PIX_KEY_LABEL[w.pixKeyType]} · {w.pixKey}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(w.createdAt).toLocaleDateString('pt-BR')}
                      {w.note ? ` · ${w.note}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
