const CACHE_NAME = 'realme-cache-v1';

// lista de arquivos principais pra cachear
const URLS_TO_CACHE = [
  '/login.html',
  '/feed.html',
  '/pf.html',
  '/direct-mobile.html',
  '/manifest.json',
  '/src/css/style.css',
  '/src/js/main.js',
  '/src/icon/icon-192.png',
  '/src/icon/icon-512.png'
];

// instala o service worker e guarda os arquivos
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

// ativa e limpa caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// intercepta requisições
self.addEventListener('fetch', event => {
  // garante que o modo standalone não se quebre
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(event.request).then(resp => resp || caches.match('/login.html'))
      )
    );
  } else {
    // pra imagens, CSS, JS etc: tenta cache primeiro
    event.respondWith(
      caches.match(event.request).then(resp => resp || fetch(event.request))
    );
  }
});
