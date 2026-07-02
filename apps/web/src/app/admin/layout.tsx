'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { NotificationBell } from '@/components/notifications/notification-bell';
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingBag,
  Warehouse,
  Truck,
  DollarSign,
  BarChart2,
  Settings,
  ChevronDown,
  ChevronRight,
  LogOut,
  ScrollText,
  Store,
  ExternalLink,
  ClipboardList,
  RotateCcw,
  Menu,
  X,
  FileText,
  MessageCircle,
  Boxes,
} from 'lucide-react';

type NavChild = { href: string; label: string };
type NavItem =
  | { href: string; label: string; icon: React.ElementType; children?: never }
  | { href?: never; label: string; icon: React.ElementType; children: NavChild[] };

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'OMS',
    icon: Boxes,
    children: [
      { href: '/admin/oms', label: 'Painel OMS' },
      { href: '/admin/marketplaces', label: 'Marketplaces' },
    ],
  },
  {
    label: 'Usuários',
    icon: Users,
    children: [
      { href: '/admin/usuarios?role=CLIENTE', label: 'Clientes' },
      { href: '/admin/usuarios?role=VENDEDOR', label: 'Vendedores' },
      { href: '/admin/usuarios?role=ADMIN', label: 'Administradores' },
    ],
  },
  {
    label: 'Produtos',
    icon: Package,
    children: [
      { href: '/admin/produtos', label: 'Listagem' },
      { href: '/admin/produtos/novo', label: 'Novo Produto' },
      { href: '/admin/categorias', label: 'Categorias' },
      { href: '/admin/cupons', label: 'Cupons' },
    ],
  },
  {
    label: 'Expedição',
    icon: ClipboardList,
    children: [
      { href: '/admin/expedicao', label: 'Dashboard' },
      { href: '/admin/expedicao/fila', label: 'Fila de Pedidos' },
      { href: '/admin/expedicao/separacao', label: 'Separação' },
      { href: '/admin/expedicao/prontos', label: 'Prontos p/ Envio' },
      { href: '/admin/expedicao/enviados', label: 'Enviados' },
      { href: '/admin/expedicao/retirada', label: 'Retirada na Loja' },
      { href: '/admin/expedicao/concluidos', label: 'Concluídos' },
    ],
  },
  {
    label: 'Pedidos',
    icon: ShoppingBag,
    children: [
      { href: '/admin/pedidos', label: 'Todos os Pedidos' },
      { href: '/admin/financeiro/pagamentos', label: 'Pagamentos' },
      { href: '/admin/pedidos?status=CANCELLED', label: 'Cancelamentos' },
    ],
  },
  {
    label: 'Devoluções',
    icon: RotateCcw,
    children: [
      { href: '/admin/devolucoes', label: 'Todas as Solicitações' },
      { href: '/admin/devolucoes?status=PENDING', label: 'Solicitadas' },
      { href: '/admin/devolucoes?status=IN_REVIEW', label: 'Em Análise' },
    ],
  },
  {
    label: 'Estoque',
    icon: Warehouse,
    children: [
      { href: '/admin/estoque', label: 'Movimentações' },
      { href: '/admin/estoque?filter=low', label: 'Alertas de Estoque' },
    ],
  },
  {
    label: 'Fretes',
    icon: Truck,
    children: [
      { href: '/admin/fretes', label: 'Melhor Envio' },
      { href: '/admin/fretes?tab=etiquetas', label: 'Etiquetas' },
      { href: '/admin/fretes?tab=rastreamento', label: 'Rastreamentos' },
    ],
  },
  {
    label: 'Financeiro',
    icon: DollarSign,
    children: [
      { href: '/admin/financeiro/pagamentos', label: 'Receitas & Pagamentos' },
      { href: '/admin/financeiro/notas-fiscais', label: 'Notas Fiscais' },
    ],
  },
  {
    label: 'Relatórios',
    icon: BarChart2,
    children: [
      { href: '/admin/relatorios/vendas', label: 'Vendas' },
      { href: '/admin/relatorios/produtos', label: 'Produtos' },
      { href: '/admin/relatorios/clientes', label: 'Clientes' },
      { href: '/admin/relatorios/comportamento', label: 'Comportamento' },
    ],
  },
  {
    label: 'Configurações',
    icon: Settings,
    children: [
      { href: '/admin/configuracoes?tab=integracoes', label: 'Integrações' },
      { href: '/admin/configuracoes?tab=seguranca', label: 'Segurança' },
      { href: '/admin/configuracoes?tab=sistema', label: 'Sistema' },
    ],
  },
  {
    label: 'Conteúdo',
    icon: FileText,
    children: [
      { href: '/admin/conteudo/paginas', label: 'Páginas Jurídicas' },
      { href: '/admin/conteudo/faq', label: 'FAQ' },
    ],
  },
  {
    label: 'Marketing',
    icon: MessageCircle,
    children: [
      { href: '/admin/marketing', label: 'Dashboard' },
      { href: '/admin/whatsapp', label: 'Grupos WhatsApp' },
      { href: '/admin/campanhas', label: 'Campanhas de E-mail' },
      { href: '/admin/marketing/meta-catalog', label: 'Meta Catalog' },
    ],
  },
  {
    label: 'Logs',
    icon: ScrollText,
    children: [
      { href: '/admin/logs/auditoria', label: 'Auditoria' },
      { href: '/admin/logs/auditoria?type=events', label: 'Eventos' },
    ],
  },
];

