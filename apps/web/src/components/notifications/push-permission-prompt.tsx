'use client';

import { BellRing, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  getVapidPublicKey,
  savePushSubscription,
  urlBase64ToArrayBuffer,
} from '@/lib/notifications';

const SNOOZE_KEY = 'push-permission-snoozed-until';
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function supported(): boolean {
  return (
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function PushPermissionPrompt() {
  const { user, token } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !token || !supported() || Notification.permission !== 'default') return;
    const snoozedUntil = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    if (Number.isFinite(snoozedUntil) && snoozedUntil > Date.now()) return;
    const timer = window.setTimeout(() => setVisible(true), 5000);
    return () => window.clearTimeout(timer);
  }, [token, user]);

  function snooze() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    setVisible(false);
  }

  async function enable() {
    if (!token || !supported()) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      setVisible(false);
      if (permission !== 'granted') return;
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const publicKey = await getVapidPublicKey(token);
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        }));
      await savePushSubscription(token, subscription);
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;

  return (
    <aside className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-xl border bg-background p-4 shadow-lg">
      <button
        type="button"
        onClick={snooze}
        aria-label="Fechar"
        className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <BellRing className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-semibold">Acompanhe seus pedidos</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ative notificações para receber lembretes e ofertas exclusivas. No iPhone, o site
            precisa estar adicionado à Tela de Início.
          </p>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={snooze} className="px-3 py-2 text-xs text-muted-foreground">
          Agora não
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void enable()}
          className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60"
        >
          {busy ? 'Ativando…' : 'Ativar notificações'}
        </button>
      </div>
    </aside>
  );
}
