importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de"
});

const messaging = firebase.messaging();

const DEFAULT_ICON = "/public/img/icon.png";

messaging.onBackgroundMessage((payload) => {
  if (payload.notification) return;

  const d = payload.data || {};

  return self.registration.showNotification(d.title || "RealMe", {
    body: d.body || "Você tem uma nova notificação",
    icon: d.icon || DEFAULT_ICON,
    badge: d.badge || DEFAULT_ICON,
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    vibrate: [100, 50, 100],
    data: { url: d.url || "/feed.html" },
  });
});

function safeTarget(rawUrl) {
  try {
    const url = new URL(rawUrl || "/feed.html", self.location.origin);
    return url.origin === self.location.origin ? url.href : `${self.location.origin}/feed.html`;
  } catch {
    return `${self.location.origin}/feed.html`;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = safeTarget(event.notification.data?.url);

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          try {
            const navigated = await w.navigate(target);
            return (navigated || w).focus();
          } catch {
            break;
          }
        }
      }
      return clients.openWindow(target);
    })
  );
});

const CACHE = "realme-version-1.0.1";
const PRECACHE = ["/", "/feed.html", "/public/img/icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function cachePut(req, res) {
  const copy = res.clone();
  caches.open(CACHE).then((c) => c.put(req, copy));
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) cachePut(req, res);
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/feed.html")))
    );
    return;
  }

  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) cachePut(req, res);
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cachePut(req, res);
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});