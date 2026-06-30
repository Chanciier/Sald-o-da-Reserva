'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  RefreshCw,
  Clock,
  Send,
} from 'lucide-react';

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

interface ContentHistory {
  id: string;
  productId: string;
  content: string;
  edited: boolean;
  sent: boolean;
  createdAt: string;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  salePrice?: number;
  stock: number;
  description?: string;
  brand?: string;
  category?: { name: string };
}

interface BroadcastStatus {
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  remaining: number;
  nextAt: string | null;
  lastProductName: string | null;
  startedAt: string;
  finishedAt: string | null;
  intervalMin: number;
}

interface BroadcastDay {
  dayOfWeek: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
  intervalMin: number;
}

const DAY_NAMES = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DEFAULT_SCHEDULE: BroadcastDay[] = DAY_NAMES.map((_, dayOfWeek) => ({
  dayOfWeek,
  enabled: dayOfWeek >= 1 && dayOfWeek <= 5,
  startTime: '09:00',
  endTime: '18:00',
  intervalMin: 10,
}));

function minutesUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000));
}

const emptyForm: GroupForm = { name: '', groupId: '', active: true };

function WhatsappStatusBanner({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/v1/whatsapp/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return r.json() as Promise<{ connected: boolean; qr: string | null }>;
    },
    refetchInterval: 5000,
  });

  const logout = useMutation({
    mutationFn: async () => {
      await fetch(`${BASE}/api/v1/whatsapp/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-status'] }),
  });

  if (isLoading) return null;

  return (
    <div className="mb-6 rounded-xl border p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${data?.connected ? 'bg-green-500' : 'bg-red-400'}`}
          />
          <span className="font-medium text-sm">
            {data?.connected ? 'WhatsApp Conectado' : 'WhatsApp Desconectado'}
          </span>
        </div>
        {data?.connected && (
          <button onClick={() => logout.mutate()} className="text-xs text-red-500 hover:underline">
            Deslogar
          </button>
        )}
      </div>
      {!data?.connected && data?.qr && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-gray-500">Escaneie o QR com o WhatsApp do celular:</p>
          <Image
            src={data.qr}
            alt="QR Code WhatsApp"
            width={192}
            height={192}
            unoptimized
            className="w-48 h-48"
          />
        </div>
      )}
      {!data?.connected && !data?.qr && (
        <p className="text-sm text-gray-400">Aguardando QR code... (atualiza automaticamente)</p>
      )}
    </div>
  );
}

