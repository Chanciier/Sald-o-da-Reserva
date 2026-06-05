'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Receipt,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Download,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { fetchInvoices } from '@/actions/invoices';

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  PROCESSING: 'bg-blue-100 text-blue-800',
  AUTHORIZED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente',
  PROCESSING: 'Processando',
  AUTHORIZED: 'Autorizada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

export default function VendedorNotasFiscais() {
  const { token } = useAuth();
  const [page, setPage] = useState(1);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['vendedor-invoices', page],
    queryFn: () => fetchInvoices(token!, { page }),
    enabled: !!token,
  });

  const invoices = data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Notas Fiscais</h1>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : !invoices.length ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">Nenhuma nota fiscal encontrada</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              As notas fiscais são emitidas automaticamente após a confirmação do pagamento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Número NF</th>
                  <th className="px-4 py-3 font-medium">Pedido</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Emissão</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map(
                  (inv: {
                    id: string;
                    invoiceNumber: string | null;
                    orderId: string;
                    status: string;
                    issueDate: string | null;
                    xmlUrl: string | null;
                    pdfUrl: string | null;
                    errorMessage: string | null;
                  }) => (
                    <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm">{inv.invoiceNumber ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-primary">
                        #{inv.orderId.slice(-8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[inv.status] ?? 'bg-muted'}`}
                        >
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </span>
                        {inv.errorMessage && (
                          <p className="text-xs text-red-600 mt-0.5 truncate max-w-xs">
                            {inv.errorMessage}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {inv.issueDate ? new Date(inv.issueDate).toLocaleDateString('pt-BR') : '—'}
                      </td>
                      <td className="px-4 py-3 flex gap-1.5">
                        {inv.xmlUrl && (
                          <a
                            href={inv.xmlUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                          >
                            <Download className="h-3 w-3" /> XML
                          </a>
                        )}
                        {inv.pdfUrl && (
                          <a
                            href={inv.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                          >
                            <ExternalLink className="h-3 w-3" /> PDF
                          </a>
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && (data.pages ?? 1) > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              {data.total} notas · página {data.page} de {data.pages}
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
