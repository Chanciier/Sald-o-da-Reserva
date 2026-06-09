'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch(`${API}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        throw new Error(data.message ?? 'Erro ao enviar e-mail.');
      }

      setStatus('sent');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setStatus('error');
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          <Link
            href="/login"
            className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Voltar ao login
          </Link>

          <h1 className="mb-2 text-2xl font-bold">Esqueci minha senha</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Informe seu e-mail e enviaremos as instruções para redefinir sua senha.
          </p>

          {status === 'sent' ? (
            <div className="rounded-lg bg-success/10 px-4 py-4 text-sm text-success">
              <p className="font-semibold">E-mail enviado!</p>
              <p className="mt-1 text-muted-foreground">
                Verifique sua caixa de entrada (e a pasta de spam). O link expira em 1 hora.
              </p>
              <Link
                href="/login"
                className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
              >
                Voltar ao login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium">E-mail</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="seu@email.com"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {status === 'error' && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {errorMsg}
                </p>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {status === 'loading' ? 'Enviando...' : 'Enviar instruções'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
