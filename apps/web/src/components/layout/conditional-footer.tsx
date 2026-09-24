'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './footer';
import { LANDING_PAGES } from './conditional-header';

const HIDDEN_PREFIXES = ['/admin', '/vendedor', '/cliente'];

export function ConditionalFooter() {
  const pathname = usePathname();
  const isHidden =
    HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)) || LANDING_PAGES.includes(pathname);
  if (isHidden) return null;
  return <Footer />;
}
