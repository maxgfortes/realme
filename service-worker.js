// ===================
// SERVICE WORKER BÁSICO - REALME SPA
// ===================

const CACHE_NAME = 'realme-spa-v1';
const urlsToCache = [
  './',
  './spa-simple.html',
  './spa.html',
  './src/styles/base.css',
  './src/styles/components.css',
  './src/styles/layout.css',
  './src/icon/icon.png',
  './src/icon/default.jpg'
];

// Instalação do Service Worker
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Cache aberto');
        return cache.addAll(urlsToCache.filter(url => url !== undefined));
      })
      .catch(error => {
        console.log('📦 Service Worker: Erro ao cachear (normal):', error);
      })
  );
});

// Ativação do Service Worker
self.addEventListener('activate', event => {
  console.log('✅ Service Worker: Ativado');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Interceptação de requisições
self.addEventListener('fetch', event => {
  // Só cachear requisições GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Não cachear Firebase ou APIs externas
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.url.includes('gstatic')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Se encontrou no cache, retorna
        if (response) {
          return response;
        }
        
        // Senão, busca na rede
        return fetch(event.request).catch(() => {
          // Se falhar, retorna página offline (se necessário)
          if (event.request.destination === 'document') {
            return caches.match('./spa-simple.html');
          }
        });
      }
    )
  );
});

// Mensagens do main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('🚀 Service Worker carregado - RealMe SPA');


// NOTIFICAÇÕES PUSH
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

// Clique na notificação
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const urlToOpen = event.notification.data.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // Procura por uma janela já aberta
        for (let client of clientList) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Se não encontrou, abre uma nova
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Background sync para posts offline
self.addEventListener('sync', event => {
  if (event.tag === 'sync-posts') {
    event.waitUntil(syncPosts());
  }
});

async function syncPosts() {
  // Implementar sincronização de posts salvos offline
  console.log('Sincronizando posts...');
}