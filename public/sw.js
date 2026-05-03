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
    data: { url: data.url || '/?tab=me' }
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'מערכת שיבוצים', options)
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const targetUrl = e.notification.data?.url || '/?tab=me';

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // If app is already open — focus it and send a message to navigate
      for (const c of clients) {
        if (c.url.startsWith(self.location.origin)) {
          c.postMessage({ type: 'NAVIGATE_TAB', tab: 'me' });
          return c.focus();
        }
      }
      // App is closed — open to the right URL
      return self.clients.openWindow(targetUrl);
    })
  );
});
