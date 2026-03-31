// ============================================================
// notifications-push.js — RealMe Frontend
// Registra token FCM e salva no Firestore
// Importe e chame registerPushNotifications(uid) após o login
// ============================================================

import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app       = getApp();           // reutiliza o app já iniciado pelo feed.js
const db        = getFirestore(app);
const messaging = getMessaging(app);

const VAPID_KEY = "BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg";

export function listenForegroundMessages() {
  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    const data = payload.data || {};
    console.log("[FCM] Mensagem em foreground:", payload);
    showToastNotification(title, body, data.url);
  });
}

export async function registerPushNotifications(uid) {
  try {
    // Se já foi bloqueado, não pergunta de novo
    if (Notification.permission === "denied") return;

    // Se ainda não perguntou, mostra modal antes
    if (Notification.permission === "default") {
      const aceito = await mostrarModalPermissao();
      if (!aceito) return;
    }

    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });
    if (!token) return;

    await setDoc(doc(db, "users", uid), 
      { fcmToken: token, fcmUpdatedAt: new Date() }, 
      { merge: true }
    );
    console.log("[FCM] Token registrado:", token);
    return token;
  } catch (err) {
    console.error("[FCM] Erro:", err);
  }
}

function mostrarModalPermissao() {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.6);
      z-index:999999; display:flex; align-items:flex-end;
      justify-content:center; font-family:system-ui,sans-serif;
    `;
    modal.innerHTML = `
      <div style="background:#1a1a2e; border-radius:20px 20px 0 0; padding:28px 24px;
                  width:100%; max-width:480px; color:#fff; text-align:center;">
        <div style="font-size:36px; margin-bottom:12px">🔔</div>
        <div style="font-weight:700; font-size:18px; margin-bottom:8px">Ativar notificações</div>
        <div style="font-size:14px; opacity:.75; margin-bottom:24px; line-height:1.5">
          Receba avisos quando alguém curtir, comentar ou te seguir no RealMe.
        </div>
        <button id="fcm-sim" style="width:100%; padding:14px; background:#4A90E2;
          border:none; border-radius:12px; color:#fff; font-size:16px;
          font-weight:600; cursor:pointer; margin-bottom:10px">
          Ativar notificações
        </button>
        <button id="fcm-nao" style="width:100%; padding:12px; background:none;
          border:none; color:#aaa; font-size:14px; cursor:pointer">
          Agora não
        </button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector("#fcm-sim").onclick = () => { modal.remove(); resolve(true); };
    modal.querySelector("#fcm-nao").onclick = () => { modal.remove(); resolve(false); };
  });
}