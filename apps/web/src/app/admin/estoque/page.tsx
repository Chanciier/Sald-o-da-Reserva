'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Package, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useSearchParams } from 'next/navigation';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchProducts(token: string, page: number, search: string, _lowOnly: boolean) {
  const params = new URLSearchParams({
    page: String(page),
    limit: '25',
    sortBy: 'stock',
    sortOrder: 'asc',
  });
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}/api/v1/products?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

function StockBar({ stock, minimum }: { stock: number; minimum: number }) {
  const threshold = Math.max(minimum, 5);
  const pct = Math.min(100, (stock / Math.max(threshold * 3, 1)) * 100);
  const color = stock === 0 ? 'bg-red-500' : stock <= threshold ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span
        className={`text-xs font-medium ${stock === 0 ? 'text-red-600' : stock <= threshold ? 'text-yellow-700' : 'text-muted-foreground'}`}
      >
        {stock}
      </span>
    </div>
  );
}

export default function AdminEstoque() {
  const { token } = useAuth();
  const searchParams = useSearchParams();
  const lowOnly = searchParams.get('filter') === 'low';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-estoque', page, search, lowOnly],
    queryFn: () => fetchProducts(token!, page, search, lowOnly),
    enabled: !!token,
  });

  const products = (data?.data ?? []).filter((p: { stock: number; minimumStock: number }) =>
    lowOnly ? p.stock <= Math.max(p.minimumStock, 5) : true,
  );

  const lowCount = (data?.data ?? []).filter(
    (p: { stock: number; minimumStock: number }) => p.stock <= Math.max(p.minimumStock, 5),
  ).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Estoque</h1>
          {lowCount > 0 && (
            <p className="text-sm text-yellow-700 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {lowCount} produto{lowCount !== 1 ? 's' : ''} com estoque baixo
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/estoque"
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${!lowOnly ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
          >
            Todos
          </Link>
          <Link
            href="/admin/estoque?filter=low"
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors flex items-center gap-1 ${lowOnly ? 'bg-yellow-500 text-white border-yellow-500' : 'hover:bg-muted'}`}
          >
            <AlertTriangle className="h-3 w-3" /> Alertas
          </Link>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
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
            placeholder="Buscar produto..."
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
        ) : !products.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {lowOnly ? 'Nenhum produto com estoque baixo.' : 'Nenhum produto encontrado.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Estoque</th>
                  <th className="px-4 py-3 font-medium">Mínimo</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map(
                  (p: {
                    id: string;
                    name: string;
                    sku: string;
                    stock: number;
                    minimumStock: number;
                    status: string;
                  }) => {
                    const isLow = p.stock <= Math.max(p.minimumStock, 5);
                    const isEmpty = p.stock === 0;
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-muted/20 transition-colors ${isEmpty ? 'bg-red-50/50' : isLow ? 'bg-yellow-50/50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium leading-tight">{p.name}</p>
                          {isEmpty && (
                            <p className="text-xs text-red-600 font-medium">Sem estoque</p>
                          )}
                          {!isEmpty && isLow && (
                            <p className="text-xs text-yellow-700 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Estoque baixo
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {p.sku}
                        </td>
                        <td className="px-4 py-3">
                          <StockBar stock={p.stock} minimum={p.minimumStock} />
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {p.minimumStock}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              p.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-800'
                                : p.status === 'OUT_OF_STOCK'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {p.status === 'ACTIVE'
                              ? 'Ativo'
                              : p.status === 'OUT_OF_STOCK'
                                ? 'Sem estoque'
                                : p.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/admin/produtos/${p.id}`}
                            className="rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                          >
                            Editar
                          </Link>
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
              {data.total} produtos · página {data.page} de {data.pages}
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
