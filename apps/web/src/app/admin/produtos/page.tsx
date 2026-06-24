'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, RefreshCw, ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchProducts, deleteProduct } from '@/actions/products';

const STATUS_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVE', label: 'Ativo' },
  { value: 'INACTIVE', label: 'Inativo' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'ARCHIVED', label: 'Arquivado' },
  { value: 'OUT_OF_STOCK', label: 'Sem estoque' },
];

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  INACTIVE: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  DRAFT: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  ARCHIVED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  OUT_OF_STOCK: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  DRAFT: 'Rascunho',
  ARCHIVED: 'Arquivado',
  OUT_OF_STOCK: 'Sem estoque',
};

function fmt(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function AdminProdutos() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-products', page, statusFilter, search],
    queryFn: () =>
      fetchProducts(token, {
        page: String(page),
        ...(statusFilter && { status: statusFilter }),
        ...(search && { search }),
        limit: '20',
      }),
    enabled: !!token,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProduct(token!, id),
    onSuccess: (result) => {
      setDeletingId(null);
      setFeedback({
        type: 'success',
        msg: result.archived
          ? 'Produto arquivado (possui pedidos) e removido da loja.'
          : 'Produto excluído com sucesso.',
      });
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      setTimeout(() => setFeedback(null), 6000);
    },
    onError: (err: Error) => {
      setDeletingId(null);
      setFeedback({ type: 'error', msg: err.message || 'Erro ao excluir produto.' });
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function confirmDelete(id: string) {
    if (
      window.confirm(
        'Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita.',
      )
    ) {
      setDeletingId(id);
      deleteMutation.mutate(id);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Produtos</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <Link
            href="/admin/produtos/novo"
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo produto
          </Link>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-2.5 text-sm ${
            feedback.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-destructive/30 bg-destructive/10 text-destructive'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome, SKU..."
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

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !data?.data.length ? (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
            <Link
              href="/admin/produtos/novo"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Criar primeiro produto
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium w-12" />
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                  <th className="px-4 py-3 font-medium">Preço</th>
                  <th className="px-4 py-3 font-medium">Estoque</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Criado por</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      {p.images[0] ? (
                        <Image
                          src={p.images[0].url}
                          alt={p.name}
                          width={40}
                          height={40}
                          className="h-10 w-10 rounded-lg object-cover border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">—</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight truncate max-w-[200px]">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                      {p.internalCode && (
                        <p className="text-xs text-muted-foreground">{p.internalCode}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-xs">{fmt(p.price)}</p>
                      {p.salePrice && <p className="text-xs text-green-600">{fmt(p.salePrice)}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          p.stock <= p.minimumStock ? 'text-red-600' : 'text-foreground'
                        }`}
                      >
                        {p.stock}
                      </span>
                      {p.minimumStock > 0 && (
                        <p className="text-[10px] text-muted-foreground">mín: {p.minimumStock}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[p.status] ?? 'bg-muted text-foreground'
                        }`}
                      >
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {p.createdBy?.name ?? p.createdBy?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/admin/produtos/${p.id}`}
                          className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                        >
                          <Pencil className="h-3 w-3" /> Editar
                        </Link>
                        <button
                          onClick={() => confirmDelete(p.id)}
                          disabled={deletingId === p.id}
                          className="flex items-center gap-1 rounded border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} produtos · página {data.page} de {data.totalPages}
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
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
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
