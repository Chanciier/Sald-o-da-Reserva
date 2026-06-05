'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'PENDING', label: 'Pendente' },
  { value: 'CONFIRMED', label: 'Confirmado' },
  { value: 'PAID', label: 'Pago' },
  { value: 'SHIPPED', label: 'Enviado' },
  { value: 'DELIVERED', label: 'Entregue' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'REFUNDED', label: 'Reembolsado' },
];

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  CONFIRMED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  SHIPPED: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  DELIVERED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  CANCELLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  REFUNDED: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

interface OrdersResponse {
  data: Order[];
  total: number;
  page: number;
  pages: number;
}

interface Order {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  discount: number;
  shipping: number;
  createdAt: string;
  user: { id: string; name: string | null; email: string } | null;
  payment: { method: string; status: string } | null;
  shipment: { status: string; carrier: string; trackingCode: string | null } | null;
  coupon: { code: string } | null;
  items: { name: string; quantity: number; subtotal: number }[];
}

async function fetchOrders(token: string, page: number, status: string, search: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (status) params.set('status', status);
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}/api/v1/orders/admin/all?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data as OrdersResponse;
}

async function patchStatus(token: string, orderId: string, status: string) {
  const res = await fetch(`${BASE}/api/v1/orders/admin/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminPedidos() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-orders', page, statusFilter, search],
    queryFn: () => fetchOrders(token!, page, statusFilter, search),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      patchStatus(token!, orderId, status),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleStatusFilter(value: string) {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Pedidos</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por cliente ou ID..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-64"
            />
          </div>
          <button
            type="submit"
            className="h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground hover:opacity-90"
          >
            Buscar
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setPage(1);
              }}
              className="h-9 rounded-lg border px-3 text-sm hover:bg-muted"
            >
              Limpar
            </button>
          )}
        </form>

        <select
          value={statusFilter}
          onChange={(e) => handleStatusFilter(e.target.value)}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum pedido encontrado
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Pagamento</th>
                  <th className="px-4 py-3 font-medium">Envio</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <Link
                        href={`/pedidos/${o.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        #{o.id.slice(-8).toUpperCase()}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {o.items.length} item{o.items.length !== 1 ? 'ns' : ''}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{o.user?.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{o.user?.email}</p>
                    </td>

                    <td className="px-4 py-3">
                      {editingId === o.id ? (
                        <select
                          defaultValue={o.status}
                          onChange={(e) =>
                            mutation.mutate({ orderId: o.id, status: e.target.value })
                          }
                          className="rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                          disabled={mutation.isPending}
                        >
                          {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          onClick={() => setEditingId(o.id)}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer hover:opacity-80 ${STATUS_COLOR[o.status] ?? 'bg-muted text-foreground'}`}
                          title="Clique para alterar"
                        >
                          {STATUS_OPTIONS.find((s) => s.value === o.status)?.label ?? o.status}
                        </button>
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {o.payment ? (
                        <>
                          <p>{o.payment.method}</p>
                          <p className="opacity-70">{o.payment.status}</p>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {o.shipment ? (
                        <>
                          <p>{o.shipment.carrier || o.shipment.status}</p>
                          {o.shipment.trackingCode && (
                            <p className="font-mono opacity-70">{o.shipment.trackingCode}</p>
                          )}
                        </>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-3 text-right font-semibold">{fmt(o.total)}</td>

                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                      <p className="opacity-70">
                        {new Date(o.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </td>

                    <td className="px-4 py-3">
                      <Link
                        href={`/pedidos/${o.id}`}
                        className="rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} pedidos · página {data.page} de {data.pages}
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
