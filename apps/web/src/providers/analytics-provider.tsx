'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { pingActivity, trackPageView } from '@/lib/analytics';

const HEARTBEAT_MS = 20_000;

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  // Navegação da equipe pelo painel admin não é comportamento de cliente —
  // rastrear isso poluiria produtos mais vistos, funil, etc.
  const isAdmin = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    if (isAdmin || lastPath.current === pathname) return;
    lastPath.current = pathname;
    trackPageView(pathname);
  }, [pathname, isAdmin]);

  useEffect(() => {
    if (isAdmin) return;
    const interval = setInterval(() => pingActivity(), HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [isAdmin]);

  return <>{children}</>;
}
