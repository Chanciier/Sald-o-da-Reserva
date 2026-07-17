'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/auth-context';
import { getPrintJobs, reprintPrintJob } from '@/lib/print-center-api';
import { PrintJobsTable } from '../_components/print-jobs-table';

export default function PrintCenterFalhasPage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [reprintingId, setReprintingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['print-center-jobs', 'FAILED'],
    queryFn: () => getPrintJobs(token!, { status: 'FAILED' }),
    enabled: !!token,
  });

  const reprintMutation = useMutation({
    mutationFn: (id: string) => reprintPrintJob(token!, id),
    onMutate: (id) => setReprintingId(id),
    onSettled: () => {
      setReprintingId(null);
      qc.invalidateQueries({ queryKey: ['print-center-jobs'] });
    },
  });

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <PrintJobsTable
        jobs={data}
        isLoading={isLoading}
        emptyLabel="Nenhuma falha de impressão registrada."
        onReprint={(id) => reprintMutation.mutate(id)}
        reprintingId={reprintingId}
      />
    </div>
  );
}
