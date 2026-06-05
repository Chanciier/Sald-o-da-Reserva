'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Warehouse,
  Truck,
  Receipt,
  BarChart2,
  User,
  LogOut,
  Plus,
} from 'lucide-react';

const NAV = [
  { href: '/vendedor', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/vendedor/produtos', label: 'Meus Produtos', icon: Package },
  { href: '/vendedor/produtos/novo', label: 'Novo Produto', icon: Plus },
  { href: '/vendedor/pedidos', label: 'Meus Pedidos', icon: ShoppingBag },
  { href: '/vendedor/estoque', label: 'Estoque', icon: Warehouse },
  { href: '/vendedor/fretes', label: 'Fretes', icon: Truck },
  { href: '/vendedor/notas-fiscais', label: 'Notas Fiscais', icon: Receipt },
  { href: '/vendedor/relatorios', label: 'Relatórios', icon: BarChart2 },
  { href: '/vendedor/perfil', label: 'Meu Perfil', icon: User },
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
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        <div className="flex h-14 items-center border-b px-5 gap-2">
          <span className="text-xs font-bold text-primary uppercase tracking-widest">Vendedor</span>
          <span className="text-xs text-muted-foreground">· Saldão</span>
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
          <button
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">{children}</div>
      </main>
    </div>
  );
}
