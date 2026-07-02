'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Send, Loader2, CheckCircle2, Users, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const DEFAULT_SUBJECT = 'Novidade: pague com cartão de crédito no Saldão da Reserva';
const DEFAULT_MESSAGE =
  'Agora você pode finalizar sua compra pagando com cartão de crédito à vista, em qualquer valor. Para compras a partir de R$100, também dá pra parcelar. É só escolher essa forma de pagamento na hora de fechar o pedido.';

interface CampaignState {
  subject: string;
  message: string;
  running: boolean;
  total: number;
  sent: number;
  failed: number;
  startedAt: string;
  finishedAt: string | null;
}

async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

async function apiPost<T>(path: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export default function AdminCampanhasPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [confirming, setConfirming] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['mail-campaign-status'],
    queryFn: () => apiGet<CampaignState | null>('/mail-campaigns/status', token!),
    enabled: !!token,
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });

  const countQuery = useQuery({
    queryKey: ['mail-campaign-recipients'],
    queryFn: () => apiGet<{ count: number }>('/mail-campaigns/recipient-count', token!),
    enabled: !!token && !statusQuery.data?.running,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiPost<CampaignState>('/mail-campaigns/send', token!, { subject, message }),
    onSuccess: (data) => {
      qc.setQueryData(['mail-campaign-status'], data);
      qc.invalidateQueries({ queryKey: ['mail-campaign-status'] });
      setConfirming(false);
    },
  });

  const status = statusQuery.data;
  const running = status?.running ?? false;
  const canEdit = !running && !confirming;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Campanhas de E-mail</h1>
        <p className="text-sm text-muted-foreground">
          Envie um aviso por e-mail para todos os clientes ativos
        </p>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-start gap-4 p-5 border-b">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">Novo aviso</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edite o assunto e o texto abaixo antes de disparar.
            </p>
          </div>
        </div>

        {/* Formulário editável */}
        <div className="p-5 border-b space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Assunto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!canEdit}
              maxLength={150}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mensagem</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={!canEdit}
              maxLength={4000}
              rows={5}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
            />
          </div>
        </div>

        {/* Status / ação */}
        <div className="p-5 space-y-4">
          {statusQuery.isLoading ? (
            <div className="h-10 animate-pulse rounded-lg bg-muted" />
          ) : running ? (
            <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 shrink-0" />
              <div className="text-sm text-blue-800">
                Enviando... {status!.sent + status!.failed} de {status!.total} processados
                {status!.failed > 0 && ` (${status!.failed} falharam)`}
              </div>
            </div>
          ) : status?.finishedAt ? (
            <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              <div className="text-sm text-green-800">
                Último envio: {status.sent} de {status.total} clientes em{' '}
                {new Date(status.finishedAt).toLocaleString('pt-BR')}
                {status.failed > 0 && ` — ${status.failed} falharam`}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {countQuery.isLoading
                ? 'Calculando destinatários...'
                : `${countQuery.data?.count ?? 0} clientes ativos vão receber este e-mail`}
            </div>
          )}

          {sendMutation.isError && (
            <p className="text-sm text-destructive">{(sendMutation.error as Error).message}</p>
          )}

          {!running && !confirming && (
            <button
              onClick={() => setConfirming(true)}
              disabled={!subject.trim() || !message.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              Enviar agora
            </button>
          )}

          {confirming && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Isso vai enviar um e-mail real para{' '}
                  <strong>{countQuery.data?.count ?? '...'} clientes</strong> agora. Essa ação não
                  pode ser desfeita. Confirma o envio?
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => sendMutation.mutate()}
                  disabled={sendMutation.isPending}
                  className="rounded-lg bg-amber-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
                >
                  {sendMutation.isPending ? 'Iniciando...' : 'Sim, enviar agora'}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  disabled={sendMutation.isPending}
                  className="rounded-lg border px-4 py-1.5 text-sm hover:bg-muted disabled:opacity-60 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
