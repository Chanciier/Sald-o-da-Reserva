'use client';

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { getPrintJobs } from '@/lib/print-center-api';
import { PrintJobsTable } from '../_components/print-jobs-table';

export default function PrintCenterHistoricoPage() {
  const { token } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['print-center-jobs', 'PRINTED'],
    queryFn: () => getPrintJobs(token!, { status: 'PRINTED' }),
    enabled: !!token,
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <PrintJobsTable
        jobs={data}
        isLoading={isLoading}
        emptyLabel="Nenhuma impressão concluída ainda."
      />
    </div>
  );
}
