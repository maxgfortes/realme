import { auth } from "./firebase.js";
import { $ } from "./dom.js";
import { enablePush, pushSupported, saveToken } from "/src/shared/push.js";

const button = $("btn-toggle-notif");
const label = $("notif-menu-label");

function isIosBrowser() {
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

  return isIos && !standalone;
}

async function renderNotificationState() {
  const supported = await pushSupported();

  if (!supported) {
    button.classList.add("disable");
    label.textContent = isIosBrowser()
      ? "Adicione à tela de início para ativar"
      : "Notificações indisponíveis";
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

async function enableNotifications(event) {
  event.preventDefault();

  const uid = auth.currentUser?.uid;

  if (!uid || button.classList.contains("disable")) return;

  try {
    if (Notification.permission === "granted") await saveToken(uid);
    else await enablePush(uid);
  } catch (error) {
    console.error("Erro ao ativar notificações:", error);
  }

  renderNotificationState();
}

renderNotificationState();
button.addEventListener("click", enableNotifications);
