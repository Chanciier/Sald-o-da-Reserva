'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { LayoutDashboard, ShoppingBag, Package, LogOut } from 'lucide-react';

const NAV = [
  { href: '/vendedor', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/vendedor/pedidos', label: 'Pedidos', icon: ShoppingBag },
  { href: '/vendedor/produtos', label: 'Produtos', icon: Package },
];

export default function VendedorLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'VENDEDOR' && user.role !== 'ADMIN'))) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading || !user || (user.role !== 'VENDEDOR' && user.role !== 'ADMIN')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r bg-card">
        <div className="flex h-14 items-center border-b px-5">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Vendedor
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/vendedor' ? pathname === '/vendedor' : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t p-3">
          <div className="mb-2 rounded-lg bg-muted px-3 py-2">
            <p className="text-xs font-medium truncate">{user.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
