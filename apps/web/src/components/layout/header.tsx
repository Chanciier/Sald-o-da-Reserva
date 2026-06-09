'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Tag, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useCart } from '@/contexts/cart-context';

const anchorLinks = [
  { label: 'Ofertas', href: '#produtos' },
  { label: 'Como Funciona', href: '#como-funciona' },
  { label: 'Benefícios', href: '#beneficios' },
];

const navLinks = [
  { label: 'Produtos', href: '/produtos' },
  { label: 'Categorias', href: '/categorias' },
];

export function Header() {
  const { user, logout } = useAuth();
  const { cart, setOpen } = useCart();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const itemCount = cart?.itemCount ?? 0;
  const isHome = pathname === '/';
  const links = isHome ? anchorLinks : navLinks;

  return (
    <header className="sticky top-0 z-40 w-full bg-background/95 backdrop-blur">
      {/* Top strip */}
      <div className="bg-secondary text-secondary-foreground">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium sm:text-sm">
          <Tag className="size-3.5 text-primary" aria-hidden="true" />
          <span>Frete grátis acima de R$ 199</span>
        </div>
      </div>

      <div className="px-4 py-2">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-2xl border border-border bg-background px-5 py-2 shadow-sm">
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
              className="h-14 w-auto"
              priority
            />
          </Link>

          {/* Nav desktop */}
          <nav
            className="hidden items-center gap-5 text-sm md:flex"
            aria-label="Navegação principal"
          >
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Cart */}
            <button
              onClick={() => setOpen(true)}
              className="relative flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              aria-label="Carrinho de compras"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <span className="hidden sm:inline">Carrinho</span>
              {itemCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                  {itemCount > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <Link
                  href="/cliente"
                  className="hidden text-sm text-muted-foreground hover:text-foreground transition-colors sm:block"
                >
                  Minha Conta
                </Link>
                <button
                  onClick={logout}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  Sair
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Entrar
              </Link>
            )}

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
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <nav
          className="mx-4 mb-2 rounded-2xl border border-border bg-background px-4 py-3 md:hidden"
          aria-label="Navegação mobile"
        >
          <ul className="flex flex-col gap-1">
            {links.map((link) => (
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
                    className="w-full text-left rounded-md px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted"
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
