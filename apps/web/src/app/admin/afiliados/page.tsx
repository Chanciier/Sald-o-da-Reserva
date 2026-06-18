'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  Save,
  Check,
  Instagram,
  Facebook,
  Music2,
  Copy,
  ClipboardCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

type Status = 'PENDING' | 'PAID' | 'CANCELLED';
type AppStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type WithdrawalStatus = 'PENDING' | 'PAID' | 'REJECTED';
type Tab = 'config' | 'commissions' | 'affiliates' | 'applications' | 'withdrawals';

interface Config {
  commissionRate: number;
  cookieDays: number;
  minWithdrawal: number;
  isActive: boolean;
}
interface AffiliateRow {
  id: string;
  code: string;
  isActive: boolean;
  name: string | null;
  email: string;
  orders: number;
  commissionsCount: number;
  pending: number;
  paid: number;
  createdAt: string;
}
interface CommissionRow {
  id: string;
  orderId: string;
  affiliateCode: string;
  affiliateName: string | null;
  affiliateEmail: string;
  baseAmount: number;
  rate: number;
  amount: number;
  status: Status;
  createdAt: string;
  paidAt: string | null;
  orderTotal: number | null;
}
interface ApplicationRow {
  id: string;
  userId: string;
  fullName: string;
  cpf: string;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  status: AppStatus;
  reviewNote: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string;
}
interface WithdrawalRow {
  id: string;
  affiliateCode: string;
  affiliateName: string | null;
  affiliateEmail: string;
  amount: number;
  pixKey: string;
  pixKeyType: string;
  status: WithdrawalStatus;
  note: string | null;
  createdAt: string;
  paidAt: string | null;
}

const STATUS: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Paga', cls: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
};

const APP_STATUS: Record<AppStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  APPROVED: { label: 'Aprovada', cls: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Recusada', cls: 'bg-red-100 text-red-700' },
};

const WD_STATUS: Record<WithdrawalStatus, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Pago', cls: 'bg-green-100 text-green-800' },
  REJECTED: { label: 'Recusado', cls: 'bg-red-100 text-red-700' },
};

const FILTERS: { value: Status | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'PAID', label: 'Pagas' },
  { value: 'CANCELLED', label: 'Canceladas' },
];

const APP_FILTERS: { value: AppStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'APPROVED', label: 'Aprovadas' },
  { value: 'REJECTED', label: 'Recusadas' },
];

const WD_FILTERS: { value: WithdrawalStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'PAID', label: 'Pagos' },
  { value: 'REJECTED', label: 'Recusados' },
];

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

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

function SocialLinks({ app }: { app: ApplicationRow }) {
  const clean = (v: string) => v.replace(/^@/, '').trim();
  const links: { href: string; icon: React.ReactNode; label: string }[] = [];
  if (app.instagram)
    links.push({
      href: `https://instagram.com/${clean(app.instagram)}`,
      icon: <Instagram className="size-3.5" />,
      label: `@${clean(app.instagram)}`,
    });
  if (app.facebook)
    links.push({
      href: `https://facebook.com/${clean(app.facebook)}`,
      icon: <Facebook className="size-3.5" />,
      label: clean(app.facebook),
    });
  if (app.tiktok)
    links.push({
      href: `https://tiktok.com/@${clean(app.tiktok)}`,
      icon: <Music2 className="size-3.5" />,
      label: `@${clean(app.tiktok)}`,
    });
  if (!links.length) return <span className="text-xs text-muted-foreground">Sem redes</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {l.icon}
          {l.label}
        </a>
      ))}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      title="Copiar chave Pix"
      className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <ClipboardCheck className="size-3.5 text-green-600" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

