'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Truck, RefreshCw, Search, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const SHIPMENT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-800' },
  LABEL_PURCHASED: { label: 'Etiqueta gerada', cls: 'bg-blue-100 text-blue-800' },
  SHIPPED: { label: 'Enviado', cls: 'bg-indigo-100 text-indigo-800' },
  IN_TRANSIT: { label: 'Em trânsito', cls: 'bg-purple-100 text-purple-800' },
  DELIVERED: { label: 'Entregue', cls: 'bg-green-100 text-green-800' },
  CANCELLED: { label: 'Cancelado', cls: 'bg-red-100 text-red-800' },
};

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
  return data;
}

export default function AdminFretes() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-fretes', page, search],
    queryFn: () => fetchOrders(token!, page, '', search),
    enabled: !!token,
  });

  const orders = (data?.data ?? []).filter((o: { shipment: unknown }) => o.shipment !== null);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Fretes & Envios</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput);
          setPage(1);
        }}
        className="flex gap-2"
      >
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por cliente ou pedido..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 w-64 rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-lg bg-primary px-3 text-sm text-primary-foreground"
        >
          Buscar
        </button>
        {search && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setSearchInput('');
            }}
            className="h-9 rounded-lg border px-3 text-sm hover:bg-muted"
          >
            Limpar
          </button>
        )}
      </form>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !orders.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Truck className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum envio encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Transportadora</th>
                  <th className="px-4 py-3 font-medium">Rastreio</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map(
                  (o: {
                    id: string;
                    user: { name: string | null; email: string } | null;
                    shipment: {
                      carrier: string;
                      service: string;
                      trackingCode: string | null;
                      status: string;
                      labelUrl: string | null;
                    };
                    createdAt: string;
                  }) => {
                    const s = SHIPMENT_STATUS[o.shipment.status] ?? {
                      label: o.shipment.status,
                      cls: 'bg-muted text-muted-foreground',
                    };
                    return (
                      <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <Link
                            href={`/pedidos/${o.id}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            #{o.id.slice(-8).toUpperCase()}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium leading-tight">{o.user?.name ?? '—'}</p>
                          <p className="text-xs text-muted-foreground">{o.user?.email}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <p className="font-medium">{o.shipment.carrier || '—'}</p>
                          <p className="text-muted-foreground">{o.shipment.service}</p>
                        </td>
                        <td className="px-4 py-3">
                          {o.shipment.trackingCode ? (
                            <span className="font-mono text-xs">{o.shipment.trackingCode}</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${s.cls}`}
                          >
                            {s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 flex gap-1.5">
                          <Link
                            href={`/pedidos/${o.id}`}
                            className="rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                          >
                            Ver
                          </Link>
                          {o.shipment.labelUrl && (
                            <a
                              href={o.shipment.labelUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" /> Etiqueta
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}

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
