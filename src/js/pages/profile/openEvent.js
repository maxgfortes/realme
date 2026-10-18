import { t } from "/src/i18n/i18n.js";
import { db, auth } from "/src/config/config.js";

import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const OPEN_EVENT = "realme:open-event";
const GOING_CHANGED = "realme:event-going-changed";

const STATUS = { going: "going", maybe: "maybe" };

const MAX_PEOPLE = 60;
const DEFAULT_PHOTO = "./public/img/default.jpg";

const ARROW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 298 511.93"><path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16l-215-214.47c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7l-185.5 185.04L285.77 441z"/></svg>';

const layer = document.getElementById("eventLayer");

const el = layer && {
  close: document.getElementById("closeEventBtn"),
  bannerBox: layer.querySelector(".event-banner-overlay"),
  banner: document.getElementById("eventLayerBanner"),
  title: document.getElementById("eventLayerTitle"),
  sub: document.getElementById("eventLayerSub"),
  date: document.getElementById("eventLayerDate"),
  location: document.getElementById("eventLayerLocation"),
  empty: layer.querySelector(".empty-event-list"),
  lists: layer.querySelector(".event-users-row-list"),
  rowGoing: document.getElementById("eventRowGoing"),
  rowMaybe: document.getElementById("eventRowMaybe"),
  btnConfirm: layer.querySelector(".event-act-btn.confirm"),
  btnMaybe: layer.querySelector(".event-act-btn.maybe"),
  btnNo: layer.querySelector(".event-act-btn.no")
};

const current = {
  eventId: null,
  token: 0,
  people: new Map(),
  busy: false
};

const userCache = new Map();
let friendsCache = null;

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function safeUrl(url) {
  return /^(https?:\/\/|data:image\/|\.?\/)/i.test(url || "") ? url : "";
}

