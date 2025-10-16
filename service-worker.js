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