import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

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

function shouldAskAgain() {
  const dismissedAt = getDismissedAt();
  if (!dismissedAt) return true;
  const dias3 = 3 * 24 * 60 * 60 * 1000;
  return Date.now() - dismissedAt > dias3;
}

// ─── Modal de contexto (antes do popup nativo) ───────────────

function mostrarModalPermissao() {
  return new Promise((resolve) => {
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

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        overlay.remove();
        setDismissedNow();
        resolve(false);
      }
    });
  });
}

function mostrarModalBloqueado() {
  document.getElementById("fcm-blocked-modal")?.remove();

  const isIos     = isIOS();
  const isSaf     = isSafari();
  const isPWA     = isIOSPWA();

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
    instrucao = `
      Clique no <strong>cadeado</strong> na barra de endereço do navegador<br>
      → <strong>Permissões do site</strong> → <strong>Notificações</strong><br>
      e selecione <strong>Permitir</strong>.
    `;
  }

  const overlay = document.createElement("div");
  overlay.id = "fcm-blocked-modal";
  overlay.style.cssText = `
    position: fixed; inset: 0;
    background: var(--bg-modal);
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
      <div class="svg-nt">
<svg width="231" height="231" viewBox="0 0 231 231" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M57.7351 92.9902C57.6845 94.0291 57.6616 95.0712 57.6677 96.1152C57.7469 110.161 54.1277 123.981 47.1746 136.186L42.6628 144.077C40.9973 147.001 40.1286 150.31 40.1433 153.675C40.158 157.039 41.0558 160.341 42.7468 163.25C44.4379 166.159 46.8634 168.573 49.78 170.251C52.6965 171.928 56.0025 172.81 59.3669 172.81H171.111C171.314 172.811 171.517 172.808 171.719 172.803L191.12 186.387C190.837 186.559 190.553 186.73 190.265 186.896C184.435 190.247 177.827 192.011 171.101 192.01H152.247C150.159 200.249 145.382 207.557 138.675 212.776C131.967 217.996 123.709 220.83 115.21 220.83C106.71 220.83 98.4537 217.996 91.7458 212.776C85.0379 207.557 80.2619 200.249 78.1736 192.01H59.3572C52.632 192.01 46.024 190.245 40.1951 186.891C34.3664 183.536 29.5207 178.71 26.1423 172.896C22.7639 167.08 20.9712 160.48 20.9441 153.755C20.917 147.03 22.6565 140.415 25.988 134.573L30.4802 126.672C35.7664 117.388 38.5144 106.876 38.448 96.1924C38.4149 90.9147 38.9319 85.6746 39.9705 80.5518L57.7351 92.9902ZM98.6882 192.01C100.359 194.921 102.766 197.342 105.668 199.028C108.569 200.715 111.863 201.608 115.219 201.619C118.576 201.608 121.871 200.715 124.772 199.028C127.674 197.342 130.08 194.921 131.751 192.01H98.6882ZM115.195 9.59668C121.329 9.59481 127.374 11.0729 132.815 13.9062C138.256 16.7397 142.933 20.8449 146.448 25.8721C160.035 31.8613 171.581 41.6824 179.672 54.1328C187.762 66.5833 192.047 81.1234 192.001 95.9717C191.929 106.631 194.649 117.123 199.891 126.403L204.538 134.583C207.86 140.43 209.581 147.047 209.546 153.772C209.54 154.833 209.489 155.89 209.396 156.941L224.788 167.719C229.28 170.864 230.372 177.055 227.226 181.547C224.081 186.039 217.89 187.131 213.398 183.985L29.1335 54.9609C24.6417 51.8157 23.5499 45.6246 26.6951 41.1328C29.8404 36.6412 36.0314 35.5502 40.5232 38.6953L54.7048 48.625C62.4172 38.7881 72.4529 30.9668 83.9529 25.8916C87.4651 20.8623 92.1389 16.7548 97.5779 13.918C103.017 11.0812 109.061 9.59863 115.195 9.59668ZM115.215 28.7969C111.858 28.7969 108.561 29.6874 105.661 31.3779C102.761 33.0685 100.362 35.4989 98.7078 38.4199C97.6309 40.2765 95.9603 41.7166 93.9656 42.5088C84.7664 46.1244 76.689 52.051 70.49 59.6777L185.742 140.379L183.197 135.889C176.396 123.906 172.818 110.364 172.81 96.5859C172.936 84.9519 169.529 73.5534 163.04 63.8965C156.55 54.2396 147.284 46.7781 136.465 42.499C134.473 41.7068 132.803 40.271 131.722 38.4199C130.068 35.4988 127.668 33.0685 124.768 31.3779C121.868 29.6874 118.571 28.7969 115.215 28.7969Z"/>
</svg></div>
      <div style="font-size: 17px; font-weight: 700; margin-bottom: 10px;">
        Notificações bloqueadas
      </div>
      <div style="font-size: 14px; color: #ababab; line-height: 1.6; margin-bottom: 28px;">
        ${instrucao}
      </div>
      <button id="fcm-blocked-ok" style="
        width: 100%; padding: 15px;
        background: var(--primary-btn);
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
  if (!supportsNotifications()) {
    console.log("[FCM] Notificações não suportadas neste navegador.");
    return;
  }

  const perm = Notification.permission;

  if (perm === "denied") {
    mostrarModalBloqueado();
    return;
  }

  if (perm === "granted") {
    return _registrarToken(uid);
  }

  if (!shouldAskAgain()) {
    console.log("[FCM] Permissão adiada pelo usuário, esperando 3 dias.");
    return;
  }

  if (isIOS() && !isIOSPWA()) {
    const aceito = await mostrarModalPermissao();
    if (aceito) mostrarModalBloqueado(); 
    return;
  }

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

  document.getElementById("fcm-toast-close")?.remove();
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

  setTimeout(() => toast?.remove(), 5000);
}