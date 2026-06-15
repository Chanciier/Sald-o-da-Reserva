'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { Loader2, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface WhatsappGroup {
  id: string;
  name: string;
  groupId: string;
  active: boolean;
  createdAt: string;
}

interface GroupForm {
  name: string;
  groupId: string;
  active: boolean;
}

const emptyForm: GroupForm = { name: '', groupId: '', active: true };

export default function AdminWhatsappPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  const { data: groups = [], isLoading } = useQuery<WhatsappGroup[]>({
    queryKey: ['whatsapp-groups-admin'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/groups`, { headers: headers() });
      if (!res.ok) throw new Error('Erro ao carregar grupos');
      return res.json();
    },
    enabled: !!token,
  });

  const save = useMutation({
    mutationFn: async () => {
      const url = editingId
        ? `${BASE}/api/v1/whatsapp/groups/${editingId}`
        : `${BASE}/api/v1/whatsapp/groups`;
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: headers(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Erro ao salvar grupo');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-groups-admin'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-groups'] });
      setForm(emptyForm);
      setEditingId(null);
      setError('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/groups/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Erro ao remover grupo');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-groups-admin'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-groups'] });
    },
  });

  function startEdit(g: WhatsappGroup) {
    setEditingId(g.id);
    setForm({ name: g.name, groupId: g.groupId, active: g.active });
    setError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError('');
  }

  const inputCls =
    'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Grupos WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie os grupos para publicação automática de produtos.
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold">{editingId ? 'Editar Grupo' : 'Adicionar Grupo'}</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Nome do Grupo *
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className={inputCls}
              placeholder="Ex: Principal, VIP, Promoções"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Group ID (JID) *
            </label>
            <input
              value={form.groupId}
              onChange={(e) => setForm((p) => ({ ...p, groupId: e.target.value }))}
              className={inputCls}
              placeholder="120363XXXXXXXXX@g.us"
            />
            <p className="mt-0.5 text-xs text-muted-foreground">
              Obtido via Evolution API: <code className="font-mono">GET /group/fetchAllGroups</code>
            </p>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm">Grupo ativo</span>
        </label>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending || !form.name || !form.groupId}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-colors"
          >
            {save.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {editingId ? 'Salvar' : 'Adicionar'}
          </button>
          {editingId && (
            <button
              onClick={cancelEdit}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nenhum grupo cadastrado.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nome</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden sm:table-cell">
                  Group ID
                </th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id} className="border-b last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{g.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                    {g.groupId}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {g.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <Check className="h-3 w-3" /> Ativo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        <X className="h-3 w-3" /> Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(g)}
                        className="rounded-md p-1.5 hover:bg-muted transition-colors"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm('Remover este grupo?')) remove.mutate(g.id);
                        }}
                        className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="text-sm font-semibold mb-2">Como obter o Group ID</h3>
        <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
          <li>Acesse a Evolution API com sua instância configurada</li>
          <li>
            Execute{' '}
            <code className="font-mono bg-muted px-1 rounded">
              GET /group/fetchAllGroups/{'{instance}'}
            </code>
          </li>
          <li>
            Copie o campo <code className="font-mono bg-muted px-1 rounded">id</code> do grupo
            desejado (formato:{' '}
            <code className="font-mono bg-muted px-1 rounded">120363XXX@g.us</code>)
          </li>
          <li>Cole no campo &quot;Group ID&quot; acima</li>
        </ol>
      </div>
    </div>
  );
}
