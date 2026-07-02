'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { notifyConsentChanged } from '@/lib/analytics';

type Consent = { necessary: true; analytics: boolean; marketing: boolean };

const STORAGE_KEY = 'cookie_consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) setVisible(true);
    } catch {
      // localStorage unavailable
    }
  }, []);

  function save(consent: Consent) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...consent, savedAt: Date.now() }));
    } catch {
      // ignore
    }
    notifyConsentChanged();
    setVisible(false);
    setCustomizing(false);
  }

  function acceptAll() {
    save({ necessary: true, analytics: true, marketing: true });
  }

  function rejectOptional() {
    save({ necessary: true, analytics: false, marketing: false });
  }

  function saveCustom() {
    save({ necessary: true, analytics, marketing });
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card shadow-lg">
      <div className="mx-auto max-w-7xl px-4 py-4">
        {customizing ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-sm font-semibold">Personalizar cookies</h3>
              <button
                onClick={() => setCustomizing(false)}
                className="rounded-md p-1 hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <label className="flex items-start gap-3">
                <input type="checkbox" checked disabled className="mt-0.5 accent-primary" />
                <div>
                  <p className="font-medium">Necessários</p>
                  <p className="text-muted-foreground text-xs">
                    Sessão de login e carrinho. Não podem ser desativados.
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="font-medium">Analíticos</p>
                  <p className="text-muted-foreground text-xs">
                    Dados anônimos para melhorar a experiência (Vercel Analytics).
                  </p>
                </div>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-0.5 accent-primary"
                />
                <div>
                  <p className="font-medium">Marketing</p>
                  <p className="text-muted-foreground text-xs">
                    Personalização de anúncios e campanhas.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveCustom}
                className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Salvar preferências
              </button>
              <button
                onClick={() => setCustomizing(false)}
                className="rounded-lg border border-border px-4 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                Voltar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground max-w-2xl">
              Usamos cookies para melhorar sua experiência. Veja nossa{' '}
              <Link href="/cookies" className="text-primary hover:underline">
                Política de Cookies
              </Link>
              .
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button
                onClick={() => setCustomizing(true)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                Personalizar
              </button>
              <button
                onClick={rejectOptional}
                className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors"
              >
                Recusar opcionais
              </button>
              <button
                onClick={acceptAll}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Aceitar tudo
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
