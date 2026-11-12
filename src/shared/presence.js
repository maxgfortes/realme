import { auth } from "/src/config/config.js";
import { rtdb } from "/src/config/realtime.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  ref,
  push,
  set,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const STYLE_HREF = "/src/styles/shared/presence.css";
const ATTRIBUTE = "data-presence-uid";
const SWEEP_MS = 5000;

const watchers = new Map();

function injectStyle() {
  if (document.querySelector(`link[href="${STYLE_HREF}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

function stateFrom(value) {
  if (!value || typeof value !== "object") return "offline";

  const states = Object.values(value).map(connection => connection?.state);

  if (states.includes("online")) return "online";
  if (states.includes("away")) return "away";

  return "offline";
}

function applyState(element, state) {
  let dot = element.querySelector(":scope > .presence-dot");

  if (state === "offline") {
    dot?.remove();
    return;
  }

  if (!dot) {
    dot = document.createElement("span");
    dot.className = "presence-dot";
    dot.setAttribute("aria-hidden", "true");
    element.appendChild(dot);
  }

  dot.classList.toggle("online", state === "online");
  dot.classList.toggle("away", state === "away");
}

function elementsFor(uid) {
  return document.querySelectorAll(`[${ATTRIBUTE}="${CSS.escape(uid)}"]`);
}

function watch(uid) {
  if (watchers.has(uid)) return watchers.get(uid);

  const watcher = { state: "offline", unsubscribe: null };

  watcher.unsubscribe = onValue(
    ref(rtdb, `status/${uid}`),
    snapshot => {
      watcher.state = stateFrom(snapshot.val());
      elementsFor(uid).forEach(element => applyState(element, watcher.state));
    },
    () => {
      watcher.state = "offline";
    }
  );

  watchers.set(uid, watcher);

  return watcher;
}

function decorate(element) {
  const uid = element.getAttribute(ATTRIBUTE);

  if (!uid) return;

  applyState(element, watch(uid).state);
}

function scan(root) {
  if (!(root instanceof Element)) return;

  if (root.hasAttribute(ATTRIBUTE)) decorate(root);
  root.querySelectorAll(`[${ATTRIBUTE}]`).forEach(decorate);
}

function sweep() {
  watchers.forEach((watcher, uid) => {
    if (elementsFor(uid).length) return;

    watcher.unsubscribe?.();
    watchers.delete(uid);
  });
}

let connectionRef = null;
let stopConnected = null;

function currentState() {
  return document.visibilityState === "visible" ? "online" : "away";
}

function publish() {
  if (!connectionRef) return;

  set(connectionRef, { state: currentState(), at: serverTimestamp() }).catch(() => {});
}

function stopPublishing() {
  stopConnected?.();
  stopConnected = null;

  if (connectionRef) remove(connectionRef).catch(() => {});

  connectionRef = null;
}

function startPublishing(uid) {
  stopPublishing();

  stopConnected = onValue(ref(rtdb, ".info/connected"), snapshot => {
    if (snapshot.val() !== true) return;

    connectionRef = connectionRef || push(ref(rtdb, `status/${uid}`));

    onDisconnect(connectionRef)
      .remove()
      .then(publish)
      .catch(() => {});
  });
}

function start() {
  injectStyle();
  scan(document.body);

  new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === "attributes") {
        decorate(mutation.target);
        return;
      }

      mutation.addedNodes.forEach(scan);
    });
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [ATTRIBUTE]
  });

  setInterval(sweep, SWEEP_MS);
}

document.addEventListener("visibilitychange", publish);
window.addEventListener("pagehide", stopPublishing);
window.addEventListener("pageshow", event => {
  if (event.persisted && auth.currentUser) startPublishing(auth.currentUser.uid);
});

onAuthStateChanged(auth, user => {
  if (user) startPublishing(user.uid);
  else stopPublishing();
});

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start, { once: true });
