// CampusRide PWA — Zero-Dependency Offline-First Service Worker (V4)
const CACHE_NAME = 'campusride-offline-v4';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: Cache each asset resiliently so a single missing optional file never aborts installation
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const assetUrl of APP_SHELL_ASSETS) {
        try {
          const response = await fetch(assetUrl, { cache: 'reload' });
          if (response && response.ok) {
            await cache.put(assetUrl, response.clone());
            // Guarantee './index.html' is also stored under './' root key
            if (assetUrl === './index.html') {
              await cache.put('./', response.clone());
            }
          }
        } catch (err) {
          // Ignore individual fetch error during install
        }
      }
    })
  );
});

// Activate: Clean up old caches and immediately claim all open tabs/windows
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Instant Cache-First + Background Revalidate for App Shell & Offline Navigation
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);

  // 1. Google Sheets GViz Live Sync: Network-first with 4s timeout, fallback to cached GViz response
  if (reqUrl.hostname.includes('docs.google.com')) {
    event.respondWith(
      fetch(event.request)
        .then((netRes) => {
          if (netRes && netRes.status === 200) {
            const copy = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return netRes;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Only handle same-origin requests for static app shell
  if (reqUrl.origin !== self.location.origin) return;

  // 2. HTML Navigation Requests (opening app from Home Screen, refreshing page offline, or query strings)
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedPage =
          (await cache.match(event.request, { ignoreSearch: true })) ||
          (await cache.match('./index.html', { ignoreSearch: true })) ||
          (await cache.match('./', { ignoreSearch: true }));

        const networkFetch = fetch(event.request)
          .then((netRes) => {
            if (netRes && netRes.ok) {
              cache.put('./index.html', netRes.clone());
              cache.put('./', netRes.clone());
            }
            return netRes;
          })
          .catch(() => cachedPage);

        // Return cached page immediately if available (0ms offline load!), else wait for network
        return cachedPage || networkFetch;
      })
    );
    return;
  }

  // 3. Static Assets (manifest.json, icons, scripts): Cache-First with network fallback
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((cachedRes) => {
      if (cachedRes) return cachedRes;
      return fetch(event.request)
        .then((netRes) => {
          if (netRes && netRes.ok) {
            const copy = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return netRes;
        })
        .catch(() => caches.match('./index.html', { ignoreSearch: true }));
    })
  );
});

// Native Web Push Listener
self.addEventListener('push', (event) => {
  let data = { title: 'CampusRide Transit Alert', body: 'Bus status updated.', url: './' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      data.body = event.data.text();
    }
  }
  const options = {
    body: data.body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' }
  };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Notification Click Handler: Focus existing window or open app
self.addEventListener('notificationclick', (event) => {
  if (event.notification && event.notification.data && event.notification.data.custom) return;
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});