export default function AdminAfiliadosPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('config');
  const [filter, setFilter] = useState<Status | 'ALL'>('ALL');
  const [appFilter, setAppFilter] = useState<AppStatus | 'ALL'>('PENDING');
  const [wdFilter, setWdFilter] = useState<WithdrawalStatus | 'ALL'>('PENDING');
  const [rate, setRate] = useState('');
  const [cookieDays, setCookieDays] = useState('');
  const [minWithdrawal, setMinWithdrawal] = useState('');

  const configQuery = useQuery<Config>({
    queryKey: ['admin-affiliate-config'],
    queryFn: () => apiFetch(`${API}/affiliates/admin/config`, token!),
    enabled: !!token,
  });

  useEffect(() => {
    if (configQuery.data) {
      setRate(String(configQuery.data.commissionRate));
      setCookieDays(String(configQuery.data.cookieDays));
      setMinWithdrawal(String(configQuery.data.minWithdrawal ?? ''));
    }
  }, [configQuery.data]);

  const affiliatesQuery = useQuery<AffiliateRow[]>({
    queryKey: ['admin-affiliates'],
    queryFn: () => apiFetch(`${API}/affiliates/admin/list`, token!),
    enabled: !!token,
  });

  const commissionsQuery = useQuery<CommissionRow[]>({
    queryKey: ['admin-commissions', filter],
    queryFn: () =>
      apiFetch(
        `${API}/affiliates/admin/commissions${filter === 'ALL' ? '' : `?status=${filter}`}`,
        token!,
      ),
    enabled: !!token,
  });

  const applicationsQuery = useQuery<ApplicationRow[]>({
    queryKey: ['admin-affiliate-applications', appFilter],
    queryFn: () =>
      apiFetch(
        `${API}/affiliates/admin/applications${appFilter === 'ALL' ? '' : `?status=${appFilter}`}`,
        token!,
      ),
    enabled: !!token,
  });

  // Always-on count of pending applications for the badge.
  const pendingAppsQuery = useQuery<ApplicationRow[]>({
    queryKey: ['admin-affiliate-applications', 'PENDING'],
    queryFn: () => apiFetch(`${API}/affiliates/admin/applications?status=PENDING`, token!),
    enabled: !!token,
  });
  const pendingApps = pendingAppsQuery.data?.length ?? 0;

  const withdrawalsQuery = useQuery<WithdrawalRow[]>({
    queryKey: ['admin-affiliate-withdrawals', wdFilter],
    queryFn: () =>
      apiFetch(
        `${API}/affiliates/admin/withdrawals${wdFilter === 'ALL' ? '' : `?status=${wdFilter}`}`,
        token!,
      ),
    enabled: !!token,
  });

  const pendingWdQuery = useQuery<WithdrawalRow[]>({
    queryKey: ['admin-affiliate-withdrawals', 'PENDING'],
    queryFn: () => apiFetch(`${API}/affiliates/admin/withdrawals?status=PENDING`, token!),
    enabled: !!token,
  });
  const pendingWd = pendingWdQuery.data?.length ?? 0;

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch(`${API}/affiliates/admin/config`, token!, {
        method: 'PUT',
        body: JSON.stringify({
          commissionRate: Number(rate),
          cookieDays: Number(cookieDays),
          minWithdrawal: Number(minWithdrawal),
        }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-affiliate-config'] }),
  });

  const pay = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${API}/affiliates/admin/commissions/${id}/pay`, token!, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-commissions'] });
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });

  const approveApp = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${API}/affiliates/admin/applications/${id}/approve`, token!, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-affiliate-applications'] });
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });

  const rejectApp = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`${API}/affiliates/admin/applications/${id}/reject`, token!, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-affiliate-applications'] }),
  });

  const payWithdrawal = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${API}/affiliates/admin/withdrawals/${id}/pay`, token!, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-affiliate-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });

  const removeAffiliate = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${API}/affiliates/admin/${id}`, token!, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] });
      qc.invalidateQueries({ queryKey: ['admin-affiliate-applications'] });
    },
  });

  function handleRemoveAffiliate(id: string, name: string | null) {
    if (
      !window.confirm(
        `Remover o afiliado "${name ?? id}"? O código ficará inativo e a candidatura será revertida para recusada.`,
      )
    )
      return;
    removeAffiliate.mutate(id);
  }

  const rejectWithdrawal = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiFetch(`${API}/affiliates/admin/withdrawals/${id}/reject`, token!, {
        method: 'POST',
        body: JSON.stringify({ note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-affiliate-withdrawals'] });
      qc.invalidateQueries({ queryKey: ['admin-affiliates'] });
    },
  });

  function handleRejectApp(id: string) {
    const note = window.prompt('Motivo da recusa (será enviado ao afiliado):');
    if (note === null) return;
    rejectApp.mutate({ id, note: note.trim() });
  }

  function handleRejectWithdrawal(id: string) {
    const note = window.prompt('Motivo da recusa do saque:');
    if (note === null) return;
    rejectWithdrawal.mutate({ id, note: note.trim() });
  }

  const TABS: { value: Tab; label: string; badge?: number }[] = [
    { value: 'config', label: 'Configuração' },
    { value: 'commissions', label: 'Comissões' },
    { value: 'affiliates', label: 'Afiliados' },
    { value: 'applications', label: 'Solicitações', badge: pendingApps },
    { value: 'withdrawals', label: 'Saques', badge: pendingWd },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-5 text-primary" />
        <h1 className="text-xl font-bold">Afiliados</h1>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === t.value
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                {t.badge}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* Configuração */}
      {tab === 'config' && (
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Configuração do programa</h2>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Taxa de comissão (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Duração do cookie (dias)
              </label>
              <input
                type="number"
                min={1}
                max={365}
                value={cookieDays}
                onChange={(e) => setCookieDays(e.target.value)}
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Saque mínimo (R$)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={minWithdrawal}
                onChange={(e) => setMinWithdrawal(e.target.value)}
                className="w-32 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={() => saveConfig.mutate()}
              disabled={saveConfig.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              <Save className="size-4" />
              {saveConfig.isPending ? 'Salvando...' : 'Salvar'}
            </button>
            {saveConfig.isSuccess && (
              <span className="flex items-center gap-1 text-sm text-green-600">
                <Check className="size-4" /> Salvo
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            A taxa é registrada em cada venda no momento da compra — alterá-la não muda comissões já
            geradas. O saque mínimo é o valor mínimo que o afiliado precisa acumular para solicitar
            um saque.
          </p>
        </div>
      )}

      {/* Comissões */}
      {tab === 'commissions' && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <h2 className="font-semibold">Comissões</h2>
            <div className="flex gap-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    filter === f.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {commissionsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !commissionsQuery.data?.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma comissão nesta categoria.
            </p>
          ) : (
            <div className="divide-y">
              {commissionsQuery.data.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.affiliateName ?? c.affiliateEmail}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {c.affiliateCode}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Pedido #{c.orderId.slice(-8).toUpperCase()} · {c.rate}% de {fmt(c.baseAmount)}{' '}
                      · {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">{fmt(c.amount)}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[c.status].cls}`}
                      >
                        {STATUS[c.status].label}
                      </span>
                    </div>
                    {c.status === 'PENDING' && (
                      <button
                        onClick={() => pay.mutate(c.id)}
                        disabled={pay.isPending}
                        className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                      >
                        Marcar paga
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Afiliados */}
      {tab === 'affiliates' && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="border-b px-5 py-3">
            <h2 className="font-semibold">Afiliados cadastrados</h2>
          </div>
          {!affiliatesQuery.data?.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum afiliado ainda.
            </p>
          ) : (
            <div className="divide-y">
              {affiliatesQuery.data.map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <p className="font-medium">
                      {a.name ?? a.email}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">{a.code}</span>
                      {!a.isActive && (
                        <span className="ml-2 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          Inativo
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.orders} pedidos · {a.commissionsCount} comissões
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-xs">
                      <p className="text-muted-foreground">
                        Pendente:{' '}
                        <span className="font-semibold text-foreground">{fmt(a.pending)}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Pago: <span className="font-semibold text-green-600">{fmt(a.paid)}</span>
                      </p>
                    </div>
                    {a.isActive && (
                      <button
                        onClick={() => handleRemoveAffiliate(a.id, a.name)}
                        disabled={removeAffiliate.isPending}
                        title="Remover afiliado"
                        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Solicitações */}
      {tab === 'applications' && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <h2 className="font-semibold">Solicitações de afiliação</h2>
            <div className="flex gap-1">
              {APP_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setAppFilter(f.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    appFilter === f.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {applicationsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !applicationsQuery.data?.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhuma solicitação nesta categoria.
            </p>
          ) : (
            <div className="divide-y">
              {applicationsQuery.data.map((app) => (
                <div key={app.id} className="space-y-2 px-5 py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {app.fullName}
                        <span
                          className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${APP_STATUS[app.status].cls}`}
                        >
                          {APP_STATUS[app.status].label}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        CPF {app.cpf} · {app.userEmail}
                        {app.userName ? ` · ${app.userName}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Enviada em {new Date(app.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    {app.status === 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => approveApp.mutate(app.id)}
                          disabled={approveApp.isPending}
                          className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleRejectApp(app.id)}
                          disabled={rejectApp.isPending}
                          className="rounded-lg border border-destructive px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Recusar
                        </button>
                      </div>
                    )}
                  </div>
                  <SocialLinks app={app} />
                  {app.reviewNote && (
                    <p className="text-xs text-muted-foreground">
                      Motivo: <span className="text-foreground">{app.reviewNote}</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Saques */}
      {tab === 'withdrawals' && (
        <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
            <h2 className="font-semibold">Solicitações de saque</h2>
            <div className="flex gap-1">
              {WD_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setWdFilter(f.value)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                    wdFilter === f.value
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {withdrawalsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : !withdrawalsQuery.data?.length ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nenhum saque nesta categoria.
            </p>
          ) : (
            <div className="divide-y">
              {withdrawalsQuery.data.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {w.affiliateName ?? w.affiliateEmail}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {w.affiliateCode}
                      </span>
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span className="uppercase">{w.pixKeyType}</span>:{' '}
                      <span className="font-mono text-foreground">{w.pixKey}</span>
                      <CopyButton value={w.pixKey} />
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Solicitado em {new Date(w.createdAt).toLocaleDateString('pt-BR')}
                      {w.paidAt
                        ? ` · Pago em ${new Date(w.paidAt).toLocaleDateString('pt-BR')}`
                        : ''}
                    </p>
                    {w.note && (
                      <p className="text-xs text-muted-foreground">
                        Motivo: <span className="text-foreground">{w.note}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-semibold">{fmt(w.amount)}</p>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${WD_STATUS[w.status].cls}`}
                      >
                        {WD_STATUS[w.status].label}
                      </span>
                    </div>
                    {w.status === 'PENDING' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => payWithdrawal.mutate(w.id)}
                          disabled={payWithdrawal.isPending}
                          className="rounded-lg border border-green-600 px-3 py-1.5 text-xs font-semibold text-green-700 transition-colors hover:bg-green-50 disabled:opacity-50"
                        >
                          Marcar pago
                        </button>
                        <button
                          onClick={() => handleRejectWithdrawal(w.id)}
                          disabled={rejectWithdrawal.isPending}
                          className="rounded-lg border border-destructive px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                        >
                          Recusar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
