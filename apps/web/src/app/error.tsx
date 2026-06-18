'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to the console / monitoring for diagnosis
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-destructive/10">
        <RefreshCw className="size-7 text-destructive" />
      </div>

      <h1 className="mt-6 text-2xl font-bold">Algo deu errado</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Tivemos um problema ao carregar esta página. Tente novamente — se o erro persistir, volte ao
        início.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-xs text-muted-foreground/60">Código: {error.digest}</p>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button
          onClick={reset}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RefreshCw className="size-4" />
          Tentar novamente
        </button>
        <Link
          href="/"
          className="flex items-center justify-center gap-2 rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Home className="size-4" />
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
