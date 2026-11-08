// CampusRide PWA — Unified Offline-First PWA & OneSignal Service Worker
let oneSignalLoaded = false;
try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
  oneSignalLoaded = true;
} catch (e) {
  // Offline or local environment fallback
}

const CACHE_NAME = 'campusride-aju-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './OneSignalSDKWorker.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Cache same-origin GET requests; let Google Sheets GViz & OneSignal pass through cleanly
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request).catch(() => caches.match('./index.html'));
    })
  );
});

if (!oneSignalLoaded) {
  self.addEventListener('push', (e) => {
    let data = { title: 'CampusRide Transit Alert', body: 'Live bus status updated.', url: './' };
    if (e.data) {
      try {
        data = e.data.json();
      } catch (err) {
        data.body = e.data.text();
      }
    }
    const options = {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      vibrate: [200, 100, 200],
      data: { url: data.url || './' }
    };
    e.waitUntil(self.registration.showNotification(data.title, options));
  });
}

self.addEventListener('notificationclick', (e) => {
  if (e.notification && e.notification.data && e.notification.data.custom) return;
  e.notification.close();
  const targetUrl = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
