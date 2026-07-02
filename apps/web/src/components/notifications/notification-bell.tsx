'use client';

import { Bell } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@/contexts/auth-context';
import {
  API_ORIGIN,
  AppNotification,
  getNotifications,
  isAppNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '@/lib/notifications';
import { PushNotificationControl } from './push-notification-control';

function playSound() {
  try {
    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextClass = window.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.addEventListener('ended', () => void context.close());
  } catch {
    // Browsers may block audio until the user interacts with the page.
  }
}

export function NotificationBell() {
  const { token } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let active = true;
    getNotifications(token)
      .then((result) => {
        if (!active) return;
        setNotifications(result.data);
        setUnreadCount(result.unreadCount);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = io(`${API_ORIGIN}/notifications`, {
      auth: { token },
      transports: ['websocket'],
    });
    socket.on('notification', (value: unknown) => {
      if (!isAppNotification(value)) return;
      setNotifications((current) => [value, ...current.filter((item) => item.id !== value.id)]);
      if (!value.readAt) setUnreadCount((count) => count + 1);
      playSound();
    });
    return () => {
      socket.disconnect();
    };
  }, [token]);

  async function openNotification(notification: AppNotification) {
    if (!token) return;
    if (!notification.readAt) {
      try {
        await markNotificationAsRead(token, notification.id);
        setNotifications((current) =>
          current.map((item) =>
            item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
      } catch {
        return;
      }
    }
    setOpen(false);
    // Pedido → tela do pedido; senão produto → edição do produto no admin.
    if (notification.type.startsWith('CART_')) {
      router.push('/carrinho');
    } else if (notification.orderId) {
      router.push(`/pedidos/${notification.orderId}`);
    } else if (notification.productId) {
      router.push(`/admin/produtos/${notification.productId}`);
    }
  }

  async function markAll() {
    if (!token) return;
    try {
      await markAllNotificationsAsRead(token);
      setNotifications((current) =>
        current.map((item) => (item.readAt ? item : { ...item, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      // silencioso — UI permanece consistente na próxima sincronização
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label={`${unreadCount} notificações não lidas`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="size-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-xl sm:w-96">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Notificações</p>
              <p className="text-xs text-muted-foreground">{unreadCount} não lidas</p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs font-medium text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>
          <PushNotificationControl />
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma notificação.
              </p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void openNotification(notification)}
                  className={`block w-full border-b px-4 py-3 text-left transition-colors last:border-0 hover:bg-muted ${
                    notification.readAt ? 'bg-card' : 'bg-primary/5'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!notification.readAt && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{notification.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{notification.message}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {new Date(notification.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
