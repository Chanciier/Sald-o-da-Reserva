export interface AppNotification {
  id: string;
  userId: string | null;
  roleTarget: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
  type: string;
  title: string;
  message: string;
  orderId: string | null;
  productId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  data: AppNotification[];
  unreadCount: number;
}

export const API_ORIGIN = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(
  /\/$/,
  '',
);

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export async function getNotifications(token: string): Promise<NotificationsResponse> {
  const response = await fetch(`${API_ORIGIN}/api/v1/notifications`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Não foi possível carregar as notificações.');
  return response.json() as Promise<NotificationsResponse>;
}

export async function markNotificationAsRead(token: string, id: string): Promise<void> {
  const response = await fetch(
    `${API_ORIGIN}/api/v1/notifications/${encodeURIComponent(id)}/read`,
    {
      method: 'PATCH',
      headers: authHeaders(token),
    },
  );
  if (!response.ok) throw new Error('Não foi possível marcar a notificação como lida.');
}

export async function markAllNotificationsAsRead(token: string): Promise<void> {
  const response = await fetch(`${API_ORIGIN}/api/v1/notifications/read-all`, {
    method: 'PATCH',
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error('Não foi possível marcar todas como lidas.');
}

export async function getVapidPublicKey(token: string): Promise<string> {
  const response = await fetch(`${API_ORIGIN}/api/v1/notifications/push/public-key`, {
    headers: authHeaders(token),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error('Web Push ainda não está configurado.');
  const body = (await response.json()) as { publicKey?: unknown };
  if (typeof body.publicKey !== 'string' || body.publicKey.length < 40) {
    throw new Error('Chave Web Push inválida.');
  }
  return body.publicKey;
}

export async function savePushSubscription(
  token: string,
  subscription: PushSubscription,
): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
    throw new Error('Inscrição Web Push inválida.');
  }
  const response = await fetch(`${API_ORIGIN}/api/v1/notifications/push/subscription`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  });
  if (!response.ok) throw new Error('Não foi possível ativar o Web Push.');
}

export async function removePushSubscription(token: string, endpoint: string): Promise<void> {
  const response = await fetch(`${API_ORIGIN}/api/v1/notifications/push/subscription`, {
    method: 'DELETE',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error('Não foi possível desativar o Web Push.');
}

export function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes.buffer as ArrayBuffer;
}

export function isAppNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.message === 'string' &&
    (item.orderId === null || typeof item.orderId === 'string') &&
    typeof item.createdAt === 'string' &&
    (item.readAt === null || typeof item.readAt === 'string')
  );
}
