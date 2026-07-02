'use client';

import { useEffect } from 'react';
import { trackSearch } from '@/lib/analytics';

// Sem render — dispara o evento de busca a partir da página de resultados,
// que é um server component. resultsCount=0 alimenta o relatório de buscas
// sem resultado (sinal de demanda que a loja não está atendendo).
export function SearchTracker({ term, resultsCount }: { term: string; resultsCount: number }) {
  useEffect(() => {
    trackSearch(term, resultsCount);
  }, [term, resultsCount]);

  return null;
}
