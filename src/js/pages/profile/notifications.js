import { t } from "/src/i18n/i18n.js";
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
      ? t("push.addToHome")
      : t("push.unavailable");
    return;
  }

  if (Notification.permission === "denied") {
    button.classList.add("disable");
    label.textContent = t("push.blocked");
    return;
  }

  button.classList.remove("disable");
  label.textContent = Notification.permission === "granted" ? t("push.enabled") : t("push.enable");
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
