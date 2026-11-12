import { t } from "/src/i18n/i18n.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { app, db } from "./firebase.js";
import { doc, onSnapshot } from "./firestore.js";
import { state } from "./state.js";
import { confirmAlert } from "./confirmAlert.js";
import { showToast } from "./toast.js";

const functions = getFunctions(app, "us-central1");
const connectCall = httpsCallable(functions, "psnConnect");
const disconnectCall = httpsCallable(functions, "psnDisconnect");
const refreshCall = httpsCallable(functions, "psnRefresh");

const REFRESH_INTERVAL_MS = 60 * 1000;
const STALE_AFTER_MS = 15 * 60 * 1000;
const DEFAULT_COVER = "/public/img/default.jpg";

const card = document.getElementById("psnStatus");
const cover = document.getElementById("psnCover");
const titleEl = document.getElementById("psnTitle");
const subEl = document.getElementById("psnSub");

const track = document.getElementById("statusTrack");
const dots = document.getElementById("statusDots");

const connectButton = document.getElementById("psnConnectBtn");
const connectLabel = document.getElementById("psnConnectLabel");
const connectStatus = document.getElementById("psnConnectStatus");
const form = document.getElementById("psnForm");
const input = document.getElementById("psnOnlineId");
const submit = document.getElementById("psnSubmit");

const ERROR_KEYS = {
    PSN_INVALID_ID: "psn.invalidId",
    PSN_USER_NOT_FOUND: "psn.notFound",
    PSN_NOT_CONFIGURED: "psn.unavailable",
    PSN_NPSSO_EXPIRED: "psn.unavailable",
    PSN_UNAVAILABLE: "psn.unavailable"
};

let watchedUid = null;
let unsubscribeStatus = null;
let unsubscribeOwn = null;
let refreshTimer = null;
let ownStatus = null;
let busy = false;
let lastCardCount = 0;

function isActive(data) {
    if (!data?.connected || !data.online || data.visible === false) return false;
    return Date.now() - (data.fetchedAt || 0) < STALE_AFTER_MS;
}

function setVisible(visible) {
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

    card.hidden = true;
    card.classList.remove("entering", "leaving");
}

function render(data) {
    if (!isActive(data)) {
        setVisible(false);
        return;
    }

    const game = data.game;
    const platform = game?.platform || data.platform || "PlayStation";

    titleEl.textContent = game?.name || t("psn.onlineTitle");
    subEl.textContent = [platform, data.onlineId].filter(Boolean).join(" · ");

    const image = game?.icon || data.avatar || DEFAULT_COVER;

    if (cover.getAttribute("src") !== image) cover.src = image;

    card.classList.toggle("playing", Boolean(game));
    setVisible(true);
}

function requestRefresh(uid) {
    if (!uid || document.visibilityState !== "visible") return;
    refreshCall({ uid }).catch(() => {});
}

function stopWatching() {
    unsubscribeStatus?.();
    unsubscribeStatus = null;
    clearInterval(refreshTimer);
    refreshTimer = null;
    setVisible(false);
}

export function watchPsn(uid) {
    if (!card || uid === watchedUid) return;

    stopWatching();
    watchedUid = uid;

    if (!uid) return;

    unsubscribeStatus = onSnapshot(
        doc(db, "psnStatus", uid),
        snap => render(snap.exists() ? snap.data() : null),
        () => render(null)
    );

    refreshTimer = setInterval(() => requestRefresh(uid), REFRESH_INTERVAL_MS);
    requestRefresh(uid);
}

function renderConnection() {
    if (!connectButton) return;

    const connected = Boolean(ownStatus?.connected);

    connectLabel.textContent = connected ? t("psn.disconnect") : t("psn.connect");
    connectButton.classList.toggle("logoff", connected);

    connectStatus.textContent = connected
        ? t("psn.connectedAs", { name: ownStatus.onlineId || "" })
        : "";

    if (connected) form.hidden = true;
}

function watchOwn(uid) {
    unsubscribeOwn?.();
    unsubscribeOwn = null;

    if (!uid) return;

    unsubscribeOwn = onSnapshot(doc(db, "psnStatus", uid), snap => {
        ownStatus = snap.exists() ? snap.data() : null;
        renderConnection();
    }, () => {});
}

export function setPsnViewer(uid) {
    watchOwn(uid);
}

function errorMessage(error) {
    const key = ERROR_KEYS[error?.message] || ERROR_KEYS[error?.details] || "psn.error";
    return t(key);
}

async function connect(event) {
    event.preventDefault();

    const onlineId = input.value.trim();

    if (busy || !onlineId) return;

    busy = true;
    submit.disabled = true;
    connectButton.classList.add("loading");

    try {
        const { data } = await connectCall({ onlineId });
        input.value = "";
        form.hidden = true;
        showToast(data?.visible === false ? t("psn.privateToast") : t("psn.connectedToast"));
    } catch (error) {
        console.error("Erro na PSN:", error);
        showToast(errorMessage(error));
    } finally {
        busy = false;
        submit.disabled = false;
        connectButton.classList.remove("loading");
    }
}

async function disconnect() {
    const confirmed = await confirmAlert({
        title: t("psn.disconnectTitle"),
        text: t("psn.disconnectText"),
        confirmLabel: t("psn.disconnectShort")
    });

    if (!confirmed) return;

    busy = true;
    connectButton.classList.add("loading");

    try {
        await disconnectCall();
        showToast(t("psn.disconnected"));
    } catch (error) {
        console.error("Erro na PSN:", error);
        showToast(t("psn.error"));
    } finally {
        busy = false;
        connectButton.classList.remove("loading");
    }
}

function handleButton(event) {
    event.preventDefault();

    if (busy || !state.currentUserId) return;

    if (ownStatus?.connected) {
        disconnect();
        return;
    }

    form.hidden = !form.hidden;
    if (!form.hidden) input.focus();
}

function visibleCards() {
    return [...track.children].filter(child => !child.hidden);
}

function updateDots() {
    if (!track || !dots) return;

    const cards = visibleCards();
    const count = cards.length;

    if (count !== lastCardCount) {
        lastCardCount = count;
        track.scrollLeft = 0;
    }

    track.classList.toggle("multi", count > 1);
    dots.hidden = count < 2;

    if (count < 2) {
        dots.replaceChildren();
        return;
    }

    const width = track.clientWidth || 1;
    const active = Math.min(count - 1, Math.round(track.scrollLeft / width));

    if (dots.children.length !== count) {
        dots.replaceChildren(...cards.map(() => {
            const dot = document.createElement("span");
            dot.className = "status-dot";
            return dot;
        }));
    }

    [...dots.children].forEach((dot, index) => dot.classList.toggle("active", index === active));
}

function setupCarousel() {
    if (!track) return;

    new MutationObserver(updateDots).observe(track, {
        attributes: true,
        attributeFilter: ["hidden"],
        subtree: true
    });

    track.addEventListener("scroll", () => requestAnimationFrame(updateDots), { passive: true });
    window.addEventListener("resize", updateDots);
    updateDots();
}

connectButton?.addEventListener("click", handleButton);
form?.addEventListener("submit", connect);

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && watchedUid) requestRefresh(watchedUid);
});

setupCarousel();
renderConnection();
