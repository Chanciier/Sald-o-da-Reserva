'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { SectionGate } from '@/components/admin/section-gate';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const METHOD_LABEL: Record<string, string> = {
  PIX: 'PIX',
  CREDIT_CARD: 'Cartão de Crédito',
  DEBIT_CARD: 'Cartão de Débito',
  BOLETO: 'Boleto',
};

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  AUTHORIZED: 'bg-blue-100 text-blue-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  REFUNDED: 'bg-orange-100 text-orange-800',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  AUTHORIZED: 'Autorizado',
  REJECTED: 'Recusado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Estornado',
};

const METHOD_OPTIONS = [
  { value: '', label: 'Todos os métodos' },
  { value: 'PIX', label: 'PIX' },
  { value: 'CREDIT_CARD', label: 'Cartão de Crédito' },
  { value: 'DEBIT_CARD', label: 'Cartão de Débito' },
  { value: 'BOLETO', label: 'Boleto' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'REJECTED', label: 'Recusado' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'REFUNDED', label: 'Estornado' },
];

async function fetchPayments(token: string, page: number, method: string, status: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (method) params.set('method', method);
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/api/v1/payments/admin/all?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminPagamentosPage() {
  return (
    <SectionGate section="FINANCEIRO">
      <AdminPagamentos />
    </SectionGate>
  );
}

function AdminPagamentos() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-payments', page, methodFilter, statusFilter],
    queryFn: () => fetchPayments(token!, page, methodFilter, statusFilter),
    enabled: !!token,
  });

  const totalApproved = (data?.data ?? [])
    .filter((p: { status: string }) => p.status === 'APPROVED')
    .reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Pagamentos</h1>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.total} transações nesta página ·{' '}
              <span className="text-green-700 font-medium">{fmt(totalApproved)} aprovados</span>
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <select
          value={methodFilter}
          onChange={(e) => {
            setMethodFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <DollarSign className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum pagamento encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">ID Gateway</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Método</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Valor</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map(
                  (p: {
                    id: string;
                    gatewayPaymentId: string | null;
                    method: string;
                    status: string;
                    amount: number;
                    createdAt: string;
                    order: { id: string; user: { email: string; name: string | null } } | null;
                  }) => (
                    <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs text-muted-foreground">
                          {p.gatewayPaymentId?.slice(-12) ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{p.order?.user.name ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{p.order?.user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-xs">{METHOD_LABEL[p.method] ?? p.method}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[p.status] ?? 'bg-muted'}`}
                        >
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{fmt(p.amount)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                        <p className="opacity-70">
                          {new Date(p.createdAt).toLocaleTimeString('pt-BR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        {p.order && (
                          <Link
                            href={`/pedidos/${p.order.id}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            #{p.order.id.slice(-8).toUpperCase()}
                          </Link>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} pagamentos · página {data.page} de {data.pages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Anterior
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page === data.pages}
                className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
