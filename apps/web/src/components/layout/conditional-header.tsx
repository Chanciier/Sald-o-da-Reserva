'use client';

import { usePathname } from 'next/navigation';
import { Header } from './header';
import { CartDrawer } from '@/components/cart/cart-drawer';

const DASHBOARD_PREFIXES = ['/admin', '/vendedor', '/cliente'];
const LANDING_PAGES = ['/produtos/clube-reversa'];

export function ConditionalHeader() {
  const pathname = usePathname();
  const isDashboard = DASHBOARD_PREFIXES.some((p) => pathname.startsWith(p));
  if (isDashboard || LANDING_PAGES.includes(pathname)) return null;
  return (
    <>
      <Header />
      <CartDrawer />
    </>
  );
}
