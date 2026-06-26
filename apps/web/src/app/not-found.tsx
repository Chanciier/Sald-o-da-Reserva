import Link from 'next/link';
import Image from 'next/image';
import { Home, Search } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4 py-16 text-center">
      <Image
        src="/logo.png"
        alt="Saldão da Reversa"
        width={72}
        height={72}
        className="mb-6 rounded-xl"
      />

      <p className="text-6xl font-black text-primary">404</p>
      <h1 className="mt-2 text-2xl font-bold">Página não encontrada</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        O link pode estar quebrado ou a página foi removida. Que tal continuar a garimpar nossas
        ofertas?
      </p>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Home className="size-4" />
          Voltar ao início
        </Link>
        <Link
          href="/produtos"
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Search className="size-4" />
          Ver produtos
        </Link>
      </div>
    </main>
  );
}
