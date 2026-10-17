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
  deleteDoc,
  updateDoc,
  deleteField,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { app, db, auth } from "/src/config/config.js";

const VAPID_KEY = "BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg";
const DEFAULT_ICON = "/public/img/icon.png";
const DEFAULT_URL = "/feed.html";
const SAVE_EVERY_MS = 24 * 60 * 60 * 1000;
const CLOSE_MS = 300;
const TOKEN_KEY = "fcmToken";
const MARKER_KEY = "fcmTokenKey";
const SAVED_AT_KEY = "fcmTokenSavedAt";

let listening = false;
let registrationPromise = null;
let supportedPromise = null;

function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function pushSupported() {
  supportedPromise ??= (async () => {
    if (!("serviceWorker" in navigator) || !("Notification" in window) || !window.isSecureContext) {
      return false;
    }

    return isSupported().catch(() => false);
  })();

  return supportedPromise;
}

function getRegistration() {
  registrationPromise ??= navigator.serviceWorker
    .register("/service-worker.js", { scope: "/" })
    .then(async registration => {
      await navigator.serviceWorker.ready;
      return registration;
    })
    .catch(error => {
      registrationPromise = null;
      throw error;
    });

  return registrationPromise;
}

function openModal(modal) {
  modal.style.display = "";
  void modal.offsetWidth;

  modal.classList.add("active");
  modal.querySelector(".push-box-overlay")?.classList.add("active");
  modal.querySelector(".push-modal-box")?.classList.add("active");
}

function closeModal(modal) {
  modal.querySelector(".push-box-overlay")?.classList.remove("active");
  modal.querySelector(".push-modal-box")?.classList.remove("active");

  setTimeout(() => modal.classList.remove("active"), CLOSE_MS);
}

function isViewingChat(chatId) {
  if (!chatId || document.visibilityState !== "visible") return false;

  const chatArea = document.getElementById("dmChatArea");

  return Boolean(
    chatArea?.classList.contains("active") &&
    chatArea.dataset.chatId === chatId
  );
}

function listenForeground(messaging) {
  if (listening) return;

  listening = true;

  onMessage(messaging, async payload => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = data.title || notification.title;

    if (!title || isViewingChat(data.chatId)) return;

    try {
      const registration = await getRegistration();

      await registration.showNotification(title, {
        body: data.body || notification.body || "",
        icon: data.icon || notification.icon || DEFAULT_ICON,
        badge: data.badge || DEFAULT_ICON,
        image: data.image || notification.image || undefined,
        tag: data.tag || undefined,
        renotify: Boolean(data.tag),
        data: { url: data.url || DEFAULT_URL }
      });
    } catch (error) {
      console.error("[push] não foi possível exibir notificação", error);
    }
  });
}

async function storeToken(uid, token) {
  const previous = readStorage(TOKEN_KEY);
  const marker = `${uid}:${token}`;
  const savedAt = Number(readStorage(SAVED_AT_KEY) || 0);

  if (readStorage(MARKER_KEY) === marker && Date.now() - savedAt < SAVE_EVERY_MS) return;

  await Promise.all([
    setDoc(
      doc(db, "users", uid),
      { fcmToken: token, fcmTokenUpdatedAt: serverTimestamp() },
      { merge: true }
    ),
    setDoc(doc(db, "users", uid, "fcmTokens", token), {
      token,
      updatedAt: serverTimestamp(),
      userAgent: navigator.userAgent.slice(0, 300)
    })
  ]);

  if (previous && previous !== token) {
    await deleteDoc(doc(db, "users", uid, "fcmTokens", previous)).catch(() => {});
  }

  writeStorage(TOKEN_KEY, token);
  writeStorage(MARKER_KEY, marker);
  writeStorage(SAVED_AT_KEY, String(Date.now()));
}

export async function saveToken(uid) {
  if (!uid || !(await pushSupported()) || Notification.permission !== "granted") return null;

  const registration = await getRegistration();
  const messaging = getMessaging(app);

  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration
  });

  if (!token) {
    console.warn("[push] getToken retornou vazio");
    return null;
  }

  await storeToken(uid, token);
  listenForeground(messaging);

  return token;
}

export async function enablePush(uid) {
  if (!uid || !(await pushSupported())) return "unsupported";

  const permission = Notification.permission === "default"
    ? await Notification.requestPermission()
    : Notification.permission;

  if (permission === "granted") await saveToken(uid);

  return permission;
}

export async function initPush(uid) {
  if (!uid || !(await pushSupported())) return;

  if (Notification.permission === "granted") {
    return saveToken(uid).catch(error => console.error("[push] saveToken falhou", error));
  }

  if (Notification.permission === "denied") return;
  if (readStorage("pushPrompted")) return;

  const modal = document.getElementById("pushModal");

  if (!modal) return;

  const enableButton = document.getElementById("pushEnableBtn");
  const laterButton = document.getElementById("pushLaterBtn");

  openModal(modal);
  writeStorage("pushPrompted", "1");

  if (enableButton) {
    enableButton.onclick = async () => {
      closeModal(modal);

      try {
        await enablePush(uid);
      } catch (error) {
        console.error("[push] erro ao ativar", error);
      }
    };
  }

  if (laterButton) {
    laterButton.onclick = () => closeModal(modal);
  }
}

export async function removePush(uid) {
  const token = readStorage(TOKEN_KEY);

  try {
    if (uid && token) {
      await deleteDoc(doc(db, "users", uid, "fcmTokens", token)).catch(() => {});
      await updateDoc(doc(db, "users", uid), { fcmToken: deleteField() }).catch(() => {});
    }

    if (await pushSupported()) {
      await deleteToken(getMessaging(app)).catch(() => {});
    }
  } finally {
    writeStorage(TOKEN_KEY, null);
    writeStorage(MARKER_KEY, null);
    writeStorage(SAVED_AT_KEY, null);
  }
}

onAuthStateChanged(auth, user => {
  if (!user) return;

  initPush(user.uid).catch(error => console.error("[push] falha ao iniciar", error));
});

document.addEventListener("visibilitychange", () => {
  const uid = auth.currentUser?.uid;

  if (document.visibilityState === "visible" && uid && "Notification" in window && Notification.permission === "granted") {
    saveToken(uid).catch(() => {});
  }
});
