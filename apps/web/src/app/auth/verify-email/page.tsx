'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { verifyEmailApi, getMeApi } from '@/lib/auth-api';
import { useAuth } from '@/contexts/auth-context';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { user, token: accessToken, updateUser } = useAuth();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    token ? 'loading' : 'error',
  );
  const [errorMsg, setErrorMsg] = useState('Link inválido ou expirado.');

  useEffect(() => {
    if (!token) return;
    verifyEmailApi(token)
      .then(() => setStatus('success'))
      .catch((err: Error) => {
        setErrorMsg(err.message || 'Link inválido ou expirado.');
        setStatus('error');
      });
  }, [token]);

  // Refetch the logged-in profile once verification succeeds — the cached
  // localStorage user still has emailVerifiedAt: null and would leave the
  // "confirm your email" banner showing until the next token refresh otherwise.
  useEffect(() => {
    if (status !== 'success' || !accessToken) return;
    getMeApi(accessToken)
      .then((fresh) => updateUser({ emailVerifiedAt: fresh.emailVerifiedAt }))
      .catch(() => {});
  }, [status, accessToken, updateUser]);

  if (status === 'loading') {
    return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-success/10 px-4 py-6 text-center text-sm text-success">
        <CheckCircle2 className="size-8" />
        <p className="font-semibold">E-mail confirmado com sucesso!</p>
        <Link
          href={user ? '/cliente' : '/login'}
          className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {user ? 'Ir para minha conta' : 'Ir para o login'}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
      <XCircle className="size-8" />
      <p className="font-semibold">{errorMsg}</p>
      <p className="text-muted-foreground">
        Você pode solicitar um novo link em <strong>Minha Conta &gt; Meu Perfil</strong>.
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <Link
            href="/"
            className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Voltar à loja
          </Link>

          <h1 className="mb-2 text-2xl font-bold">Confirmação de e-mail</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Estamos validando seu link de confirmação.
          </p>

          <Suspense fallback={<div className="h-24 animate-pulse rounded-lg bg-muted" />}>
            <VerifyEmailContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
