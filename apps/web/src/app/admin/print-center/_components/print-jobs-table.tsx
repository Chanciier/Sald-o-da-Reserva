import type { PrintJob } from '@/types/print-job';

const TYPE_LABEL: Record<PrintJob['type'], string> = {
  PICKUP: 'Retirada',
  SHIPPING: 'Envio',
};

const STATUS_LABEL: Record<PrintJob['status'], string> = {
  PENDING: 'Aguardando documento',
  READY: 'Pronto',
  SENT: 'Enviado ao dispositivo',
  PRINTING: 'Imprimindo',
  PRINTED: 'Impresso',
  FAILED: 'Falhou',
};

const STATUS_COLOR: Record<PrintJob['status'], string> = {
  PENDING: 'bg-muted text-foreground',
  READY: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  SENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  PRINTING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  PRINTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

function shortId(id: string) {
  return '#' + id.slice(-8).toUpperCase();
}

export function PrintJobsTable({
  jobs,
  isLoading,
  emptyLabel,
  onReprint,
  reprintingId,
}: {
  jobs: PrintJob[] | undefined;
  isLoading: boolean;
  emptyLabel: string;
  onReprint?: (id: string) => void;
  reprintingId?: string | null;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!jobs?.length) {
    return <p className="py-16 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-4 py-3 font-medium">Pedido</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Dispositivo</th>
            <th className="px-4 py-3 font-medium">Atualizado</th>
            {onReprint && <th className="px-4 py-3 font-medium">Ação</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {jobs.map((job) => (
            <tr key={job.id} className="hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3">
                <span className="font-mono text-xs text-primary">{shortId(job.orderId)}</span>
              </td>
              <td className="px-4 py-3">{job.order?.buyerName ?? '—'}</td>
              <td className="px-4 py-3">{TYPE_LABEL[job.type]}</td>
              <td className="px-4 py-3">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[job.status]}`}
                >
                  {STATUS_LABEL[job.status]}
                </span>
                {job.status === 'FAILED' && job.lastError && (
                  <p className="mt-1 text-xs text-destructive">{job.lastError}</p>
                )}
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">{job.device?.name ?? '—'}</td>
              <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                {new Date(job.updatedAt).toLocaleString('pt-BR')}
              </td>
              {onReprint && (
                <td className="px-4 py-3">
                  <button
                    onClick={() => onReprint(job.id)}
                    disabled={reprintingId === job.id}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    {reprintingId === job.id ? 'Reimprimindo...' : 'Reimprimir'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
