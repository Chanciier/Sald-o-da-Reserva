'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, Save, Check } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

type Status = 'PENDING' | 'PAID' | 'CANCELLED';

interface Config {
  commissionRate: number;
  cookieDays: number;
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

const STATUS: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  PAID: { label: 'Paga', cls: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
};

const FILTERS: { value: Status | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PENDING', label: 'Pendentes' },
  { value: 'PAID', label: 'Pagas' },
  { value: 'CANCELLED', label: 'Canceladas' },
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

export default function AdminAfiliadosPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | 'ALL'>('ALL');
  const [rate, setRate] = useState('');
  const [cookieDays, setCookieDays] = useState('');

  const configQuery = useQuery<Config>({
    queryKey: ['admin-affiliate-config'],
    queryFn: () => apiFetch(`${API}/affiliates/admin/config`, token!),
    enabled: !!token,
  });

  useEffect(() => {
    if (configQuery.data) {
      setRate(String(configQuery.data.commissionRate));
      setCookieDays(String(configQuery.data.cookieDays));
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

  const saveConfig = useMutation({
    mutationFn: () =>
      apiFetch(`${API}/affiliates/admin/config`, token!, {
        method: 'PUT',
        body: JSON.stringify({ commissionRate: Number(rate), cookieDays: Number(cookieDays) }),
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="size-5 text-primary" />
        <h1 className="text-xl font-bold">Afiliados</h1>
      </div>

      {/* Configuração */}
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
          geradas.
        </p>
      </div>

      {/* Comissões */}
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
                    Pedido #{c.orderId.slice(-8).toUpperCase()} · {c.rate}% de {fmt(c.baseAmount)} ·{' '}
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
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

      {/* Afiliados */}
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
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {a.orders} pedidos · {a.commissionsCount} comissões
                  </p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-muted-foreground">
                    Pendente:{' '}
                    <span className="font-semibold text-foreground">{fmt(a.pending)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Pago: <span className="font-semibold text-green-600">{fmt(a.paid)}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
