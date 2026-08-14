'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Send, UserMinus, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { SectionGate } from '@/components/admin/section-gate';

const API = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/v1`;

type GrantStatus = 'ACTIVE' | 'EXPIRED' | 'REMOVED' | 'FAILED';

interface Grant {
  id: string;
  orderId: string;
  phone: string | null;
  groupJid: string;
  inviteLink: string | null;
  status: GrantStatus;
  expiresAt: string | null;
  removedAt: string | null;
  createdAt: string;
  product: { name: string };
  order: { buyerName: string | null; customerPhone: string | null };
}

interface GrantsResponse {
  data: Grant[];
  total: number;
  page: number;
  pages: number;
}

async function apiFetch(url: string, token: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message ?? `Erro ${res.status}`);
  return data;
}

const STATUS_LABEL: Record<GrantStatus, string> = {
  ACTIVE: 'Ativo',
  EXPIRED: 'Expirado',
  REMOVED: 'Removido',
  FAILED: 'Falhou',
};

const STATUS_CLASS: Record<GrantStatus, string> = {
  ACTIVE: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  EXPIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  REMOVED: 'bg-muted text-muted-foreground',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function StatusBadge({ status }: { status: GrantStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function AdminWhatsappAccessPage() {
  return (
    <SectionGate section="PEDIDOS">
      <AdminWhatsappAccess />
    </SectionGate>
  );
}

function AdminWhatsappAccess() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<GrantStatus | ''>('');

  const { data, isLoading } = useQuery<GrantsResponse>({
    queryKey: ['admin-whatsapp-access', page, status],
    queryFn: () =>
      apiFetch(
        `${API}/admin/whatsapp-access?page=${page}${status ? `&status=${status}` : ''}`,
        token!,
      ),
    enabled: !!token,
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${API}/admin/whatsapp-access/${id}/resend`, token!, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-whatsapp-access'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`${API}/admin/whatsapp-access/${id}/remove`, token!, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-whatsapp-access'] }),
  });

  const grants = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Acessos Vendidos</h1>
          {data && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {data.total}
            </span>
          )}
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as GrantStatus | '');
            setPage(1);
          }}
          className="rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos os status</option>
          <option value="ACTIVE">Ativo</option>
          <option value="EXPIRED">Expirado</option>
          <option value="REMOVED">Removido</option>
          <option value="FAILED">Falhou</option>
        </select>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !grants.length ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Nenhum acesso vendido ainda.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Produto</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Expira em</th>
                  <th className="px-4 py-3 font-medium">Comprado em</th>
                  <th className="px-4 py-3 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {grants.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium">{g.order.buyerName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {g.order.customerPhone ?? g.phone ?? '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{g.product.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={g.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {g.expiresAt ? new Date(g.expiresAt).toLocaleDateString('pt-BR') : 'Vitalício'}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(g.createdAt).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {g.inviteLink && (
                          <a
                            href={g.inviteLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir link do grupo"
                            className="rounded-lg p-1.5 hover:bg-muted transition-colors"
                          >
                            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                          </a>
                        )}
                        <button
                          onClick={() => resendMutation.mutate(g.id)}
                          disabled={resendMutation.isPending}
                          title="Reenviar link por WhatsApp"
                          className="rounded-lg p-1.5 hover:bg-muted transition-colors disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                        {g.status !== 'REMOVED' && (
                          <button
                            onClick={() => {
                              if (confirm('Remover este cliente do grupo agora?')) {
                                removeMutation.mutate(g.id);
                              }
                            }}
                            disabled={removeMutation.isPending}
                            title="Remover do grupo agora"
                            className="rounded-lg p-1.5 hover:bg-destructive/10 transition-colors disabled:opacity-50"
                          >
                            <UserMinus className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data && data.pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Anterior
          </button>
          <span className="text-sm text-muted-foreground">
            Página {data.page} de {data.pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
            disabled={page >= data.pages}
            className="rounded-lg border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
          >
            Próxima
          </button>
        </div>
      )}
    </div>
  );
}
