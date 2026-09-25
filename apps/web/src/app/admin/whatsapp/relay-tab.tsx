'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Pause, Play, RefreshCw, Trash2 } from 'lucide-react';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type RelayRole = 'SOURCE' | 'TARGET';

interface RelayGroup {
  id: string;
  jid: string;
  name: string;
  role: RelayRole;
  active: boolean;
}

interface RelayConfig {
  enabled: boolean;
  groups: RelayGroup[];
}

interface RelayLog {
  id: string;
  sourceName: string;
  targetName: string;
  kind: string;
  preview: string | null;
  success: boolean;
  error: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  text: 'Texto',
  image: 'Foto',
  video: 'Vídeo',
  document: 'Documento',
  audio: 'Áudio',
};

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  return Array.isArray(body.message) ? body.message.join(', ') : (body.message ?? fallback);
}

/**
 * Aba "Repasse": tudo que o número da loja postar num grupo de lotes é copiado
 * automaticamente para os grupos de venda.
 */
export function RelayTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const [showWaGroups, setShowWaGroups] = useState(false);
  const [error, setError] = useState('');

  const headers = () => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  });

  const { data: config, isLoading } = useQuery<RelayConfig>({
    queryKey: ['whatsapp-relay'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/relay`, { headers: headers() });
      if (!res.ok) throw new Error('Erro ao carregar o repasse');
      return res.json();
    },
    enabled: !!token,
  });

  const { data: logs = [] } = useQuery<RelayLog[]>({
    queryKey: ['whatsapp-relay-logs'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/relay/logs`, { headers: headers() });
      if (!res.ok) throw new Error('Erro ao carregar histórico');
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15_000,
  });

  const {
    data: waGroups = [],
    isFetching: waGroupsLoading,
    error: waGroupsError,
    refetch: refetchWaGroups,
  } = useQuery<{ id: string; subject: string }[]>({
    queryKey: ['whatsapp-wa-groups'],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/wa-groups`, { headers: headers() });
      if (!res.ok) throw new Error(await errorMessage(res, 'Erro ao buscar grupos do WhatsApp'));
      return res.json();
    },
    enabled: !!token && showWaGroups,
    retry: false,
  });

  const onSuccess = () => {
    setError('');
    qc.invalidateQueries({ queryKey: ['whatsapp-relay'] });
  };
  const onError = (e: Error) => setError(e.message);

  const setEnabled = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/relay/enabled`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'Erro ao salvar'));
    },
    onSuccess,
    onError,
  });

  const addGroup = useMutation({
    mutationFn: async (input: { jid: string; name: string; role: RelayRole }) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/relay/groups`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'Erro ao adicionar grupo'));
    },
    onSuccess,
    onError,
  });

  const updateGroup = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/relay/groups/${id}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'Erro ao atualizar grupo'));
    },
    onSuccess,
    onError,
  });

  const removeGroup = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${BASE}/api/v1/whatsapp/relay/groups/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      if (!res.ok) throw new Error(await errorMessage(res, 'Erro ao remover grupo'));
    },
    onSuccess,
    onError,
  });

  if (isLoading || !config) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sources = config.groups.filter((g) => g.role === 'SOURCE');
  const targets = config.groups.filter((g) => g.role === 'TARGET');
  const addedJids = new Set(config.groups.map((g) => g.jid));
  const available = waGroups.filter((g) => !addedJids.has(g.id));
  const missing =
    !sources.some((g) => g.active) || !targets.some((g) => g.active)
      ? 'Adicione ao menos um grupo de lotes e um grupo de venda ativos.'
      : null;

  const groupList = (title: string, subtitle: string, list: RelayGroup[]) => (
    <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {list.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum grupo ainda.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {list.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm ${g.active ? '' : 'text-muted-foreground line-through'}`}
                >
                  {g.name}
                </p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">{g.jid}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => updateGroup.mutate({ id: g.id, active: !g.active })}
                  title={g.active ? 'Pausar' : 'Reativar'}
                  className="rounded-md p-1.5 hover:bg-muted transition-colors"
                >
                  {g.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Tirar "${g.name}" do repasse?`)) removeGroup.mutate(g.id);
                  }}
                  title="Remover"
                  className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Liga/desliga */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Repasse automático</p>
            <p className="text-xs text-muted-foreground">
              Tudo que o número da loja postar nos grupos de lotes (texto, foto, vídeo, documento ou
              áudio) é copiado para os grupos de venda, como mensagem nova. Mensagens de outros
              participantes não são repassadas.
            </p>
          </div>
          <button
            onClick={() => setEnabled.mutate(!config.enabled)}
            disabled={setEnabled.isPending}
            className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              config.enabled
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'border text-muted-foreground hover:bg-muted'
            }`}
          >
            {config.enabled ? 'Ligado' : 'Desligado'}
          </button>
        </div>
        {config.enabled && missing && <p className="mt-2 text-xs text-amber-600">{missing}</p>}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {groupList('Grupos de lotes (origem)', 'Onde você posta os produtos.', sources)}
        {groupList(
          'Grupos de venda (destino)',
          'Recebem uma cópia de cada postagem, um grupo por vez.',
          targets,
        )}
      </div>

      {/* Adicionar grupos */}
      <div className="rounded-xl border border-dashed bg-muted/20 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Adicionar grupos do número conectado
          </span>
          <button
            type="button"
            onClick={() => (showWaGroups ? refetchWaGroups() : setShowWaGroups(true))}
            className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
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
        {showWaGroups && !waGroupsLoading && !waGroupsError && available.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhum grupo novo para adicionar.</p>
        )}
        {showWaGroups && available.length > 0 && (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border bg-card">
            {available.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 truncate text-sm">{g.subject}</span>
                <div className="flex shrink-0 gap-1">
                  {(['SOURCE', 'TARGET'] as const).map((role) => (
                    <button
                      key={role}
                      disabled={addGroup.isPending}
                      onClick={() => addGroup.mutate({ jid: g.id, name: g.subject, role })}
                      className="rounded-md border px-2 py-1 text-xs hover:bg-muted transition-colors disabled:opacity-50"
                    >
                      + {role === 'SOURCE' ? 'Lotes' : 'Venda'}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Histórico */}
      <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
        <p className="text-sm font-semibold">Últimos repasses</p>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum repasse ainda.</p>
        ) : (
          <ul className="divide-y text-xs">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 py-2">
                <span className="text-muted-foreground">
                  {new Date(log.createdAt).toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span className="flex items-center gap-1 font-medium">
                  {log.sourceName} <ArrowRight className="h-3 w-3" /> {log.targetName}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5">
                  {KIND_LABEL[log.kind] ?? log.kind}
                </span>
                {log.preview && (
                  <span className="min-w-0 max-w-full truncate text-muted-foreground">
                    {log.preview}
                  </span>
                )}
                <span
                  className={`ml-auto ${log.success ? 'text-green-600' : 'text-destructive'}`}
                  title={log.error ?? undefined}
                >
                  {log.success ? 'Enviado' : `Falhou${log.error ? `: ${log.error}` : ''}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
