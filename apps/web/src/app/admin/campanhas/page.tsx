'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, Send, Loader2, CheckCircle2, Users, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const CAMPAIGN_KEY = 'credit-card-announcement';

interface CampaignState {
  key: string;
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

async function apiPost<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data as T;
}

export default function AdminCampanhasPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['mail-campaign-status', CAMPAIGN_KEY],
    queryFn: () => apiGet<CampaignState | null>(`/mail-campaigns/${CAMPAIGN_KEY}/status`, token!),
    enabled: !!token,
    refetchInterval: (query) => (query.state.data?.running ? 3000 : false),
  });

  const countQuery = useQuery({
    queryKey: ['mail-campaign-recipients', CAMPAIGN_KEY],
    queryFn: () =>
      apiGet<{ count: number }>(`/mail-campaigns/${CAMPAIGN_KEY}/recipient-count`, token!),
    enabled: !!token && !statusQuery.data?.running,
  });

  const sendMutation = useMutation({
    mutationFn: () => apiPost<CampaignState>(`/mail-campaigns/${CAMPAIGN_KEY}/send`, token!),
    onSuccess: (data) => {
      qc.setQueryData(['mail-campaign-status', CAMPAIGN_KEY], data);
      qc.invalidateQueries({ queryKey: ['mail-campaign-status', CAMPAIGN_KEY] });
      setConfirming(false);
    },
  });

  const status = statusQuery.data;
  const running = status?.running ?? false;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-bold">Campanhas de E-mail</h1>
        <p className="text-sm text-muted-foreground">Avisos enviados por e-mail para os clientes</p>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <div className="flex items-start gap-4 p-5 border-b">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold">Pagamento por cartão de crédito</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Avisa os clientes que agora é possível pagar com cartão de crédito à vista em qualquer
              valor, com parcelamento a partir de R$100.
            </p>
          </div>
        </div>

        {/* Preview do conteúdo */}
        <div className="p-5 border-b bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-2">Prévia do e-mail</p>
          <div className="rounded-lg border bg-background p-4 text-sm space-y-2">
            <p className="font-medium">
              Assunto: Novidade: pague com cartão de crédito no Saldão da Reserva
            </p>
            <p className="text-muted-foreground">
              &quot;Agora você pode finalizar sua compra pagando com cartão de crédito à vista, em
              qualquer valor. Para compras a partir de R$100, também dá pra parcelar. É só escolher
              essa forma de pagamento na hora de fechar o pedido.&quot;
            </p>
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
                Enviado para {status.sent} de {status.total} clientes em{' '}
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
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Send className="h-4 w-4" />
              {status?.finishedAt ? 'Enviar novamente' : 'Enviar agora'}
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
