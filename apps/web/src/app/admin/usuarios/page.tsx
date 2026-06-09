'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, RefreshCw, ChevronLeft, ChevronRight, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const ROLE_OPTIONS = [
  { value: '', label: 'Todos os perfis' },
  { value: 'CLIENTE', label: 'Clientes' },
  { value: 'VENDEDOR', label: 'Vendedores' },
  { value: 'ADMIN', label: 'Administradores' },
];

const ROLE_BADGE: Record<string, string> = {
  ADMIN: 'bg-red-100 text-red-800',
  VENDEDOR: 'bg-blue-100 text-blue-800',
  CLIENTE: 'bg-green-100 text-green-800',
};

interface User {
  id: string;
  email: string;
  name: string | null;
  role: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
  isActive: boolean;
  createdAt: string;
}

interface UsersResponse {
  data: User[];
  total: number;
  page: number;
  pages: number;
}

async function fetchUsers(token: string, page: number, role: string, search: string) {
  const params = new URLSearchParams({ page: String(page) });
  if (role) params.set('role', role);
  if (search) params.set('search', search);
  const res = await fetch(`${BASE}/api/v1/admin/rbac/users?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data as UsersResponse;
}

async function assignRole(token: string, userId: string, role: string) {
  const res = await fetch(`${BASE}/api/v1/admin/rbac/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ role }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? 'Erro');
  return data;
}

export default function AdminUsuarios() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-users', page, roleFilter, search],
    queryFn: () => fetchUsers(token!, page, roleFilter, search),
    enabled: !!token,
  });

  const mutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      assignRole(token!, userId, role),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      setNotice({
        type: 'success',
        msg: 'Perfil atualizado. O usuário será desconectado automaticamente e precisará fazer login novamente para as alterações entrarem em vigor.',
      });
      setTimeout(() => setNotice(null), 8000);
    },
    onError: (err: Error) => {
      setNotice({ type: 'error', msg: err.message ?? 'Erro ao atualizar perfil.' });
      setTimeout(() => setNotice(null), 5000);
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {notice.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Usuários</h1>
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
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail..."
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
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ROLE_OPTIONS.map((o) => (
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
            Nenhum usuário encontrado
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Usuário</th>
                  <th className="px-4 py-3 font-medium">Perfil</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Cadastro</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium leading-tight">{u.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {editingId === u.id ? (
                        <select
                          defaultValue={u.role}
                          onChange={(e) => mutation.mutate({ userId: u.id, role: e.target.value })}
                          className="rounded border bg-background px-1.5 py-1 text-xs focus:outline-none"
                          disabled={mutation.isPending}
                        >
                          {['CLIENTE', 'VENDEDOR', 'ADMIN'].map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_BADGE[u.role] ?? 'bg-muted'}`}
                        >
                          {u.role}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                      >
                        {u.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                        className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted transition-colors"
                      >
                        <Shield className="h-3 w-3" />
                        {editingId === u.id ? 'Cancelar' : 'Alterar perfil'}
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
              {data.total} usuários · página {data.page} de {data.pages}
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
