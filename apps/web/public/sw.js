self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === 'string' ? payload.title : 'Saldão da Reversa';
  const body = typeof payload.body === 'string' ? payload.body : 'Você recebeu uma notificação.';
  const url =
    typeof payload.url === 'string' && payload.url.startsWith('/') ? payload.url : '/admin';
  const tag = typeof payload.tag === 'string' ? payload.tag : 'saldao-notification';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon.png',
      badge: '/icon.png',
      tag,
      renotify: true,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data?.url;
  const safePath = typeof path === 'string' && path.startsWith('/') ? path : '/admin';
  const targetUrl = new URL(safePath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
