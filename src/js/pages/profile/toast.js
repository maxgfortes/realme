import { select } from "./dom.js";

let hideTimer = null;

export function showToast(message) {
  const toastArea = select(".toast-area");
  select(".toast-body").textContent = message;
  toastArea.classList.add("active");
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => toastArea.classList.remove("active"), 2500);
}
