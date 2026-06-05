'use client';

import { usePathname } from 'next/navigation';
import { Header } from './header';
import { CartDrawer } from '@/components/cart/cart-drawer';

const DASHBOARD_PREFIXES = ['/admin', '/vendedor', '/cliente'];

export function ConditionalHeader() {
  const pathname = usePathname();
  const isDashboard = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p));
  if (isDashboard) return null;
  return (
    <>
      <Header />
      <CartDrawer />
    </>
  );
}
