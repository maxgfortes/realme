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
const CLOSE_MS = 300;

let listening = false;

/* ---------- Modal ---------- */

function openModal(modal) {
  modal.style.display = "";
  void modal.offsetWidth; // força reflow pra transição disparar

  modal.classList.add("active");
  modal.querySelector(".push-box-overlay")?.classList.add("active");
  modal.querySelector(".push-modal-box")?.classList.add("active");
}

function closeModal(modal) {
  modal.querySelector(".push-box-overlay")?.classList.remove("active");
  modal.querySelector(".push-modal-box")?.classList.remove("active");

  setTimeout(() => modal.classList.remove("active"), CLOSE_MS);
}

/* ---------- Token ---------- */

async function saveToken(uid) {
  const swReg = await navigator.serviceWorker.register("/service-worker.js");
  await navigator.serviceWorker.ready;

  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });

  if (!token) {
    console.warn("[push] getToken retornou vazio");
    return;
  }

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

/* ---------- Init ---------- */

export async function initPush(uid) {
  const supported = await isSupported().catch(() => false);
  if (!supported || !("Notification" in window)) return;

  // já liberou: só garante o token salvo
  if (Notification.permission === "granted") {
    return saveToken(uid).catch((e) => console.error("[push] saveToken falhou", e));
  }

  // bloqueou no navegador: não adianta mostrar
  if (Notification.permission === "denied") return;

  // já mostrou o modal uma vez
  if (localStorage.getItem("pushPrompted")) return;

  const modal = document.getElementById("pushModal");
  if (!modal) return;

  const enableBtn = document.getElementById("pushEnableBtn");
  const laterBtn = document.getElementById("pushLaterBtn");

  openModal(modal);
  localStorage.setItem("pushPrompted", "1"); // salva que mostrou

  if (enableBtn) {
    enableBtn.onclick = async () => {
      closeModal(modal);

      try {
        const result = await Notification.requestPermission();
        if (result === "granted") await saveToken(uid);
      } catch (e) {
        console.error("[push] erro ao ativar", e);
      }
    };
  }

  if (laterBtn) {
    laterBtn.onclick = () => closeModal(modal);
  }
}

/* ---------- Remove ---------- */

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