function formatDate(timestamp) {
  const date = timestamp?.toDate?.();
  if (!date) return "";

  return date.toLocaleString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function loadFriends(me) {
  if (friendsCache) return friendsCache;

  try {
    const snap = await getDocs(collection(db, "users", me, "friends"));
    friendsCache = new Set(snap.docs.map(d => d.id));
  } catch {
    friendsCache = new Set();
  }

  return friendsCache;
}

function loadUser(uid) {
  if (userCache.has(uid)) return userCache.get(uid);

  const promise = (async () => {
    try {
      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.exists() ? snap.data() : {};

      const name =
        [data.name, data.surname].filter(Boolean).join(" ").trim() ||
        data.displayName || data.username || t("common.user");

      let photo = data.userphoto || "";

      if (!photo) {
        const media = await getDoc(doc(db, "users", uid, "user-infos", "user-media"));
        if (media.exists()) photo = media.data().userphoto || "";
      }

      return { name, photo: safeUrl(photo) || DEFAULT_PHOTO };
    } catch {
      return { name: t("common.user"), photo: DEFAULT_PHOTO };
    }
  })();

  userCache.set(uid, promise);
  return promise;
}

function fillEvent(data) {
  const banner = safeUrl(data.eventBanner);

  if (el.bannerBox) el.bannerBox.style.display = banner ? "" : "none";
  if (el.banner) el.banner.src = banner;

  el.title.textContent = data.eventTitle || "";
  el.sub.textContent = data.eventDescription || "";
  el.date.textContent = formatDate(data.eventDate);
  el.location.textContent = data.eventLocation || "";
}

function rowHTML(uid, user, me, friends) {
  const badge =
    uid === me ? `<div class="is-friend-badge">${t("events.badgeYou")}</div>` :
    friends.has(uid) ? `<div class="is-friend-badge">${t("events.badgeFriend")}</div>` : "";

  return `
    <a href="profile.html?uid=${encodeURIComponent(uid)}" class="user-event-box">
      <div class="user-pfp-area"><img src="${esc(user.photo)}" alt="" loading="lazy"></div>
      <div class="user-event-infos"><div class="user-event-name">${esc(user.name)}</div></div>
      <div class="user-event-social">
        ${badge}
        <div class="user-event-arrow">${ARROW_SVG}</div>
      </div>
    </a>`;
}

async function renderPeople() {
  const token = current.token;
  const me = auth.currentUser?.uid || "";
  const friends = await loadFriends(me);

  const entries = [...current.people.entries()];

  const rank = uid => (uid === me ? 0 : friends.has(uid) ? 1 : 2);
  entries.sort((a, b) => rank(a[0]) - rank(b[0]));

  const users = await Promise.all(entries.map(([uid]) => loadUser(uid)));

  if (token !== current.token) return;

  const going = [];
  const maybe = [];

  entries.forEach(([uid, status], index) => {
    const html = rowHTML(uid, users[index], me, friends);
    (status === STATUS.maybe ? maybe : going).push(html);
  });

  el.rowGoing.innerHTML = going.join("");
  el.rowMaybe.innerHTML = maybe.join("");

  el.rowGoing.parentElement.style.display = going.length ? "" : "none";
  el.rowMaybe.parentElement.style.display = maybe.length ? "" : "none";

  const nobody = !going.length && !maybe.length;

  if (el.empty) el.empty.style.display = nobody ? "" : "none";
  if (el.lists) el.lists.style.display = nobody ? "none" : "";

  renderButtons();
}

function renderButtons() {
  const me = auth.currentUser?.uid;
  const mine = me ? current.people.get(me) : null;

  el.btnConfirm?.classList.toggle("selected", mine === STATUS.going);
  el.btnMaybe?.classList.toggle("selected", mine === STATUS.maybe);
  el.btnNo?.classList.toggle("selected", !mine);

  [el.btnConfirm, el.btnMaybe, el.btnNo].forEach(btn => {
    if (btn) btn.disabled = current.busy;
  });
}

function closeEvent() {
  layer.classList.remove("active");
  layer.setAttribute("aria-hidden", "true");
  document.body.classList.remove("event-open");
  current.token++;
  current.eventId = null;
}

async function openEvent(eventId) {
  if (!layer || !eventId || !auth.currentUser) return;

  const token = ++current.token;

  current.eventId = eventId;
  current.people = new Map();

  let data;

  try {
    const snap = await getDoc(doc(db, "events", eventId));

    if (!snap.exists()) return;

    data = snap.data();
  } catch (error) {
    console.error("Erro ao abrir evento:", error);
    return;
  }

  if (token !== current.token) return;

  fillEvent(data);

  el.rowGoing.innerHTML = "";
  el.rowMaybe.innerHTML = "";
  if (el.empty) el.empty.style.display = "none";
  if (el.lists) el.lists.style.display = "none";
  renderButtons();

  layer.classList.add("active");
  layer.setAttribute("aria-hidden", "false");
  document.body.classList.add("event-open");

  try {
    const going = await getDocs(collection(db, "events", eventId, "going"));

    if (token !== current.token) return;

    going.docs.slice(0, MAX_PEOPLE).forEach(d => {
      current.people.set(
        d.data().uid || d.id,
        d.data().status === STATUS.maybe ? STATUS.maybe : STATUS.going
      );
    });
  } catch (error) {
    console.error("Erro ao carregar presenças:", error);
  }

  await renderPeople();
}

async function setMyStatus(status) {
  const me = auth.currentUser?.uid;
  const eventId = current.eventId;

  if (!me || !eventId || current.busy) return;

  const previous = current.people.get(me) ?? null;

  if (previous === status) return;

  current.busy = true;

  status ? current.people.set(me, status) : current.people.delete(me);
  await renderPeople();

  try {
    const ref = doc(db, "events", eventId, "going", me);

    if (status) {
      await setDoc(ref, { uid: me, status });
    } else {
      await deleteDoc(ref);
    }

    document.dispatchEvent(new CustomEvent(GOING_CHANGED, { detail: { eventId } }));
  } catch (error) {
    console.error("Erro ao salvar presença:", error);

    if (eventId === current.eventId) {
      previous ? current.people.set(me, previous) : current.people.delete(me);
    }
  } finally {
    current.busy = false;

    if (eventId === current.eventId) await renderPeople();
  }
}

if (layer) {
  document.addEventListener(OPEN_EVENT, e => openEvent(e.detail?.eventId));

  el.close?.addEventListener("click", closeEvent);

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && layer.classList.contains("active")) closeEvent();
  });

  el.btnConfirm?.addEventListener("click", () => setMyStatus(STATUS.going));
  el.btnMaybe?.addEventListener("click", () => setMyStatus(STATUS.maybe));
  el.btnNo?.addEventListener("click", () => setMyStatus(null));
}