// ============================================================
// notifications-push.js — RealMe Frontend
// ============================================================

import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app       = getApp();
const db        = getFirestore(app);
const messaging = getMessaging(app);

const VAPID_KEY = "BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg";

// ─── Detecção de plataforma ──────────────────────────────────

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isIOSPWA() {
  return isIOS() && window.navigator.standalone === true;
}

function isSafari() {
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
}

function supportsNotifications() {
  return "Notification" in window && "serviceWorker" in navigator;
}

// ─── Storage helpers ────────────────────────────────────────

const STORAGE_KEY = "fcm_notif_dismissed";

function getDismissedAt() {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) || "0"); }
  catch { return 0; }
}

function setDismissedNow() {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); }
  catch {}
}

// Volta a perguntar depois de 3 dias se o usuário dispensou
function shouldAskAgain() {
  const dismissedAt = getDismissedAt();
  if (!dismissedAt) return true;
  const dias3 = 3 * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt > dias3;
}

// ─── Modal de contexto (antes do popup nativo) ───────────────

function mostrarModalPermissao() {
  return new Promise((resolve) => {
    // Remove modal anterior se existir
    document.getElementById("fcm-perm-modal")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "fcm-perm-modal";
    overlay.style.cssText = `
      position: fixed; inset: 0;
      background: var(--bg-modal);
      z-index: 999999;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      font-family: system-ui, -apple-system, sans-serif;
      animation: fcmFadeIn .25s ease;
    `;

    const isIos = isIOS();

    overlay.innerHTML = `
      <style>
        @keyframes fcmFadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fcmSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
      </style>
      <div style="
        background: #1b1b1b;
        border-radius: 20px 20px 0 0;
        padding: 28px 24px 36px;
        width: 100%;
        max-width: 480px;
        color: #fff;
        text-align: center;
        animation: fcmSlideUp .35s cubic-bezier(.32,.72,0,1);
      ">
        <div style="
          width: 56px; height: 56px;
          background: #2c2c2e;
          border-radius: 16px;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px;
          font-size: 28px;
        "><i class="fa-solid fa-bell"></i></div>

        <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">
          Ativar notificações
        </div>
        <div style="font-size: 14px; color: #ababab; line-height: 1.55; margin-bottom: 28px;">
          Saiba quando alguém curtir, comentar ou começar a te seguir no RealMe.
          ${isIos ? "<br><br><span style='color:#636366;font-size:12px;'>No iPhone, o app precisa estar instalado na tela inicial (Adicionar à Tela de Início) para receber notificações.</span>" : ""}
        </div>

        <button id="fcm-btn-sim" style="
          width: 100%; padding: 15px;
          background: #0a84ff;
          border: none; border-radius: 13px;
          color: #fff; font-size: 16px; font-weight: 600;
          cursor: pointer; margin-bottom: 10px;
          transition: opacity .15s;
        " onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
          Ativar notificações
        </button>

        <button id="fcm-btn-nao" style="
          width: 100%; padding: 13px;
          background: none; border: none;
          color: #636366; font-size: 15px;
          cursor: pointer;
        ">
          Agora não
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#fcm-btn-sim").onclick = () => {
      overlay.remove();
      resolve(true);
    };

    overlay.querySelector("#fcm-btn-nao").onclick = () => {
      overlay.remove();
      setDismissedNow();
      resolve(false);
    };

    // Fecha ao clicar fora
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        setDismissedNow();
        resolve(false);
      }
    });
  });
}

// ─── Modal explicativo para quando está BLOQUEADO ────────────

function mostrarModalBloqueado() {
  document.getElementById("fcm-blocked-modal")?.remove();

  const isIos     = isIOS();
  const isSaf     = isSafari();
  const isPWA     = isIOSPWA();

  // Instrução específica por plataforma
  let instrucao;
  if (isIos && isPWA) {
    instrucao = `
      No iPhone, vá em:<br>
      <strong>Ajustes → RealMe → Notificações</strong><br>
      e ative as notificações.
    `;
  } else if (isIos && isSaf) {
    instrucao = `
      No Safari do iPhone, vá em:<br>
      <strong>Ajustes → Apps → Safari → Configurações de Sites → Notificações</strong><br>
      e permita <em>socialrealme.com</em>.<br><br>
      Ou adicione o RealMe à tela inicial para uma melhor experiência.
    `;
  } else if (isIos) {
    instrucao = `
      No iPhone, adicione o RealMe à tela inicial:<br>
      toque em <strong>Compartilhar → Adicionar à Tela de Início</strong>.<br>
      Depois abra o app pela tela inicial e ative as notificações.
    `;
  } else {
    // Android / Desktop Chrome / Firefox
    instrucao = `
      Clique no <strong>cadeado 🔒</strong> na barra de endereço do navegador<br>
      → <strong>Permissões do site</strong> → <strong>Notificações</strong><br>
      e selecione <strong>Permitir</strong>.
    `;
  }

  const overlay = document.createElement("div");
  overlay.id = "fcm-blocked-modal";
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: rgba(0,0,0,.65);
    z-index: 999999;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    font-family: system-ui, -apple-system, sans-serif;
  `;

  overlay.innerHTML = `
    <div style="
      background: #1c1c1e;
      border-radius: 20px 20px 0 0;
      padding: 28px 24px 36px;
      width: 100%;
      max-width: 480px;
      color: #fff;
      text-align: center;
    ">
      <div style="font-size: 36px; margin-bottom: 14px;">🔕</div>
      <div style="font-size: 17px; font-weight: 700; margin-bottom: 10px;">
        Notificações bloqueadas
      </div>
      <div style="font-size: 14px; color: #ababab; line-height: 1.6; margin-bottom: 28px;">
        ${instrucao}
      </div>
      <button id="fcm-blocked-ok" style="
        width: 100%; padding: 15px;
        background: #2c2c2e;
        border: none; border-radius: 13px;
        color: #fff; font-size: 16px; font-weight: 600;
        cursor: pointer;
      ">Entendi</button>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector("#fcm-blocked-ok").onclick  = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
}

// ─── Registro do token FCM ───────────────────────────────────

export async function registerPushNotifications(uid) {
  // Navegador não suporta notificações
  if (!supportsNotifications()) {
    console.log("[FCM] Notificações não suportadas neste navegador.");
    return;
  }

  const perm = Notification.permission;

  // Já bloqueado — mostra instrução de como desbloquear
  if (perm === "denied") {
    mostrarModalBloqueado();
    return;
  }

  // Já concedido — só renova o token silenciosamente
  if (perm === "granted") {
    return _registrarToken(uid);
  }

  // Ainda não perguntou ("default") — verifica se deve perguntar
  if (!shouldAskAgain()) {
    console.log("[FCM] Permissão adiada pelo usuário, esperando 3 dias.");
    return;
  }

  // iOS sem PWA — notificações só funcionam via PWA instalada no iPhone
  if (isIOS() && !isIOSPWA()) {
    // Mostra o modal explicativo mas não pede permissão ainda
    // (o sistema iOS vai recusar de qualquer forma fora do PWA)
    const aceito = await mostrarModalPermissao();
    if (aceito) mostrarModalBloqueado(); // explica como instalar o PWA
    return;
  }

  // Fluxo normal: mostra modal de contexto → pede permissão nativa
  const aceito = await mostrarModalPermissao();
  if (!aceito) return;

  try {
    const permissao = await Notification.requestPermission();

    if (permissao === "granted") {
      await _registrarToken(uid);
    } else if (permissao === "denied") {
      mostrarModalBloqueado();
    }
  } catch (err) {
    console.error("[FCM] Erro ao pedir permissão:", err);
  }
}

/** Registra o SW e salva o token no Firestore */
async function _registrarToken(uid) {
  try {
    const swReg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg,
    });

    if (!token) {
      console.warn("[FCM] Token não gerado.");
      return;
    }

    await setDoc(
      doc(db, "users", uid),
      { fcmToken: token, fcmUpdatedAt: new Date() },
      { merge: true }
    );

    console.log("[FCM] Token registrado:", token);
    return token;
  } catch (err) {
    console.error("[FCM] Erro ao registrar token:", err);
  }
}

// ─── Mensagens em foreground (toast) ────────────────────────

export function listenForegroundMessages() {
  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {};
    const data = payload.data || {};
    console.log("[FCM] Foreground:", payload);
    showToastNotification(title, body, data.url, data.icon);
  });
}

function showToastNotification(title, body, url, icon) {
  document.getElementById("fcm-toast")?.remove();

  const toast = document.createElement("div");
  toast.id = "fcm-toast";
  toast.style.cssText = `
    position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
    background: #1c1c1e; color: #fff; border-radius: 16px;
    padding: 12px 16px; max-width: 360px; width: 92%;
    box-shadow: 0 8px 32px rgba(0,0,0,.45);
    display: flex; align-items: flex-start; gap: 12px;
    z-index: 999999; cursor: pointer;
    animation: fcmToastIn .3s cubic-bezier(.32,.72,0,1);
    font-family: system-ui, -apple-system, sans-serif;
  `;

  toast.innerHTML = `
    <style>
      @keyframes fcmToastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(-12px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    </style>
    <img
      src="${icon || "/src/icon/icon-192x192.png"}"
      style="width:40px;height:40px;border-radius:50%;flex-shrink:0;object-fit:cover;"
      onerror="this.src='/src/icon/icon-192x192.png'"
    >
    <div style="flex:1;min-width:0;">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px;
                  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
        ${title || "RealMe"}
      </div>
      <div style="font-size:13px;color:#ababab;line-height:1.4;
                  display:-webkit-box;-webkit-line-clamp:2;
                  -webkit-box-orient:vertical;overflow:hidden;">
        ${body || ""}
      </div>
    </div>
    <button id="fcm-toast-close" style="
      background:none;border:none;color:#636366;font-size:20px;
      cursor:pointer;flex-shrink:0;padding:0 2px;line-height:1;
      align-self:flex-start;
    ">×</button>
  `;

  document.getElementById("fcm-toast-close")?.remove(); // limpa listeners
  document.body.appendChild(toast);

  toast.querySelector("#fcm-toast-close").onclick = (e) => {
    e.stopPropagation();
    toast.remove();
  };

  if (url) {
    toast.addEventListener("click", () => {
      window.open(url, "_self");
      toast.remove();
    });
  }

  // Auto-remove após 5 segundos
  setTimeout(() => toast?.remove(), 5000);
}