import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

import {
  doc,
  setDoc,
  updateDoc,
  deleteField,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { app, db } from "/src/config/config.js";

const VAPID_KEY = "BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg";
const DEFAULT_ICON = "/public/img/icon.png";
const SAVE_EVERY_MS = 24 * 60 * 60 * 1000;

const modal = document.getElementById("pushModal");

let listening = false;

async function saveToken(uid) {
  const swReg = await navigator.serviceWorker.register("/service-worker.js");
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });

  if (!token) return;

  const marker = `${uid}:${token}`;
  const savedAt = Number(localStorage.getItem("fcmTokenSavedAt") || 0);

  if (
    localStorage.getItem("fcmTokenKey") !== marker ||
    Date.now() - savedAt > SAVE_EVERY_MS
  ) {
    await setDoc(
      doc(db, "users", uid),
      { fcmToken: token, fcmTokenUpdatedAt: serverTimestamp() },
      { merge: true }
    );

    localStorage.setItem("fcmTokenKey", marker);
    localStorage.setItem("fcmTokenSavedAt", String(Date.now()));
  }

  if (listening) return;
  listening = true;

  onMessage(messaging, async (payload) => {
    const n = payload.notification || {};
    const d = payload.data || {};

    const title = n.title || d.title;
    if (!title) return;

    const reg = await navigator.serviceWorker.ready;

    reg.showNotification(title, {
      body: n.body || d.body || "",
      icon: n.icon || DEFAULT_ICON,
      badge: DEFAULT_ICON,
      image: n.image || undefined,
      tag: d.type ? `${d.type}:${d.postId || d.chatId || d.uid || ""}` : undefined,
      renotify: Boolean(d.type),
      data: { url: d.url || "/feed.html" },
    });
  });
}

export async function initPush(uid) {
  if (!(await isSupported()) || !("Notification" in window)) return;

  if (Notification.permission === "granted") return saveToken(uid);

  if (Notification.permission === "denied") return;

  if (localStorage.getItem("pushPrompted")) return;

  if (!modal) return;

  modal.classList.add("active");

  const enableBtn = document.getElementById("pushEnableBtn");
  const laterBtn = document.getElementById("pushLaterBtn");

  if (enableBtn) {
    enableBtn.onclick = async () => {
      const result = await Notification.requestPermission();
      modal.classList.remove("active");
      localStorage.setItem("pushPrompted", "1");
      if (result === "granted") await saveToken(uid);
    };
  }

  if (laterBtn) {
    laterBtn.onclick = () => {
      modal.classList.remove("active");
      localStorage.setItem("pushPrompted", "1");
    };
  }
}

export async function removePush(uid) {
  try {
    if (await isSupported()) {
      await updateDoc(doc(db, "users", uid), { fcmToken: deleteField() }).catch(() => {});
      await deleteToken(getMessaging(app)).catch(() => {});
    }
  } finally {
    localStorage.removeItem("fcmTokenKey");
    localStorage.removeItem("fcmTokenSavedAt");
  }
}