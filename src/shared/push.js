import { getMessaging, getToken, onMessage, isSupported }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { doc, setDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { app, db, auth } from "/src/config/config.js";

const VAPID_KEY = "BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg";
const modal = document.getElementById("pushModal");

async function saveToken(uid) {
  const swReg = await navigator.serviceWorker.register("/service-worker.js");
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: swReg,
  });
  if (!token) return;

  await setDoc(doc(db, "users", uid, "fcmTokens", token), {
    token,
    userAgent: navigator.userAgent,
    updatedAt: serverTimestamp(),
  });

  onMessage(messaging, (payload) => {
    new Notification(payload.data.title, { body: payload.data.body, icon: "/public/img/icon.png" });
  });
}

export async function initPush(uid) {
  if (!(await isSupported()) || !("Notification" in window)) return;

  if (Notification.permission === "granted") return saveToken(uid);

  if (Notification.permission === "denied") return;

  if (localStorage.getItem("pushPrompted")) return;

  modal.classList.add("active");

  document.getElementById("pushEnableBtn").onclick = async () => {
    const result = await Notification.requestPermission();
    modal.classList.remove("active");
    localStorage.setItem("pushPrompted", "1");
    if (result === "granted") await saveToken(uid);
  };

  document.getElementById("pushLaterBtn").onclick = () => {
    modal.classList.remove("active");
    localStorage.setItem("pushPrompted", "1");
  };
}