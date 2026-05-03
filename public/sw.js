// Service Worker for Push Notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data?.json() || {}; } catch (_) { data = { title: 'שיבוצים', body: e.data?.text() || '' }; }

  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    dir: 'rtl',
    lang: 'he',
    tag: data.tag || 'shibutz',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'מערכת שיבוצים', options)
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const url = e.notification.data?.url || '/';
      for (const c of clients) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
