'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { getPrintJobs } from '@/lib/print-center-api';
import { PrintJobsTable } from '../_components/print-jobs-table';

const ACTIVE_STATUSES = new Set(['PENDING', 'READY', 'SENT', 'PRINTING']);

export default function PrintCenterFilaPage() {
  const { token } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['print-center-jobs'],
    queryFn: () => getPrintJobs(token!),
    enabled: !!token,
    refetchInterval: 10000,
  });

  const jobs = data?.filter((job) => ACTIVE_STATUSES.has(job.status));

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <PrintJobsTable
        jobs={jobs}
        isLoading={isLoading}
        emptyLabel="Nenhum job de impressão na fila no momento."
      />
    </div>
  );
}
