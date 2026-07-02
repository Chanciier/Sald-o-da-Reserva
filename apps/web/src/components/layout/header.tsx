'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Bookmark, Clock, Menu, Search, ShoppingCart, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';
import { useSavedProducts } from '@/hooks/use-saved-products';
import { pad } from '@/hooks/use-countdown';
import { NotificationBell } from '@/components/notifications/notification-bell';

const anchorLinks = [
  { label: 'Produtos', href: '/produtos' },
  { label: 'Ofertas', href: '#produtos' },
  { label: 'Como Funciona', href: '#como-funciona' },
  { label: 'Benefícios', href: '#beneficios' },
];

export function Header() {
  const { user, logout } = useAuth();
  const { cart, setOpen } = useCart();
  const { savedProducts: saved } = useSavedProducts();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const itemCount = cart?.itemCount ?? 0;
  const isHome = pathname === '/';
  const hasItems = itemCount > 0;

  const [cartTimer, setCartTimer] = useState({ minutes: 15, seconds: 0 });

  useEffect(() => {
    const DEADLINE_KEY = 'cart_checkout_deadline';
    const DURATION_MS = 15 * 60 * 1000;

    if (!hasItems) {
      localStorage.removeItem(DEADLINE_KEY);
      return;
    }

    function getOrCreateDeadline() {
      const stored = localStorage.getItem(DEADLINE_KEY);
      if (stored) {
        const d = parseInt(stored);
        if (d > Date.now()) return d;
      }
      const d = Date.now() + DURATION_MS;
      localStorage.setItem(DEADLINE_KEY, String(d));
      return d;
    }

    function tick(deadline: number) {
      const diff = Math.max(0, deadline - Date.now());
      const total = Math.floor(diff / 1000);
      setCartTimer({ minutes: Math.floor(total / 60), seconds: total % 60 });
    }

    let deadline = getOrCreateDeadline();
    tick(deadline);

    const id = setInterval(() => {
      if (Date.now() >= deadline) {
        deadline = Date.now() + DURATION_MS;
        localStorage.setItem(DEADLINE_KEY, String(deadline));
      }
      tick(deadline);
    }, 1000);

    return () => clearInterval(id);
  }, [hasItems]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [userMenuOpen]);

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur">
      {/* Top strip — only when cart has items */}
      {hasItems && (
        <div className="bg-secondary text-secondary-foreground">
          <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium sm:text-sm">
            <Clock className="size-3.5 text-primary" aria-hidden="true" />
            <span>Você tem</span>
            <span className="font-mono font-bold text-primary tabular-nums">
              {pad(cartTimer.minutes)}:{pad(cartTimer.seconds)}
            </span>
            <span>para concluir a compra</span>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2">
        {/* Logo */}
        <Link
          href="/"
          className="flex shrink-0 items-center"
          aria-label="Saldão da Reversa - início"
        >
          <Image
            src="/logo.png"
            alt="Saldão da Reversa"
            width={140}
            height={56}
            className="h-14 w-auto rounded-xl"
            priority
          />
        </Link>

        {/* Nav desktop (home) ou busca (demais páginas) */}
        {isHome ? (
          <nav
            className="hidden items-center gap-6 text-sm md:flex"
            aria-label="Navegação principal"
          >
            {anchorLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ) : (
          <form
            action="/produtos"
            method="get"
            role="search"
            className="mx-2 hidden max-w-md flex-1 items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm md:flex"
          >
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="search"
              placeholder="Buscar produtos, marcas, categorias..."
              aria-label="Buscar produtos"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </form>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1">
          {user && <NotificationBell />}

          {/* Cart icon */}
          <button
            onClick={() => setOpen(true)}
            className="relative rounded-lg p-2 hover:bg-muted transition-colors"
            aria-label="Carrinho de compras"
          >
            <ShoppingCart className="size-5" />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {itemCount > 99 ? '99+' : itemCount}
              </span>
            )}
          </button>

          {/* User icon + dropdown */}
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setUserMenuOpen((o) => !o)}
              className="rounded-lg p-2 hover:bg-muted transition-colors"
              aria-label="Conta"
              aria-expanded={userMenuOpen}
            >
              <User className="size-5" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-background shadow-lg z-50 overflow-hidden">
                <Link
                  href="/salvos"
                  onClick={() => setUserMenuOpen(false)}
                  className="flex items-center justify-between border-b border-border px-4 py-2.5 text-sm transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <Bookmark className="size-4" aria-hidden="true" />
                    Salvos
                  </span>
                  {saved.length > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                      {saved.length}
                    </span>
                  )}
                </Link>
                {user ? (
                  <>
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-[11px] text-muted-foreground">Olá,</p>
                      <p className="truncate text-sm font-semibold">{user.name ?? user.email}</p>
                    </div>
                    <Link
                      href="/cliente"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm transition-colors hover:bg-muted"
                    >
                      Minha Conta
                    </Link>
                    <button
                      onClick={() => {
                        logout();
                        setUserMenuOpen(false);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-500 transition-colors hover:bg-muted"
                    >
                      Sair
                    </button>
                  </>
                ) : (
                  <>
                    <div className="border-b border-border px-4 py-3">
                      <p className="text-sm text-muted-foreground">Faça login para continuar</p>
                    </div>
                    <Link
                      href="/login"
                      onClick={() => setUserMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      Entrar
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mobile menu toggle */}
          <button
            className="rounded-lg border border-border p-1.5 hover:bg-muted transition-colors md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {/* Busca mobile (demais páginas) */}
      {!isHome && (
        <div className="border-t border-border px-4 py-2 md:hidden">
          <form
            action="/produtos"
            method="get"
            role="search"
            className="flex items-center gap-2 rounded-full border border-border bg-muted px-4 py-2 text-sm"
          >
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="search"
              placeholder="Buscar produtos, marcas, categorias..."
              aria-label="Buscar produtos"
              className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </form>
        </div>
      )}

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          className="mx-4 mb-2 rounded-2xl border border-border bg-background px-4 py-3 md:hidden"
          aria-label="Navegação mobile"
        >
          <ul className="flex flex-col gap-1">
            {(isHome ? anchorLinks : []).map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <Link
                href="/salvos"
                onClick={() => setMobileOpen(false)}
                className="flex items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Bookmark className="size-4" aria-hidden="true" />
                  Salvos
                </span>
                {saved.length > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
                    {saved.length}
                  </span>
                )}
              </Link>
            </li>
            {user ? (
              <>
                <li>
                  <Link
                    href="/cliente"
                    onClick={() => setMobileOpen(false)}
                    className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Minha Conta
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => {
                      logout();
                      setMobileOpen(false);
                    }}
                    className="w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-red-500 hover:bg-muted"
                  >
                    Sair
                  </button>
                </li>
              </>
            ) : (
              <li>
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
                >
                  Entrar
                </Link>
              </li>
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
