'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  LayoutDashboard,
  ShoppingBag,
  MapPin,
  CreditCard,
  Truck,
  User,
  LogOut,
  LayoutGrid,
  Menu,
  X,
  TrendingUp,
} from 'lucide-react';

const NAV = [
  { href: '/cliente', label: 'Início', icon: LayoutDashboard, exact: true },
  { href: '/pedidos', label: 'Meus Pedidos', icon: ShoppingBag },
  { href: '/cliente/rastreamento', label: 'Rastreamento', icon: Truck },
  { href: '/cliente/enderecos', label: 'Meus Endereços', icon: MapPin },
  { href: '/cliente/pagamentos', label: 'Pagamentos', icon: CreditCard },
  { href: '/cliente/afiliado', label: 'Afiliados', icon: TrendingUp },
  { href: '/cliente/perfil', label: 'Meu Perfil', icon: User },
];

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r bg-card transition-transform duration-200 md:static md:w-60 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-14 items-center justify-between border-b px-5">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">
            Minha Conta
          </span>
          <button
            className="rounded-md p-1 hover:bg-muted md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="size-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
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

        <div className="border-t p-3 space-y-1">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-xs font-medium truncate">{user.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          {(user.role === 'ADMIN' || user.role === 'VENDEDOR') && (
            <Link
              href="/admin"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
            >
              <LayoutGrid className="h-4 w-4" />
              Painel Administrativo
            </Link>
          )}
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
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Abrir menu"
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
          >
            <Menu className="size-5" />
          </button>
          <span className="text-sm font-semibold">Minha Conta</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
