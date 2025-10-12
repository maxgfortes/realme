/**
 * RealMe - Service Worker para Notificações Push
 * 
 * Este service worker gerencia as notificações push no navegador,
 * permitindo que notificações sejam recebidas mesmo quando a página não está aberta.
 */

// Nome do cache para recursos estáticos
const CACHE_NAME = 'realme-notifications-v1';

// Recursos para cachear
const urlsToCache = [
  '/index.html',
  '/src/icon/icon.png'
];

/**
 * Evento de instalação do Service Worker
 * Cacheia recursos estáticos quando o SW é instalado
 */
self.addEventListener('install', (event) => {
  console.log('Service Worker: Instalando...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Cache aberto');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Recursos cacheados com sucesso');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Erro ao cachear recursos:', error);
      })
  );
});

/**
 * Evento de ativação do Service Worker
 * Limpa caches antigos quando uma nova versão é ativada
 */
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Ativando...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker: Ativado com sucesso');
      return self.clients.claim();
    })
  );
});

/**
 * Evento de push - recebe notificações push do Firebase Cloud Messaging
 * Exibe notificações quando mensagens são recebidas
 */
self.addEventListener('push', (event) => {
  console.log('Service Worker: Notificação push recebida');
  
  let notificationData = {
    title: 'Nova Notificação - RealMe',
    body: 'Você tem uma nova atualização!',
    icon: '/src/icon/icon.png',
    badge: '/src/icon/icon.png',
    tag: 'realme-notification',
    requireInteraction: false,
    data: {
      url: '/feed.html'
    }
  };
  
  // Se houver dados na mensagem push, usá-los
  if (event.data) {
    try {
      const payload = event.data.json();
      console.log('Service Worker: Dados da notificação:', payload);
      
      if (payload.notification) {
        notificationData = {
          title: payload.notification.title || notificationData.title,
          body: payload.notification.body || notificationData.body,
          icon: payload.notification.icon || notificationData.icon,
          badge: payload.notification.badge || notificationData.badge,
          tag: payload.notification.tag || notificationData.tag,
          requireInteraction: payload.notification.requireInteraction || false,
          data: payload.data || notificationData.data
        };
      }
    } catch (error) {
      console.error('Service Worker: Erro ao processar dados da notificação:', error);
    }
  }
  
  // Exibir a notificação
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      data: notificationData.data,
      vibrate: [200, 100, 200],
      actions: [
        {
          action: 'open',
          title: 'Abrir',
          icon: '/src/icon/icon.png'
        },
        {
          action: 'close',
          title: 'Fechar'
        }
      ]
    })
  );
});

/**
 * Evento de clique na notificação
 * Abre a URL especificada quando o usuário clica na notificação
 */
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notificação clicada');
  
  event.notification.close();
  
  // Se a ação for 'close', apenas fechar
  if (event.action === 'close') {
    return;
  }
  
  // Abrir a URL especificada nos dados da notificação
  const urlToOpen = event.notification.data?.url || '/feed.html';
  
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then((clientList) => {
      // Verificar se já existe uma janela aberta com o RealMe
      for (let client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          // Se existir, focar nela e navegar para a URL
          return client.focus().then(() => {
            return client.navigate(urlToOpen);
          });
        }
      }
      
      // Se não existir, abrir uma nova janela
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

/**
 * Evento de fechamento da notificação
 * Registra quando uma notificação é fechada sem ser clicada
 */
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notificação fechada');
});

/**
 * Evento de fetch - intercepta requisições de rede
 * Serve recursos do cache quando possível (offline-first)
 */
self.addEventListener('fetch', (event) => {
  // Apenas cachear requisições GET
  if (event.request.method !== 'GET') {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Retornar do cache se disponível
        if (response) {
          return response;
        }
        
        // Caso contrário, buscar da rede
        return fetch(event.request).then((response) => {
          // Não cachear respostas inválidas
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          
          // Clonar a resposta
          const responseToCache = response.clone();
          
          // Cachear para uso futuro (apenas recursos estáticos)
          if (event.request.url.match(/\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf)$/)) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          
          return response;
        });
      })
      .catch(() => {
        // Retornar uma página offline se disponível
        return caches.match('/index.html');
      })
  );
});

/**
 * Evento de mensagem - permite comunicação entre a página e o service worker
 */
self.addEventListener('message', (event) => {
  console.log('Service Worker: Mensagem recebida:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('Service Worker: Script carregado');
