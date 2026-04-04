// ===================
// SERVICE WORKER — REALME SPA
// Versão com Firebase Cloud Messaging (FCM) integrado
// ===================

importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

// ─── Firebase init no SW ────────────────────────────────────
firebase.initializeApp({
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[SW] Mensagem em background recebida:", payload);

  const { title, body, icon } = payload.notification || {};
  const data = payload.data || {};

  self.registration.showNotification(title || "RealMe", {
    body:   body || "Você tem uma nova notificação",
    icon:   icon || "./src/icon/icon-192x192.png",
    badge:  "./src/icon/badge-72x72.png",
    vibrate: [200, 100, 200],
    tag:    data.type || "realme-notif",
    renotify: true,
    requireInteraction: false,
    data: {
      url: data.url || "https://ifriendmatch.web.app",
      ...data,
    },
    actions: [
      { action: "open",  title: "Abrir" },
      { action: "close", title: "Fechar" },
    ],
  });
});

// ─── Clique na notificação ───────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (event.action === "close") return;

  const urlToOpen = event.notification.data?.url || "https://ifriendmatch.web.app";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Foca janela já aberta se existir
        for (const client of clientList) {
          if (client.url === urlToOpen && "focus" in client) {
            return client.focus();
          }
        }
        return clients.openWindow(urlToOpen);
      })
  );
});

// ─── Cache e PWA ─────────────────────────────────────────────
const CACHE_NAME = "realme-spa-v2";
const urlsToCache = [
  "./",
  "./feed.html",
  "./explore.html",
  "./src/img/icon.png",
  "./src/img/default.jpg",
];

self.addEventListener("install", (event) => {
  console.log("🔧 SW: Instalando...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(urlsToCache).catch((err) =>
        console.warn("SW cache parcial:", err)
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  console.log("✅ SW: Ativado");
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => k !== CACHE_NAME && caches.delete(k))
      )
    )
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (
    event.request.url.includes("firebase") ||
    event.request.url.includes("googleapis") ||
    event.request.url.includes("gstatic")
  )
    return;

  event.respondWith(
    caches.match(event.request).then(
      (response) =>
        response ||
        fetch(event.request).catch(() => {
          if (event.request.destination === "document") {
            return caches.match("./spa-simple.html");
          }
        })
    )
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

console.log("🚀 SW RealMe carregado com FCM");