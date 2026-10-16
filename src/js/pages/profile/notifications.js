import { app, auth, db } from "./firebase.js";
import { doc, setDoc } from "./firestore.js";
import { $ } from "./dom.js";
import { VAPID_KEY } from "./constants.js";

const MESSAGING_URL = "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

const button = $("btn-toggle-notif");
const label = $("notif-menu-label");

function isSupported() {
  return "Notification" in window;
}

function renderNotificationState() {
  if (!isSupported()) {
    button.classList.add("disable");
    label.textContent = "Notificações indisponíveis";
    return;
  }

  if (Notification.permission === "denied") {
    button.classList.add("disable");
    label.textContent = "Notificações bloqueadas";
    return;
  }

  button.classList.remove("disable");
  label.textContent = Notification.permission === "granted" ? "Notificações ativadas" : "Ativar Notificações";
}

async function saveFcmToken() {
  const { getMessaging, getToken } = await import(MESSAGING_URL);
  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const token = await getToken(getMessaging(app), {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  if (!token || !auth.currentUser) return;

  await setDoc(
    doc(db, "users", auth.currentUser.uid),
    { fcmToken: token, fcmUpdatedAt: new Date() },
    { merge: true }
  );
}

async function enableNotifications(event) {
  event.preventDefault();
  if (!isSupported() || Notification.permission !== "default") return;

  const permission = await Notification.requestPermission();
  renderNotificationState();

  if (permission === "granted") await saveFcmToken();
}

renderNotificationState();
button.addEventListener("click", enableNotifications);
