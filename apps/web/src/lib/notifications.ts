export interface AppNotification {
  id: string;
  userId: string | null;
  roleTarget: 'ADMIN' | 'VENDEDOR' | 'CLIENTE';
  type: 'ORDER_CREATED' | 'PAYMENT_APPROVED';
  title: string;
  message: string;
  orderId: string;
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

export function isAppNotification(value: unknown): value is AppNotification {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.message === 'string' &&
    typeof item.orderId === 'string' &&
    typeof item.createdAt === 'string' &&
    (item.readAt === null || typeof item.readAt === 'string')
  );
}