export default function AdminWhatsappPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'grupos' | 'conteudo'>('grupos');

  // --- Grupos state ---
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState('');
  const [showWaGroups, setShowWaGroups] = useState(false);

  // --- Broadcast state ---
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<BroadcastDay[]>(DEFAULT_SCHEDULE);

  // --- Conteúdo state ---
  const [selectedProductId, setSelectedProductId] = useState('');
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  // Grupos
  const { data: groups = [], isLoading: groupsLoading } = useQuery<WhatsappGroup[]>({
    queryKey: ['whatsapp-groups-admin'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/groups`, { headers: headers() });
      if (!res.ok) throw new Error('Erro ao carregar grupos');
      return res.json();
    },
    enabled: !!token,
  });

  // Grupos reais do WhatsApp (via Baileys no número conectado)
  const {
    data: waGroups = [],
    isLoading: waGroupsLoading,
    error: waGroupsError,
    refetch: refetchWaGroups,
  } = useQuery<{ id: string; subject: string }[]>({
    queryKey: ['whatsapp-wa-groups'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/wa-groups`, { headers: headers() });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Erro ao buscar grupos do WhatsApp');
      }
      return res.json();
    },
    enabled: !!token && showWaGroups,
    retry: false,
  });

  const saveGroup = useMutation({
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
      setGroupError('');
    },
    onError: (e: Error) => setGroupError(e.message),
  });

  const removeGroup = useMutation({
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

  // Produtos para seleção
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-simple'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/products?limit=200&status=ACTIVE`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error('Erro ao carregar produtos');
      const data = await res.json();
      return data.data ?? data;
    },
    enabled: !!token && tab === 'conteudo',
  });

  // Histórico do produto selecionado
  const { data: history = [], isLoading: historyLoading } = useQuery<ContentHistory[]>({
    queryKey: ['whatsapp-content', selectedProductId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/content/${selectedProductId}`, {
        headers: headers(),
      });
      if (!res.ok) throw new Error('Erro ao carregar histórico');
      return res.json();
    },
    enabled: !!token && !!selectedProductId,
  });

  const generateContent = useMutation({
    mutationFn: async () => {
      const product = products.find((p) => p.id === selectedProductId);
      if (!product) throw new Error('Produto não encontrado');
      const res = await fetch(`${BASE}/api/v1/whatsapp/content/generate`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          productId: product.id,
          name: product.name,
          category: product.category?.name,
          brand: product.brand,
          price: product.price,
          salePrice: product.salePrice,
          stock: product.stock,
          description: product.description,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Erro ao gerar conteúdo');
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-content', selectedProductId] }),
  });

  // Status da campanha de disparo (1 produto a cada 10 min). Faz polling para
  // a barra de progresso andar sozinha enquanto o ciclo roda em segundo plano.
  const { data: broadcastStatus } = useQuery<BroadcastStatus | null>({
    queryKey: ['whatsapp-broadcast-status'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/broadcast-active/status`, {
        headers: headers(),
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15000,
  });

  const broadcastRunning = !!broadcastStatus?.running;

  const broadcastActive = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/broadcast-active`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ days: schedule }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? 'Erro ao iniciar repostagem');
      }
      return res.json();
    },
    onSuccess: () => {
      setBroadcastResult('Rotina de disparo iniciada com sucesso.');
      qc.invalidateQueries({ queryKey: ['whatsapp-broadcast-status'] });
    },
    onError: (e: Error) => setBroadcastResult(`Erro: ${e.message}`),
  });

  const cancelBroadcast = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/broadcast-active/cancel`, {
        method: 'POST',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Erro ao cancelar disparo');
      return res.json();
    },
    onSuccess: () => {
      setBroadcastResult('Disparo cancelado.');
      qc.invalidateQueries({ queryKey: ['whatsapp-broadcast-status'] });
    },
    onError: (e: Error) => setBroadcastResult(`Erro: ${e.message}`),
  });

  const saveContent = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/content/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error('Erro ao salvar');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-content', selectedProductId] });
      setEditingContentId(null);
      setEditingText('');
    },
  });

  const deleteContent = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/content/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error('Erro ao remover');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp-content', selectedProductId] }),
  });

  const inputCls =
    'w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">WhatsApp Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie grupos e conteúdo gerado por IA para publicações.
        </p>
      </div>
      <WhatsappStatusBanner token={token ?? ''} />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {(['grupos', 'conteudo'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'grupos' ? 'Grupos' : 'Conteúdo IA'}
          </button>
        ))}
      </div>

      {/* === TAB GRUPOS === */}
      {tab === 'grupos' && (
        <>
          {/* Repostagem em massa (espaçada: 1 produto a cada 10 min) */}
          <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Rotina de disparo de produtos</p>
                <p className="text-xs text-muted-foreground">
                  Escolha os dias, a janela diária e o intervalo entre os disparos.
                </p>
                {broadcastResult && !broadcastRunning && (
                  <p
                    className={`mt-1 text-xs ${broadcastResult.startsWith('Erro') ? 'text-destructive' : 'text-green-600'}`}
                  >
                    {broadcastResult}
                  </p>
                )}
              </div>
              {broadcastRunning ? (
                <button
                  onClick={() => cancelBroadcast.mutate()}
                  disabled={cancelBroadcast.isPending}
                  className="flex shrink-0 items-center gap-2 rounded-lg border border-destructive/40 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/5 disabled:opacity-60 transition-colors"
                >
                  {cancelBroadcast.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <X className="h-4 w-4" />
                  )}
                  Cancelar disparo
                </button>
              ) : (
                <button
                  onClick={() => {
                    setBroadcastResult(null);
                    broadcastActive.mutate();
                  }}
                  disabled={broadcastActive.isPending}
                  className="flex shrink-0 items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60 transition-colors"
                >
                  {broadcastActive.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Iniciar rotina
                </button>
              )}
            </div>

            {!broadcastRunning && (
              <div className="overflow-x-auto rounded-lg border">
                <div className="min-w-[620px]">
                  <div className="grid grid-cols-[80px_1fr_1fr_1fr] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground">
                    <span>Dia</span>
                    <span>Início</span>
                    <span>Fim</span>
                    <span>Intervalo (min)</span>
                  </div>
                  {schedule.map((day, index) => (
                    <div
                      key={day.dayOfWeek}
                      className="grid grid-cols-[80px_1fr_1fr_1fr] items-center gap-3 border-b px-3 py-2 last:border-0"
                    >
                      <label className="flex items-center gap-2 text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={day.enabled}
                          onChange={(event) =>
                            setSchedule((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, enabled: event.target.checked }
                                  : item,
                              ),
                            )
                          }
                        />
                        {DAY_NAMES[day.dayOfWeek]}
                      </label>
                      <input
                        type="time"
                        value={day.startTime}
                        disabled={!day.enabled}
                        onChange={(event) =>
                          setSchedule((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, startTime: event.target.value }
                                : item,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                      <input
                        type="time"
                        value={day.endTime}
                        disabled={!day.enabled}
                        onChange={(event) =>
                          setSchedule((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? { ...item, endTime: event.target.value } : item,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={day.intervalMin}
                        disabled={!day.enabled}
                        onChange={(event) =>
                          setSchedule((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, intervalMin: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Barra de progresso do ciclo */}
            {broadcastStatus && broadcastStatus.total > 0 && (
              <div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-green-600 transition-all duration-500"
                    style={{
                      width: `${Math.round(((broadcastStatus.sent + broadcastStatus.failed) / broadcastStatus.total) * 100)}%`,
                    }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {broadcastStatus.sent + broadcastStatus.failed} de {broadcastStatus.total}{' '}
                    enviados
                    {broadcastStatus.failed > 0 && ` · ${broadcastStatus.failed} falha(s)`}
                  </span>
                  {broadcastRunning && broadcastStatus.nextAt ? (
                    <span>próximo em ~{minutesUntil(broadcastStatus.nextAt)} min</span>
                  ) : (
                    <span className="text-green-600">✓ ciclo concluído</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold">
              {editingId ? 'Editar Grupo' : 'Adicionar Grupo'}
            </h2>
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
                  Use o botão abaixo para listar os grupos do WhatsApp conectado.
                </p>
              </div>
            </div>

            {/* Buscar grupos do WhatsApp */}
            <div className="rounded-lg border border-dashed bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  Grupos do número conectado
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (showWaGroups) refetchWaGroups();
                    else setShowWaGroups(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors cursor-pointer"
                >
                  {waGroupsLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Buscar grupos do WhatsApp
                </button>
              </div>

              {showWaGroups && waGroupsError && (
                <p className="text-xs text-destructive">
                  {(waGroupsError as Error).message}. Confira se o WhatsApp está conectado acima.
                </p>
              )}

              {showWaGroups && !waGroupsLoading && !waGroupsError && waGroups.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhum grupo encontrado neste número.
                </p>
              )}

              {showWaGroups && waGroups.length > 0 && (
                <div className="max-h-64 overflow-y-auto rounded-md border bg-card divide-y">
                  {waGroups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() =>
                        setForm((p) => ({
                          ...p,
                          name: p.name || g.subject,
                          groupId: g.id,
                        }))
                      }
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors cursor-pointer"
                    >
                      <span className="font-medium truncate">{g.subject}</span>
                      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                        {g.id}
                      </span>
                    </button>
                  ))}
                </div>
              )}
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
            {groupError && <p className="text-xs text-destructive">{groupError}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => saveGroup.mutate()}
                disabled={saveGroup.isPending || !form.name || !form.groupId}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-colors"
              >
                {saveGroup.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {editingId ? 'Salvar' : 'Adicionar'}
              </button>
              {editingId && (
                <button
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                    setGroupError('');
                  }}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {groupsLoading ? (
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
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Ações
                    </th>
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
                            onClick={() => {
                              setEditingId(g.id);
                              setForm({ name: g.name, groupId: g.groupId, active: g.active });
                              setGroupError('');
                            }}
                            className="rounded-md p-1.5 hover:bg-muted transition-colors"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Remover este grupo?')) removeGroup.mutate(g.id);
                            }}
                            className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
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
                (formato: <code className="font-mono bg-muted px-1 rounded">120363XXX@g.us</code>)
              </li>
              <li>Cole no campo &quot;Group ID&quot; acima</li>
            </ol>
          </div>
        </>
      )}

      {/* === TAB CONTEÚDO IA === */}
      {tab === 'conteudo' && (
        <div className="space-y-4">
          {/* Seleção de produto */}
          <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Gerador de Anúncio com IA
            </h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Produto
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Selecione um produto...</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => generateContent.mutate()}
                disabled={!selectedProductId || generateContent.isPending}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {generateContent.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Gerar Anúncio
              </button>
            </div>
            {generateContent.isPending && (
              <p className="text-xs text-muted-foreground">
                IA gerando anúncio variado... aguarde alguns segundos.
              </p>
            )}
          </div>

          {/* Histórico de conteúdos */}
          {selectedProductId && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Histórico de anúncios</h3>

              {historyLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : history.length === 0 ? (
                <div className="rounded-xl border bg-card py-10 text-center text-sm text-muted-foreground">
                  Nenhum anúncio gerado ainda. Clique em &quot;Gerar Anúncio&quot; acima.
                </div>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(h.createdAt).toLocaleString('pt-BR')}
                        {h.edited && (
                          <span className="rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 font-medium">
                            Editado
                          </span>
                        )}
                        {h.sent && (
                          <span className="rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 font-medium">
                            Enviado
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {editingContentId === h.id ? (
                          <>
                            <button
                              onClick={() => saveContent.mutate({ id: h.id, content: editingText })}
                              disabled={saveContent.isPending}
                              className="rounded-md px-3 py-1 text-xs bg-primary text-primary-foreground hover:opacity-90 transition-colors"
                            >
                              {saveContent.isPending ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Salvar'
                              )}
                            </button>
                            <button
                              onClick={() => {
                                setEditingContentId(null);
                                setEditingText('');
                              }}
                              className="rounded-md px-3 py-1 text-xs border hover:bg-muted transition-colors"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditingContentId(h.id);
                                setEditingText(h.content);
                              }}
                              className="rounded-md p-1.5 hover:bg-muted transition-colors"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm('Remover este anúncio?')) deleteContent.mutate(h.id);
                              }}
                              className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-4">
                      {editingContentId === h.id ? (
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          rows={10}
                          className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                        />
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
                          {h.content}
                        </pre>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
