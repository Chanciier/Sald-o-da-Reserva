'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  RefreshCw,
  Package,
  ChevronLeft,
  ChevronRight,
  Search,
  LayoutList,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type Tab = 'todos' | 'alertas' | 'ativo';

interface Product {
  id: string;
  name: string;
  sku: string;
  stock: number;
  minimumStock: number;
  status: string;
}

interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  pages: number;
}

async function fetchProducts(
  token: string,
  page: number,
  search: string,
  status?: string,
  sortBy = 'stock',
  sortOrder = 'asc',
  limit = 25,
) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sortBy,
    sortOrder,
  });
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const res = await fetch(`${BASE}/api/v1/products?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data as ProductsResponse;
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

// ─── Aba Estoque Ativo ───────────────────────────────────────────────────────

function EstoqueAtivoTab({ token }: { token: string }) {
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['estoque-ativo', page, search],
    queryFn: () => fetchProducts(token, page, search, 'ACTIVE', 'name', 'asc', 50),
    enabled: !!token,
  });

  const products = data?.data ?? [];
  const totalUnits = products.reduce((sum, p) => sum + p.stock, 0);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LayoutList className="h-4 w-4 text-green-600" />
          <span className="text-sm font-medium text-muted-foreground">
            {isLoading
              ? '—'
              : `${data?.total ?? 0} produto${(data?.total ?? 0) !== 1 ? 's' : ''} ativo${(data?.total ?? 0) !== 1 ? 's' : ''}`}
          </span>
          {!isLoading && <span className="text-xs text-muted-foreground">·</span>}
          {!isLoading && (
            <span className="text-xs text-muted-foreground">
              {totalUnits} unidade{totalUnits !== 1 ? 's' : ''} em estoque
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-1 rounded p-1 hover:bg-muted disabled:opacity-50"
            title="Atualizar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar produto ativo..."
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
              setPage(1);
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
            <p className="text-sm text-muted-foreground">Nenhum produto ativo encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium text-right">Quantidade</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{p.name}</p>
                      {p.stock === 0 && (
                        <p className="text-xs text-red-600 font-medium">Sem estoque</p>
                      )}
                      {p.stock > 0 && p.stock <= Math.max(p.minimumStock, 5) && (
                        <p className="text-xs text-yellow-700 flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> Estoque baixo
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={`text-lg font-bold tabular-nums ${
                          p.stock === 0
                            ? 'text-red-600'
                            : p.stock <= Math.max(p.minimumStock, 5)
                              ? 'text-yellow-700'
                              : 'text-foreground'
                        }`}
                      >
                        {p.stock}
                      </span>
                      <span className="ml-1 text-xs text-muted-foreground">un.</span>
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
                ))}
              </tbody>
              {products.length > 1 && (
                <tfoot className="border-t bg-muted/20">
                  <tr>
                    <td
                      colSpan={2}
                      className="px-4 py-2 text-xs font-semibold text-muted-foreground"
                    >
                      Total na página
                    </td>
                    <td className="px-4 py-2 text-right text-xs font-bold tabular-nums">
                      {totalUnits} un.
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
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

// ─── Aba Todos / Alertas ─────────────────────────────────────────────────────

function EstoqueGeralTab({ token, lowOnly }: { token: string; lowOnly: boolean }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-estoque', page, search, lowOnly],
    queryFn: () => fetchProducts(token, page, search),
    enabled: !!token,
  });

  const products = (data?.data ?? []).filter((p) =>
    lowOnly ? p.stock <= Math.max(p.minimumStock, 5) : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
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
                {products.map((p) => {
                  const isLow = p.stock <= Math.max(p.minimumStock, 5);
                  const isEmpty = p.stock === 0;
                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-muted/20 transition-colors ${isEmpty ? 'bg-red-50/50' : isLow ? 'bg-yellow-50/50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium leading-tight">{p.name}</p>
                        {isEmpty && <p className="text-xs text-red-600 font-medium">Sem estoque</p>}
                        {!isEmpty && isLow && (
                          <p className="text-xs text-yellow-700 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Estoque baixo
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{p.sku}</td>
                      <td className="px-4 py-3">
                        <StockBar stock={p.stock} minimum={p.minimumStock} />
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{p.minimumStock}</td>
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
                })}
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function AdminEstoque() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('todos');

  const { data: alertData } = useQuery({
    queryKey: ['admin-estoque', 1, '', false],
    queryFn: () => fetchProducts(token!, 1, ''),
    enabled: !!token,
  });

  const lowCount = (alertData?.data ?? []).filter(
    (p: Product) => p.stock <= Math.max(p.minimumStock, 5),
  ).length;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">Estoque</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setActiveTab('todos')}
          className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'todos'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Todos
        </button>
        <button
          onClick={() => setActiveTab('alertas')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'alertas'
              ? 'border-yellow-500 text-yellow-700'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Alertas
          {lowCount > 0 && (
            <span className="inline-flex items-center justify-center rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-yellow-800 min-w-[1.25rem]">
              {lowCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('ativo')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'ativo'
              ? 'border-green-500 text-green-700'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <LayoutList className="h-3.5 w-3.5" />
          Estoque Ativo
        </button>
      </div>

      {token && activeTab === 'todos' && <EstoqueGeralTab token={token} lowOnly={false} />}
      {token && activeTab === 'alertas' && <EstoqueGeralTab token={token} lowOnly={true} />}
      {token && activeTab === 'ativo' && <EstoqueAtivoTab token={token} />}
    </div>
  );
}
