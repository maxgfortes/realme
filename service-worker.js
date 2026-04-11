const CACHE_NAME = 'realme-spa-v1';
const urlsToCache = [
  './',
  './src/styles/base.css',
  './src/styles/components.css',
  './src/icon/icon.png',
  './src/icon/default.jpg'
];

self.addEventListener('install', event => {
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache.filter(url => url !== undefined));
      })
      .catch(error => {
        console.log('Service Worker: Erro ao cachear :', error);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});


self.addEventListener('fetch', event => {

  if (event.request.method !== 'GET') {
    return;
  }
  
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }

        return fetch(event.request).catch(() => {
          if (event.request.destination === 'document') {
            return caches.match('./spa-simple.html');
          }
        });
      }
    )
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  
  const options = {
    body: data.body || 'Você tem uma nova notificação',
    icon: data.icon || './src/icon/icon-192x192.png',
    badge: './src/icon/badge-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || '/',
      notificationId: data.notificationId
    },
    actions: [
      {
        action: 'open',
        title: 'Abrir'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ],
    tag: data.tag || 'notification',
    renotify: true,
    requireInteraction: false
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'RealMe', options)
  );
});


self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (let client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPosts());
  }
});

async function syncPosts() {
  console.log('Sincronizando posts...');
}