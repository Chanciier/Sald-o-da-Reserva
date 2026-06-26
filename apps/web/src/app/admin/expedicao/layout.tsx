'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/admin/expedicao', label: 'Dashboard', exact: true },
  { href: '/admin/expedicao/fila', label: 'Fila' },
  { href: '/admin/expedicao/separacao', label: 'Separação' },
  { href: '/admin/expedicao/prontos', label: 'Prontos' },
  { href: '/admin/expedicao/enviados', label: 'Enviados' },
  { href: '/admin/expedicao/retirada', label: 'Retirada' },
  { href: '/admin/expedicao/concluidos', label: 'Concluídos' },
];

export default function ExpedicaoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <div className="space-y-5">
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b pb-px">
        {TABS.map((tab) => {
          const active = isActive(tab.href, tab.exact);
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
