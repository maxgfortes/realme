import { t } from "/src/i18n/i18n.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { app, db } from "./firebase.js";
import { doc, onSnapshot } from "./firestore.js";
import { state } from "./state.js";
import { confirmAlert } from "./confirmAlert.js";
import { showToast } from "./toast.js";

const functions = getFunctions(app, "us-central1");
const authUrlCall = httpsCallable(functions, "spotifyAuthUrl");
const disconnectCall = httpsCallable(functions, "spotifyDisconnect");
const refreshCall = httpsCallable(functions, "spotifyRefresh");

const REFRESH_INTERVAL_MS = 20000;
const END_REFRESH_GAP_MS = 6000;
const STALE_AFTER_MS = 3 * 60 * 1000;
const END_GRACE_MS = 30000;

const card = document.getElementById("nowPlaying");
const link = document.getElementById("nowPlayingLink");
const cover = document.getElementById("nowPlayingCover");
const titleEl = document.getElementById("nowPlayingTitle");
const artistEl = document.getElementById("nowPlayingArtist");
const fill = document.getElementById("nowPlayingFill");
const elapsedEl = document.getElementById("nowPlayingElapsed");
const durationEl = document.getElementById("nowPlayingDuration");

const panel = document.querySelector("[data-connections-panel]");
const connectButton = document.getElementById("spotifyConnectBtn");
const connectLabel = document.getElementById("spotifyConnectLabel");
const connectStatus = document.getElementById("spotifyConnectStatus");

let watchedUid = null;
let unsubscribeNowPlaying = null;
let unsubscribeOwn = null;
let current = null;
let tickTimer = null;
let refreshTimer = null;
let lastEndRefresh = 0;
let ownConnected = false;
let busy = false;

function formatTime(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function requestRefresh(uid) {
  if (!uid || document.visibilityState !== "visible") return;
  refreshCall({ uid }).catch(() => {});
}

function elapsedMs(data) {
  const base = data.progressMs || 0;
  return Math.min(data.track.durationMs, base + (Date.now() - (data.fetchedAt || Date.now())));
}

function isVisibleData(data) {
  if (!data?.isPlaying || !data.track) return false;

  const age = Date.now() - (data.fetchedAt || 0);
  const remaining = data.track.durationMs - (data.progressMs || 0);

  return age < STALE_AFTER_MS && age < remaining + END_GRACE_MS;
}

function showCard(visible) {
  if (!card) return;

  if (visible) {
    if (card.hidden) {
      card.hidden = false;
      card.classList.remove("leaving");
      void card.offsetWidth;
      card.classList.add("entering");
    }
    return;
  }

  if (card.hidden || card.classList.contains("leaving")) return;

  card.classList.remove("entering");
  card.classList.add("leaving");
  card.addEventListener("animationend", () => {
    if (card.classList.contains("leaving")) {
      card.hidden = true;
      card.classList.remove("leaving");
    }
  }, { once: true });
}

function tick() {
  if (!current || !isVisibleData(current)) {
    showCard(false);
    return;
  }

  const elapsed = elapsedMs(current);
  const duration = current.track.durationMs || 1;

  fill.style.transform = `scaleX(${Math.min(1, elapsed / duration)})`;
  elapsedEl.textContent = formatTime(elapsed);

  if (elapsed >= duration && Date.now() - lastEndRefresh > END_REFRESH_GAP_MS) {
    lastEndRefresh = Date.now();
    requestRefresh(watchedUid);
  }
}

function render(data) {
  const trackChanged = data?.track?.id !== current?.track?.id;
  current = data;

  if (!isVisibleData(data)) {
    showCard(false);
    return;
  }

  const { track } = data;

  if (trackChanged || cover.getAttribute("src") !== track.cover) {
    cover.src = track.cover || "";
    titleEl.textContent = track.name;
    artistEl.textContent = [track.artists, track.album].filter(Boolean).join(" · ");
    durationEl.textContent = formatTime(track.durationMs);
    link.href = track.url || "#";
    card.classList.remove("track-swap");
    void card.offsetWidth;
    if (!card.hidden) card.classList.add("track-swap");
  }

  showCard(true);
  tick();
}

function stopWatching() {
  unsubscribeNowPlaying?.();
  unsubscribeNowPlaying = null;
  clearInterval(tickTimer);
  clearInterval(refreshTimer);
  tickTimer = null;
  refreshTimer = null;
  current = null;
  if (card) {
    card.hidden = true;
    card.classList.remove("entering", "leaving", "track-swap");
  }
}

export function watchNowPlaying(uid) {
  if (!card || uid === watchedUid) return;

  stopWatching();
  watchedUid = uid;

  if (!uid) return;

  unsubscribeNowPlaying = onSnapshot(
    doc(db, "nowPlaying", uid),
    snap => render(snap.exists() ? snap.data() : null),
    () => render(null)
  );

  tickTimer = setInterval(tick, 1000);
  refreshTimer = setInterval(() => requestRefresh(uid), REFRESH_INTERVAL_MS);
  requestRefresh(uid);
}

function renderConnection() {
  if (!connectButton) return;

  connectLabel.textContent = ownConnected ? t("spotify.disconnect") : t("spotify.connect");
  connectButton.classList.toggle("logoff", ownConnected);

  if (connectStatus) {
    connectStatus.textContent = ownConnected ? t("spotify.connected") : t("spotify.notConnected");
  }
}

function watchOwnConnection(uid) {
  unsubscribeOwn?.();
  unsubscribeOwn = null;

  if (!uid) return;

  unsubscribeOwn = onSnapshot(doc(db, "nowPlaying", uid), snap => {
    ownConnected = snap.exists();
    renderConnection();
  }, () => {});
}

async function connect() {
  const { data } = await authUrlCall({ redirectUri: `${location.origin}/spotify-callback.html` });
  location.href = data.url;
}

async function disconnect() {
  const confirmed = await confirmAlert({
    title: t("spotify.disconnectTitle"),
    text: t("spotify.disconnectText"),
    confirmLabel: t("spotify.disconnectShort")
  });

  if (!confirmed) return;

  await disconnectCall();
  showToast(t("spotify.disconnected"));
}

async function handleConnectClick(event) {
  event.preventDefault();

  if (busy || !state.currentUserId) return;

  busy = true;
  connectButton.classList.add("loading");

  try {
    if (ownConnected) await disconnect();
    else await connect();
  } catch (error) {
    console.error("Erro no Spotify:", error);
    showToast(t("spotify.error"));
  } finally {
    busy = false;
    connectButton.classList.remove("loading");
  }
}

function setupPanel() {
  if (!panel) return;

  const parentMenus = () => document.querySelectorAll(".side-menu.active:not([data-connections-panel])");

  const close = () => {
    panel.classList.remove("active");
    parentMenus().forEach(menu => menu.classList.remove("behind"));
  };

  document.querySelectorAll("[data-connections-trigger]").forEach(trigger => {
    trigger.addEventListener("click", event => {
      event.preventDefault();
      parentMenus().forEach(menu => menu.classList.add("behind"));
      panel.classList.add("active");
    });
  });

  panel.querySelectorAll("[data-connections-close]").forEach(button => button.addEventListener("click", close));
  connectButton?.addEventListener("click", handleConnectClick);
}

export function setSpotifyViewer(uid) {
  watchOwnConnection(uid);
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && watchedUid) requestRefresh(watchedUid);
});

setupPanel();
renderConnection();

const params = new URLSearchParams(location.search);

if (params.get("spotify") === "connected") {
  showToast(t("spotify.connectedToast"));
  params.delete("spotify");
  const query = params.toString();
  history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
}
