'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  AlertTriangle,
  Copy,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { AnalyticsSection } from './analytics-section';
import {
  type CommunityGroup,
  type DashboardResponse,
  type WaGroup,
  STATUS_LABEL,
  STATUS_STYLE,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface GroupForm {
  name: string;
  inviteLink: string;
  groupJid: string;
  capacity: number;
  participants: number;
  priority: number;
  active: boolean;
  paused: boolean;
}

const emptyForm: GroupForm = {
  name: '',
  inviteLink: '',
  groupJid: '',
  capacity: 1024,
  participants: 0,
  priority: 0,
  active: true,
  paused: false,
};

function formatSync(iso: string | null): string {
  if (!iso) return 'nunca';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminComunidadePage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkStatus, setLinkStatus] = useState<'idle' | 'loading' | 'manual'>('idle');

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['community-dashboard'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/community/admin/groups`, { headers: headers() });
      if (!res.ok) throw new Error('Erro ao carregar grupos');
      return res.json() as Promise<DashboardResponse>;
    },
    refetchInterval: 30_000,
  });

  const { data: waGroups } = useQuery({
    queryKey: ['community-wa-groups'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/community/admin/wa-groups`, { headers: headers() });
      if (!res.ok) return [] as WaGroup[];
      return res.json() as Promise<WaGroup[]>;
    },
    enabled: !!data?.whatsappConnected && showForm,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['community-dashboard'] });
    void qc.invalidateQueries({ queryKey: ['community-analytics'] });
  };

  const syncNow = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/community/admin/sync`, {
        method: 'POST',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Falha na sincronização');
    },
    onSettled: invalidate,
  });

  const saveGroup = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        inviteLink: form.inviteLink.trim(),
        capacity: form.capacity,
        participants: form.participants,
        priority: form.priority,
        active: form.active,
        status: form.paused ? 'PAUSED' : 'ACTIVE',
      };
      const jid = form.groupJid.trim();
      if (jid) payload.groupJid = jid;
      else if (editingId) payload.groupJid = null;

      const res = await fetch(
        editingId
          ? `${BASE}/api/v1/community/admin/groups/${editingId}`
          : `${BASE}/api/v1/community/admin/groups`,
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: headers(),
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
        const msg = Array.isArray(body.message) ? body.message[0] : body.message;
        throw new Error(msg ?? 'Erro ao salvar grupo');
      }
    },
    onSuccess: () => {
      setShowForm(false);
      setForm(emptyForm);
      setEditingId(null);
      setError('');
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteGroup = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/v1/community/admin/groups/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Erro ao excluir');
    },
    onSuccess: invalidate,
  });

  function startEdit(g: CommunityGroup) {
    setForm({
      name: g.name,
      inviteLink: g.inviteLink,
      groupJid: g.groupJid ?? '',
      capacity: g.capacity,
      participants: g.participants,
      priority: g.priority,
      active: g.active,
      paused: g.status === 'PAUSED',
    });
    setEditingId(g.id);
    setError('');
    setLinkStatus('idle');
    setShowForm(true);
  }

  // Ao selecionar um grupo do WhatsApp: preenche nome/participantes (se
  // vazios) e tenta buscar o link de convite automaticamente. Só funciona
  // se o número do site for admin do grupo — senão cai para preenchimento
  // manual (o link já digitado, se houver, não é apagado).
  async function handleSelectWaGroup(jid: string) {
    const wa = waGroups?.find((w) => w.id === jid);
    setForm((prev) => ({
      ...prev,
      groupJid: jid,
      name: jid && wa && !prev.name.trim() ? wa.subject : prev.name,
      participants: wa ? wa.size : prev.participants,
    }));
    setLinkStatus('idle');
    if (!jid) return;

    setLinkStatus('loading');
    try {
      const res = await fetch(
        `${BASE}/api/v1/community/admin/wa-groups/${encodeURIComponent(jid)}/invite-link`,
        { headers: headers() },
      );
      const body = (await res.json().catch(() => ({}))) as { inviteLink?: string | null };
      if (res.ok && body.inviteLink) {
        setForm((prev) => ({ ...prev, inviteLink: body.inviteLink as string }));
        setLinkStatus('idle');
      } else {
        setLinkStatus('manual');
      }
    } catch {
      setLinkStatus('manual');
    }
  }

  async function copyPublicLink() {
    const url = `${window.location.origin}/grupos`;
    await navigator.clipboard.writeText(url).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totals = data
    ? {
        participants: data.groups.reduce((sum, g) => sum + g.participants, 0),
        capacity: data.groups.reduce((sum, g) => (g.active ? sum + g.capacity : sum), 0),
      }
    : null;

  const inputCls =
    'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Hub de Grupos WhatsApp</h1>
          <p className="text-sm text-gray-500">
            Link único que distribui novos membros para o grupo com mais vaga.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void copyPublicLink()}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <Copy className="h-4 w-4" />
            {copied ? 'Copiado!' : 'Copiar link único'}
          </button>
          <button
            onClick={() => syncNow.mutate()}
            disabled={syncNow.isPending || !data?.whatsappConnected}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            title={
              data?.whatsappConnected ? 'Buscar totais no WhatsApp agora' : 'WhatsApp desconectado'
            }
          >
            <RefreshCw className={`h-4 w-4 ${syncNow.isPending ? 'animate-spin' : ''}`} />
            Sincronizar
          </button>
          <button
            onClick={() => {
              setForm(emptyForm);
              setEditingId(null);
              setError('');
              setLinkStatus('idle');
              setShowForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            Novo grupo
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <div
          className={`h-2.5 w-2.5 rounded-full ${data?.whatsappConnected ? 'bg-green-500' : 'bg-red-400'}`}
        />
        <span className="text-gray-600">
          {data?.whatsappConnected
            ? 'WhatsApp conectado — sincronização automática a cada 10 minutos'
            : 'WhatsApp desconectado — usando últimos dados sincronizados (conecte em Marketing → Grupos WhatsApp)'}
        </span>
        {data?.lastSync && (
          <span className="text-gray-400">
            · última sync {formatSync(data.lastSync.finishedAt)}
          </span>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      )}

      {totals && data && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold">{data.groups.filter((g) => g.active).length}</p>
            <p className="text-xs text-gray-500">Grupos ativos</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold">{totals.participants}</p>
            <p className="text-xs text-gray-500">Participantes</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold">{totals.capacity}</p>
            <p className="text-xs text-gray-500">Capacidade total</p>
          </div>
          <div className="rounded-xl border bg-white p-4">
            <p className="text-2xl font-bold">
              {totals.capacity > 0 ? Math.round((totals.participants / totals.capacity) * 100) : 0}%
            </p>
            <p className="text-xs text-gray-500">Ocupação geral</p>
          </div>
        </div>
      )}

      {data && (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs text-gray-500">
                <th className="px-4 py-3 font-medium">Grupo</th>
                <th className="px-4 py-3 font-medium">Ocupação</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Prioridade</th>
                <th className="px-4 py-3 font-medium">Última sync</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.groups.map((g) => (
                <tr key={g.id} className={`border-b last:border-0 ${g.active ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      {g.name}
                      {data.recommendedGroupId === g.id && (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"
                          title="Grupo que receberá o próximo novo membro"
                        >
                          <Star className="h-3 w-3" /> Recomendado
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                      <Link2 className="h-3 w-3" />
                      {g.groupJid ?? 'sem vínculo — contagem manual'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="mb-1 text-xs">
                      {g.participants}
                      {g.pendingJoins > 0 && (
                        <span className="text-gray-400"> (+{g.pendingJoins} a caminho)</span>
                      )}{' '}
                      / {g.capacity} · {g.occupancyPct}%
                    </div>
                    <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                      <div
                        className={`h-full rounded-full ${
                          g.occupancyPct >= 100
                            ? 'bg-red-500'
                            : g.occupancyPct >= 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, g.occupancyPct)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[g.status]}`}
                    >
                      {STATUS_LABEL[g.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{g.priority}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    <div className="flex items-center gap-1.5">
                      {formatSync(g.lastSyncAt)}
                      {g.syncError && (
                        <span title={g.syncError}>
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => startEdit(g)}
                        className="rounded-lg p-2 hover:bg-gray-100"
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Excluir o grupo "${g.name}" do hub?`))
                            deleteGroup.mutate(g.id);
                        }}
                        className="rounded-lg p-2 hover:bg-red-50"
                        title="Excluir"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    Nenhum grupo cadastrado. Clique em &quot;Novo grupo&quot; para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {token && <AnalyticsSection token={token} />}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{editingId ? 'Editar grupo' : 'Novo grupo'}</h2>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">Nome</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Saldão VIP 01"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600">
                  Grupo do WhatsApp (sincronização automática)
                </label>
                {waGroups && waGroups.length > 0 ? (
                  <select
                    value={form.groupJid}
                    onChange={(e) => void handleSelectWaGroup(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— sem vínculo (contagem manual) —</option>
                    {waGroups.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.subject} ({w.size} participantes)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={form.groupJid}
                    onChange={(e) => setForm({ ...form, groupJid: e.target.value })}
                    placeholder="123456789@g.us (opcional)"
                    className={inputCls}
                  />
                )}
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs font-medium text-gray-600">
                  <span>Link de convite</span>
                  {linkStatus === 'loading' && (
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> buscando automaticamente...
                    </span>
                  )}
                </label>
                <input
                  value={form.inviteLink}
                  onChange={(e) => setForm({ ...form, inviteLink: e.target.value })}
                  placeholder="https://chat.whatsapp.com/..."
                  className={inputCls}
                />
                {linkStatus === 'manual' && (
                  <p className="mt-1 flex items-start gap-1 text-xs text-amber-600">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    Não consegui obter o link automaticamente — o número do site precisa ser admin
                    do grupo para isso. Copie o link de convite no próprio WhatsApp e cole aqui.
                  </p>
                )}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Capacidade</label>
                  <input
                    type="number"
                    min={1}
                    value={form.capacity}
                    onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">
                    Participantes
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.participants}
                    onChange={(e) => setForm({ ...form, participants: Number(e.target.value) })}
                    disabled={!!form.groupJid}
                    title={form.groupJid ? 'Atualizado automaticamente pela sincronização' : ''}
                    className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400`}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Prioridade</label>
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="flex gap-6 pt-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Ativo
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.paused}
                    onChange={(e) => setForm({ ...form, paused: e.target.checked })}
                  />
                  Pausar distribuição
                </label>
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => saveGroup.mutate()}
                  disabled={saveGroup.isPending || !form.name.trim() || !form.inviteLink.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {saveGroup.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
