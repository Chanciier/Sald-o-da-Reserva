'use client';

import { usePathname } from 'next/navigation';
import { Footer } from './footer';

const HIDDEN_PREFIXES = ['/admin', '/vendedor', '/cliente'];

export function ConditionalFooter() {
  const pathname = usePathname();
  const isHidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  if (isHidden) return null;
  return <Footer />;
}
