'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ChevronLeft, ChevronRight, ClipboardList } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchFila, iniciarSeparacao } from '@/actions/expedicao';
import type { OrderSummary } from '@/actions/expedicao';

const DELIVERY_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'SHIPPING', label: 'Envio' },
  { value: 'PICKUP', label: 'Retirada' },
];

function shortId(id: string) {
  return '#' + id.slice(-8).toUpperCase();
}

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function PaymentBadge({ method, status }: { method: string; status: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      {method} · {status}
    </span>
  );
}

function DeliveryBadge({ method }: { method: string }) {
  if (method === 'PICKUP')
    return (
      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
        Retirada
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
      Envio
    </span>
  );
}

export default function FilaPage() {
  const { token } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['expedicao-fila', page, search, deliveryMethod],
    queryFn: () => fetchFila(token!, { page, search, deliveryMethod }),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: (orderId: string) => iniciarSeparacao(token!, orderId),
    onSuccess: (_data, orderId) => {
      qc.invalidateQueries({ queryKey: ['expedicao-fila'] });
      router.push(`/admin/expedicao/separacao/${orderId}`);
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Fila de Pedidos</h1>
      </div>

      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar pedido ou cliente..."
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
          value={deliveryMethod}
          onChange={(e) => {
            setDeliveryMethod(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {DELIVERY_OPTIONS.map((o) => (
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
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum pedido aguardando separação
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Pagamento</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Itens</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((o: OrderSummary) => (
                  <tr key={o.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-primary">{shortId(o.id)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{o.user.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{o.user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(o.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      {o.payment ? (
                        <PaymentBadge method={o.payment.method} status={o.payment.status} />
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <DeliveryBadge method={o.deliveryMethod} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {o._count.items} item{o._count.items !== 1 ? 'ns' : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-sm">{fmt(o.total)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => mutation.mutate(o.id)}
                        disabled={mutation.isPending}
                        className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                      >
                        {mutation.isPending && mutation.variables === o.id
                          ? 'Iniciando...'
                          : 'Iniciar Separação'}
                      </button>
                    </td>
                  </tr>
                ))}
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
