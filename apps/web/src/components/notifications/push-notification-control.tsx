'use client';

import { BellOff, BellRing, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  getVapidPublicKey,
  removePushSubscription,
  savePushSubscription,
  urlBase64ToArrayBuffer,
} from '@/lib/notifications';

type PushState = 'checking' | 'unsupported' | 'inactive' | 'active' | 'denied' | 'error';

function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function PushNotificationControl() {
  const { user, token } = useAuth();
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !token) return;
    if (!isPushSupported()) {
      setState('unsupported');
      return;
    }

    let active = true;
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => registration.pushManager.getSubscription())
      .then(async (subscription) => {
        if (!active) return;
        if (subscription) {
          await savePushSubscription(token, subscription);
          setState('active');
        } else {
          setState(Notification.permission === 'denied' ? 'denied' : 'inactive');
        }
      })
      .catch(() => active && setState('error'));

    return () => {
      active = false;
    };
  }, [token, user]);

  if (!user) return null;

  async function enablePush() {
    if (!token || !isPushSupported()) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'inactive');
        return;
      }
      const [registration, publicKey] = await Promise.all([
        navigator.serviceWorker.ready,
        getVapidPublicKey(token),
      ]);
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(publicKey),
        }));
      await savePushSubscription(token, subscription);
      setState('active');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    if (!token || !isPushSupported()) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(token, subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState('inactive');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'unsupported') {
    return (
      <p className="border-b px-4 py-3 text-xs text-muted-foreground">
        No iPhone, adicione o site à Tela de Início para ativar notificações push.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="border-b px-4 py-3 text-xs text-destructive">
        Notificações bloqueadas nas configurações do navegador.
      </p>
    );
  }

  return (
    <button
      type="button"
      disabled={busy || state === 'checking'}
      onClick={() => void (state === 'active' ? disablePush() : enablePush())}
      className="flex w-full items-center gap-2 border-b px-4 py-2.5 text-left text-xs transition-colors hover:bg-muted disabled:cursor-wait disabled:opacity-60"
    >
      {busy || state === 'checking' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : state === 'active' ? (
        <BellRing className="size-4 text-primary" />
      ) : (
        <BellOff className="size-4" />
      )}
      <span>
        {state === 'active'
          ? 'Push ativado neste aparelho'
          : state === 'error'
            ? 'Tentar ativar push novamente'
            : 'Ativar push neste aparelho'}
      </span>
    </button>
  );
}
