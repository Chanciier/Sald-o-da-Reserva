'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { fetchBehaviorReport } from '@/actions/analytics';
import { useAuth } from '@/contexts/auth-context';

function brazilToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function useBehaviorReport() {
  const { token, loading } = useAuth();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = useMemo(brazilToday, []);
  const from = params.get('from') ?? `${today.slice(0, 8)}01`;
  const to = params.get('to') ?? today;
  const [draft, setDraft] = useState({ from, to });
  const query = useQuery({
    queryKey: ['behavior-report', from, to],
    queryFn: () => fetchBehaviorReport(token!, from, to),
    enabled: !!token && !loading,
    refetchInterval: 5 * 60 * 1000,
  });

  function navigateToRange(next: { from: string; to: string }) {
    const search = new URLSearchParams({ from: next.from, to: next.to });
    router.push(`${pathname}?${search}`);
  }

  function apply() {
    navigateToRange(draft);
  }

  function preset(kind: 'today' | 'month' | '30days') {
    let nextFrom = today;
    if (kind === 'month') nextFrom = `${today.slice(0, 8)}01`;
    if (kind === '30days') {
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 29);
      nextFrom = date.toISOString().slice(0, 10);
    }
    const next = { from: nextFrom, to: today };
    setDraft(next);
    navigateToRange(next);
  }

  return { ...query, from, to, draft, setDraft, apply, preset };
}
