'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tag, Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  ncm?: string | null;
  showOnHome?: boolean;
  _count?: { products: number };
}

interface CategoryForm {
  name: string;
  slug: string;
  description: string;
  ncm: string;
  showOnHome: boolean;
}

const empty: CategoryForm = { name: '', slug: '', description: '', ncm: '', showOnHome: false };

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export default function AdminCategorias() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | 'delete' | null>(null);
  const [selected, setSelected] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(empty);
  const [formError, setFormError] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories', page, search],
    queryFn: () =>
      apiFetch(
        `${API}/categories?page=${page}&limit=20&search=${encodeURIComponent(search)}`,
        token!,
      ),
    enabled: !!token,
  });

  const createMutation = useMutation({
    mutationFn: (body: CategoryForm) =>
      apiFetch(`${API}/categories`, token!, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (body: CategoryForm) =>
      apiFetch(`${API}/categories/${selected!.id}`, token!, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`${API}/categories/${selected!.id}`, token!, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] });
      closeModal();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  function openCreate() {
    setForm(empty);
    setFormError('');
    setModal('create');
  }
  function openEdit(cat: Category) {
    setSelected(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      ncm: cat.ncm ?? '',
      showOnHome: cat.showOnHome ?? false,
    });
    setFormError('');
    setModal('edit');
  }
  function openDelete(cat: Category) {
    setSelected(cat);
    setFormError('');
    setModal('delete');
  }
  function closeModal() {
    setModal(null);
    setSelected(null);
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugify(name) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!form.name.trim()) return setFormError('Nome é obrigatório.');
    const body = {
      name: form.name.trim(),
      slug: form.slug || slugify(form.name),
      description: form.description || '',
      ncm: form.ncm,
      showOnHome: form.showOnHome,
    };
    if (modal === 'create') createMutation.mutate(body);
    else updateMutation.mutate(body);
  }

  const categories: Category[] = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;
  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Categorias</h1>
          {total > 0 && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {total}
            </span>
          )}
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" /> Nova Categoria
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
            placeholder="Buscar categoria..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring w-60"
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

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !categories.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhuma categoria encontrada
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Slug</th>
                <th className="px-4 py-3 font-medium">NCM</th>
                <th className="px-4 py-3 font-medium text-center">Home</th>
                <th className="px-4 py-3 font-medium text-center">Produtos</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {categories.map((cat) => (
                <tr key={cat.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-medium">{cat.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{cat.slug}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {cat.ncm ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {cat.showOnHome ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Sim
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                      {cat._count?.products ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(cat)}
                        className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => openDelete(cat)}
                        className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {total} categorias · página {page} de {totalPages}
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
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs hover:bg-muted disabled:opacity-40"
              >
                Próxima <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {(modal === 'create' || modal === 'edit') && (
        <Modal
          title={modal === 'create' ? 'Nova Categoria' : 'Editar Categoria'}
          onClose={closeModal}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Ex: Camisetas"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="ex-camisetas"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">Gerado automaticamente pelo nome</p>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">Descrição</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Descrição opcional..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium">NCM</label>
              <input
                type="text"
                value={form.ncm}
                onChange={(e) => setForm((f) => ({ ...f, ncm: e.target.value }))}
                placeholder="Ex: 6109.10.00"
                maxLength={20}
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Código NCM herdado pelos produtos desta categoria
              </p>
            </div>
            <div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.showOnHome}
                  onChange={(e) => setForm((f) => ({ ...f, showOnHome: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-xs font-medium">Exibir na página inicial</span>
              </label>
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={closeModal}
                className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === 'delete' && selected && (
        <Modal title="Excluir Categoria" onClose={closeModal}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Tem certeza que deseja excluir{' '}
              <strong className="text-foreground">&ldquo;{selected.name}&rdquo;</strong>?
              {(selected._count?.products ?? 0) > 0 && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  Esta categoria possui {selected._count!.products} produto(s) vinculado(s).
                </span>
              )}
            </p>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <button
                onClick={closeModal}
                className="flex-1 rounded-lg border py-2 text-sm hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
