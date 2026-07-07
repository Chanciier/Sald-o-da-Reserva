'use client';

import { useEffect, useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { getMeApi, resendVerificationApi } from '@/lib/auth-api';

export function EmailVerificationBanner() {
  const { user, token, updateUser } = useAuth();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // O usuário em cache (localStorage) só é atualizado no refresh de token ou
  // login — se a confirmação aconteceu em outra aba/dispositivo, esta sessão
  // nunca fica sabendo. Revalida contra o servidor sempre que o banner monta.
  useEffect(() => {
    if (!token || !user || user.emailVerifiedAt) return;
    getMeApi(token)
      .then((fresh) => {
        if (fresh.emailVerifiedAt) updateUser({ emailVerifiedAt: fresh.emailVerifiedAt });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, user?.id]);

  if (!user || user.emailVerifiedAt || !token) return null;

  async function handleResend() {
    setStatus('sending');
    try {
      await resendVerificationApi(token!);
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-accent">
        <MailWarning className="size-4 shrink-0" />
        <span>
          {status === 'sent'
            ? 'Link de confirmação reenviado — confira sua caixa de entrada.'
            : 'Confirme seu e-mail para liberar todos os recursos da sua conta.'}
        </span>
      </div>
      {status !== 'sent' && (
        <button
          onClick={handleResend}
          disabled={status === 'sending'}
          className="shrink-0 rounded-lg border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/20 disabled:opacity-60 transition-colors"
        >
          {status === 'sending'
            ? 'Enviando...'
            : status === 'error'
              ? 'Tentar novamente'
              : 'Reenviar e-mail'}
        </button>
      )}
    </div>
  );
}