function isActive(pathname: string, href: string) {
  const base = href.split('?')[0];
  if (base === '/admin') return pathname === '/admin';
  return pathname.startsWith(base);
}

function groupActive(pathname: string, children: NavChild[]) {
  return children.some((c) => isActive(pathname, c.href));
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && (!user || (user.role !== 'ADMIN' && user.role !== 'VENDEDOR'))) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const autoOpen: Record<string, boolean> = {};
    for (const item of NAV) {
      if (item.children && groupActive(pathname, item.children)) {
        autoOpen[item.label] = true;
      }
    }
    setOpen((prev) => ({ ...prev, ...autoOpen }));
  }, [pathname]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading || !user || (user.role !== 'ADMIN' && user.role !== 'VENDEDOR')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const visibleNav =
    user.role === 'VENDEDOR'
      ? NAV.filter((i) => i.label === 'Expedição' || i.label === 'Produtos').map((i) => {
          if (i.label === 'Produtos' && i.children) {
            return {
              ...i,
              children: i.children.filter(
                (c) => c.href === '/admin/produtos' || c.href === '/admin/produtos/novo',
              ),
            };
          }
          return i;
        })
      : NAV;

  function toggle(label: string) {
    setOpen((prev) => ({ ...prev, [label]: !prev[label] }));
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
        className={`no-print fixed inset-y-0 left-0 z-50 flex w-72 shrink-0 flex-col border-r bg-card transition-transform duration-200 md:static md:w-60 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between border-b px-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary uppercase tracking-widest">Admin</span>
            <span className="text-xs text-muted-foreground">· Saldão</span>
          </div>
          <button
            className="rounded-md p-1 hover:bg-muted md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {visibleNav.map((item) => {
            if (!item.children) {
              const active = isActive(pathname, item.href!);
              return (
                <Link
                  key={item.href}
                  href={item.href!}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            }

            const anyActive = groupActive(pathname, item.children);
            const isOpen = open[item.label] ?? false;

            return (
              <div key={item.label}>
                <button
                  onClick={() => toggle(item.label)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                    anyActive
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {isOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                </button>

                {isOpen && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                    {item.children.map((child) => {
                      const childActive = isActive(pathname, child.href);
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`flex items-center rounded-lg px-2 py-1.5 text-xs transition-colors ${
                            childActive
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User footer */}
        <div className="border-t p-3 space-y-1">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-xs font-medium truncate">{user.name ?? user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          <Link
            href="/"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <Store className="h-4 w-4" />
            Ver Loja
          </Link>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            Abrir Loja em Nova Aba
          </a>
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
        <div className="flex items-center justify-between border-b bg-card px-4 py-2.5">
          <div className="flex items-center gap-3 md:invisible">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Abrir menu"
              className="rounded-md p-1.5 hover:bg-muted transition-colors"
            >
              <Menu className="size-5" />
            </button>
            <span className="text-sm font-semibold">Admin · Saldão</span>
          </div>
          <NotificationBell />
        </div>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-7xl p-4 sm:p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
