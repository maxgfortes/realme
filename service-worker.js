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
const DEFAULT_URL = "/feed.html";

const CACHE = "realme-version-1.0.5";
const PRECACHE = [
  "/",
  "/feed.html",
  DEFAULT_ICON
];

const TRUSTED_HOSTS = ["socialrealme.com", "www.socialrealme.com"];

messaging.onBackgroundMessage((payload) => {

  if (payload.notification) return;

  const d = payload.data || {};

  return self.registration.showNotification(
    d.title || "RealMe",
    {
      body: d.body || "Você tem uma nova notificação",
      icon: d.icon || DEFAULT_ICON,
      badge: d.badge || DEFAULT_ICON,
      image: d.image || undefined,
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      vibrate: [100, 50, 100],
      data: {
        url: safeTarget(d.url || DEFAULT_URL)
      }
    }
  );
});

function safeTarget(rawUrl) {
  const fallback = new URL(DEFAULT_URL, self.location.origin).href;

  try {
    const url = new URL(
      rawUrl || DEFAULT_URL,
      self.location.origin
    );

    if (url.origin === self.location.origin) {
      return url.href;
    }

    if (TRUSTED_HOSTS.includes(url.hostname)) {
      return new URL(`${url.pathname}${url.search}${url.hash}`, self.location.origin).href;
    }

    return fallback;
  } catch {
    return fallback;
  }
}

self.addEventListener("notificationclick", (event) => {
  if (event.notification.data?.FCM_MSG) return;

  event.notification.close();

  const target = safeTarget(
    event.notification.data?.url || DEFAULT_URL
  );

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(async (windows) => {
      for (const win of windows) {
        if (
          new URL(win.url).origin === self.location.origin &&
          "focus" in win
        ) {
          try {
            const navigated = await win.navigate(target);
            return (navigated || win).focus();
          } catch {

            break;
          }
        }
      }

      return clients.openWindow(target);
    })
  );
});

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn("Não foi possível armazenar:", url, error);
          }
        })
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("realme-version-") && key !== CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isCacheableRequest(request, url) {
  if (request.method !== "GET") return false;
  if (url.origin !== self.location.origin) return false;

  if (request.mode === "navigate") return false;
  if (url.pathname.startsWith("/api/")) return false;

  return [
    "script",
    "style",
    "image",
    "font"
  ].includes(request.destination);
}

async function cachePut(request, response) {
  if (!response || !response.ok || response.type === "opaque") {
    return;
  }

  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        if (url.pathname === "/") {
          const cached = await caches.match("/");
          if (cached) return cached;
        }

        if (url.pathname === "/feed.html") {
          const cached = await caches.match("/feed.html");
          if (cached) return cached;
        }

        return new Response(
          "Você está offline. Verifique sua conexão e tente novamente.",
          {
            status: 503,
            headers: {
              "Content-Type": "text/plain; charset=utf-8"
            }
          }
        );
      })
    );

    return;
  }

  if (!isCacheableRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      const networkPromise = fetch(request).then((response) => {
        if (response.ok) {
          event.waitUntil(cachePut(request, response));
        }

        return response;
      });

      if (cached) {
        event.waitUntil(
          networkPromise
            .then(() => undefined)
            .catch(() => undefined)
        );

        return cached;
      }

      try {
        return await networkPromise;
      } catch {
        return new Response("Recurso indisponível offline.", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8"
          }
        });
      }
    })
  );
});