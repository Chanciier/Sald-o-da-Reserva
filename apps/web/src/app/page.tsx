'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role === 'ADMIN') router.replace('/admin');
    else if (user.role === 'VENDEDOR') router.replace('/vendedor');
    else router.replace('/cliente');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {/* Hero */}
      <section className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-20 text-center">
        <div className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
          Produtos com preço de reserva
        </div>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Saldão da Reversa
        </h1>
        <p className="max-w-lg text-lg text-muted-foreground">
          Encontre produtos incríveis com preços imperdíveis. Estoque limitado, qualidade garantida.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/produtos"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Ver produtos
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border px-6 py-3 text-sm font-semibold hover:bg-muted transition-colors"
          >
            Entrar
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-muted/30 px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold">Por que comprar aqui?</h2>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              {
                icon: '⚡',
                title: 'Entrega rápida',
                desc: 'Enviamos com as melhores transportadoras do Brasil',
              },
              {
                icon: '🔒',
                title: 'Pagamento seguro',
                desc: 'PIX, cartão e boleto com total segurança via Mercado Pago',
              },
              {
                icon: '📦',
                title: 'Nota fiscal',
                desc: 'Todos os pedidos emitem nota fiscal eletrônica automaticamente',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-xl border border-border bg-card p-5 text-center shadow-sm"
              >
                <div className="mb-3 text-3xl">{f.icon}</div>
                <h3 className="mb-1 font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border px-4 py-12 text-center">
        <p className="text-muted-foreground text-sm">
          Já tem uma conta?{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            Faça login
          </Link>{' '}
          ou{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            crie a sua gratuitamente
          </Link>
        </p>
      </section>
    </main>
  );
}
