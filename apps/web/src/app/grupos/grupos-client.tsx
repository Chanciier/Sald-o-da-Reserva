'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, MessageCircle, PartyPopper, ShoppingBag, Users } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const REDIRECT_DELAY_MS = 1500;

interface JoinResponse {
  available: boolean;
  group?: { id: string; name: string; inviteLink: string };
}

type Status =
  | { kind: 'loading' }
  | { kind: 'redirecting'; group: NonNullable<JoinResponse['group']> }
  | { kind: 'full' }
  | { kind: 'error' };

export function GruposClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const requested = useRef(false);

  useEffect(() => {
    // Evita registrar o acesso duas vezes no StrictMode/dev.
    if (requested.current) return;
    requested.current = true;

    async function join() {
      try {
        const qs = new URLSearchParams();
        for (const key of ['utm_source', 'utm_medium', 'utm_campaign'] as const) {
          const value = searchParams.get(key);
          if (value)
            qs.set(
              key.replace(/_(.)/g, (_, c: string) => c.toUpperCase()),
              value,
            );
        }
        if (document.referrer) qs.set('referrer', document.referrer.slice(0, 500));
        try {
          const visitorId = localStorage.getItem('analytics_visitor_id');
          if (visitorId) qs.set('visitorId', visitorId);
        } catch {
          // sem localStorage, segue anônimo
        }

        const res = await fetch(`${API}/api/v1/community/join?${qs.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as JoinResponse;

        if (data.available && data.group) {
          const group = data.group;
          setStatus({ kind: 'redirecting', group });
          setTimeout(() => {
            window.location.href = group.inviteLink;
          }, REDIRECT_DELAY_MS);
        } else {
          setStatus({ kind: 'full' });
        }
      } catch {
        setStatus({ kind: 'error' });
      }
    }

    void join();
  }, [searchParams]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-4 py-16 text-center">
      {status.kind === 'loading' && (
        <>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]/10">
            <Loader2 className="h-8 w-8 animate-spin text-[#25D366]" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">Encontrando o melhor grupo para você...</h1>
          <p className="text-muted-foreground">
            Estamos verificando qual grupo tem vaga para te receber.
          </p>
        </>
      )}

      {status.kind === 'redirecting' && (
        <>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#25D366]/10">
            <PartyPopper className="h-8 w-8 text-[#25D366]" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">Tudo pronto!</h1>
          <p className="mb-6 text-muted-foreground">
            Você foi direcionado para o grupo{' '}
            <span className="font-semibold text-foreground">{status.group.name}</span>. Abrindo o
            WhatsApp...
          </p>
          <a
            href={status.group.inviteLink}
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white transition hover:bg-[#1fb959]"
          >
            <MessageCircle className="h-5 w-5" />
            Entrar no grupo agora
          </a>
          <p className="mt-4 text-xs text-muted-foreground">
            Não abriu? Toque no botão acima para entrar.
          </p>
        </>
      )}

      {(status.kind === 'full' || status.kind === 'error') && (
        <>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <Users className="h-8 w-8 text-amber-600" />
          </div>
          <h1 className="mb-2 text-2xl font-bold">
            {status.kind === 'full'
              ? 'Nossos grupos estão lotados! 🎉'
              : 'Não conseguimos te conectar agora'}
          </h1>
          <p className="mb-6 text-muted-foreground">
            {status.kind === 'full'
              ? 'A procura foi tão grande que todos os grupos encheram. Estamos abrindo novos grupos em breve — volte mais tarde para garantir sua vaga!'
              : 'Tivemos um problema temporário. Tente novamente em alguns instantes.'}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {status.kind === 'error' && (
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 font-semibold text-white transition hover:bg-[#1fb959]"
              >
                Tentar novamente
              </button>
            )}
            <Link
              href="/produtos"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border px-6 py-3 font-semibold transition hover:bg-muted"
            >
              <ShoppingBag className="h-5 w-5" />
              Ver ofertas no site
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
