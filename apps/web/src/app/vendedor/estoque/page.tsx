'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, RefreshCw, Package } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function fetchMyProducts(token: string) {
  const res = await fetch(`${BASE}/api/v1/products?sortBy=stock&sortOrder=asc&limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

export default function VendedorEstoque() {
  const { token } = useAuth();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['vendedor-estoque'],
    queryFn: () => fetchMyProducts(token!),
    enabled: !!token,
  });

  const products = data?.data ?? [];
  const lowStock = products.filter(
    (p: { stock: number; minimumStock: number }) => p.stock <= Math.max(p.minimumStock, 5),
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Estoque</h1>
          {lowStock.length > 0 && (
            <p className="text-sm text-yellow-700 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {lowStock.length} produto{lowStock.length !== 1 ? 's' : ''} com estoque baixo
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !products.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhum produto cadastrado</p>
            <Link
              href="/vendedor/produtos/novo"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Criar produto
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium text-center">Estoque</th>
                  <th className="px-4 py-3 font-medium text-center">Mínimo</th>
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
                    return (
                      <tr
                        key={p.id}
                        className={`hover:bg-muted/20 transition-colors ${p.stock === 0 ? 'bg-red-50/50' : isLow ? 'bg-yellow-50/50' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-medium">{p.name}</p>
                          {p.stock === 0 && (
                            <p className="text-xs text-red-600 font-medium">Sem estoque</p>
                          )}
                          {p.stock > 0 && isLow && (
                            <p className="text-xs text-yellow-700 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" /> Estoque baixo
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {p.sku}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span
                            className={`text-sm font-bold ${p.stock === 0 ? 'text-red-600' : isLow ? 'text-yellow-700' : 'text-green-700'}`}
                          >
                            {p.stock}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-muted-foreground">
                          {p.minimumStock}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/vendedor/produtos/${p.id}`}
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
      </div>
    </div>
  );
}
