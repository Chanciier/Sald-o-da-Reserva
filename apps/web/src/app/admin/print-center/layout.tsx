'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

const TABS = [
  { href: '/admin/print-center/fila', label: 'Fila' },
  { href: '/admin/print-center/historico', label: 'Histórico' },
  { href: '/admin/print-center/falhas', label: 'Falhas' },
  { href: '/admin/print-center/devices', label: 'Dispositivos', adminOnly: true },
];

export default function PrintCenterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  const tabs = TABS.filter((tab) => !tab.adminOnly || user?.role === 'ADMIN');

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold">Print Center</h1>
      </div>
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px">
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(tab.href + '/');
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
