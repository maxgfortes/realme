import { t } from "/src/i18n/i18n.js";
import { timeAgo } from "/src/i18n/time.js";
import { auth, db } from "/src/config/config.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const STALE_AFTER_MS = 3 * 60 * 1000;
const PSN_STALE_AFTER_MS = 15 * 60 * 1000;
const END_GRACE_MS = 30000;
const RECHECK_MS = 15000;
const DEFAULT_PFP = "/public/img/default.jpg";
const PROFILE_CACHE_KEY = "realme.liveStatusProfiles";
const STATUS_CACHE_KEY = "realme.liveStatusCache.v2";
const KINDS = ["music"];
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const COLLECTION_FOR_KIND = { music: "nowPlaying", psn: "psnStatus" };

const section = document.getElementById("liveStatus");
const row = document.getElementById("liveStatusRow");

const statuses = new Map();
const docListeners = new Map();
const profiles = new Map();

let myUid = null;
let unsubscribeFriends = null;

function statusKey(kind, uid) {
    return `${kind}:${uid}`;
}

function parseKey(key) {
    const index = key.indexOf(":");
    return { kind: key.slice(0, index), uid: key.slice(index + 1) };
}

function isPlayingNow(data) {
    if (!data?.isPlaying || !data.track) return false;

    const age = Date.now() - (data.fetchedAt || 0);
    const remaining = (data.track.durationMs || 0) - (data.progressMs || 0);

    return age < STALE_AFTER_MS && age < remaining + END_GRACE_MS;
}

function isPsnActive(data) {
    if (!data?.connected || !data.online || data.visible === false) return false;

    return Date.now() - (data.fetchedAt || 0) < PSN_STALE_AFTER_MS;
}

function isRecent(at) {
    return Boolean(at) && Date.now() - at < RECENT_MS;
}

function statusView(kind, data) {
    if (!data) return null;

    if (kind === "psn") {
        if (isPsnActive(data)) return { live: true, at: data.fetchedAt || Date.now(), game: data.game, data };
        if (data.lastGame && isRecent(data.lastGameAt)) return { live: false, at: data.lastGameAt, game: data.lastGame, data };
        if (isRecent(data.lastOnlineAt)) return { live: false, at: data.lastOnlineAt, game: null, data };
        return null;
    }

    if (isPlayingNow(data)) return { live: true, at: data.fetchedAt || Date.now(), track: data.track, data };

    const track = data.lastTrack || data.track;
    const at = data.lastPlayedAt || (data.track ? data.fetchedAt : 0);

    return track && isRecent(at) ? { live: false, at, track, data } : null;
}

function isActive(kind, data) {
    return Boolean(statusView(kind, data));
}

function dateLabel(view) {
    return view.live ? justNowLabel() : timeAgo(new Date(view.at), { capital: true });
}

function justNowLabel() {
    const label = t("time.justNow");
    return label.charAt(0).toLocaleUpperCase() + label.slice(1);
}

function readProfileCache() {
    try {
        return JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) || "{}");
    } catch {
        return {};
    }
}

const savedProfiles = readProfileCache();
const loadedProfiles = new Map(Object.entries(savedProfiles));

function saveProfile(uid, profile) {
    savedProfiles[uid] = profile;

    try {
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(savedProfiles));
    } catch {}
}

function getProfile(uid) {
    if (!profiles.has(uid)) {
        profiles.set(uid, Promise.all([
            getDoc(doc(db, "users", uid)).catch(() => null),
            getDoc(doc(db, "users", uid, "user-infos", "user-media")).catch(() => null)
        ]).then(([userSnap, mediaSnap]) => {
            const data = userSnap?.exists() ? userSnap.data() : {};
            const media = mediaSnap?.exists() ? mediaSnap.data() : {};

            const profile = {
                name: [data.name, data.surname].filter(Boolean).join(" ") || data.username || t("common.user"),
                photo: media.userphoto || media.pfp || DEFAULT_PFP
            };

            const previous = loadedProfiles.get(uid);
            loadedProfiles.set(uid, profile);
            saveProfile(uid, profile);

            if (!previous || previous.name !== profile.name || previous.photo !== profile.photo) render();

            return profile;
        }));
    }

    return profiles.get(uid);
}

function setImage(image, src) {
    if (!src || image.getAttribute("src") === src) return;

    image.classList.remove("loaded");
    image.onload = () => image.classList.add("loaded");
    image.onerror = () => {
        image.onerror = null;
        image.src = DEFAULT_PFP;
    };
    image.src = src;

    if (image.complete && image.naturalWidth) image.classList.add("loaded");
}

function buildItem(key) {
    const { kind, uid } = parseKey(key);
    const item = document.createElement("a");
    item.className = `live-status-item ${kind}`;
    item.dataset.uid = uid;
    item.dataset.key = key;
    item.href = `/profile.html?uid=${encodeURIComponent(uid)}`;
    item.innerHTML = `
        <div class="status-item-header">
            <div class="status-item-pfp" data-presence-uid="${uid}"><img alt=""></div>
            <div class="stats-item-info">
                <div class="status-item-name"></div>
                <div class="status-item-date"></div>
            </div>
        </div>
        <div class="status-item-border">
            <div class="status-item-body">
                <img class="status-item-cover" alt="">
                <div class="status-item-text">
                    <div class="status-item-label"></div>
                    <div class="status-item-track"><span class="status-item-title"></span><span class="status-item-sep" aria-hidden="true">•</span><span class="status-item-author"></span></div>
                </div>
            </div>
        </div>
    `;

    item.querySelector(".status-item-date").textContent = justNowLabel();
    item.querySelector(".status-item-label").textContent = kind === "psn" ? t("psn.playing") : t("spotify.listening");

    item.classList.add("entering");
    item.addEventListener("animationend", () => item.classList.remove("entering"), { once: true });

    return item;
}

function setTrackText(item, title, author) {
    item.querySelector(".status-item-title").textContent = title || "";
    item.querySelector(".status-item-author").textContent = author || "";
    item.querySelector(".status-item-sep").hidden = !(title && author);
}

function fillItem(item, key, data) {
    const { kind, uid } = parseKey(key);
    const view = statusView(kind, data);
    const profile = loadedProfiles.get(uid);
    const name = item.querySelector(".status-item-name");

    if (name.textContent !== profile.name) name.textContent = profile.name;

    setImage(item.querySelector(".status-item-pfp img"), profile.photo);

    item.classList.toggle("recent", !view.live);

    const date = item.querySelector(".status-item-date");
    const dateText = dateLabel(view);
    if (date.textContent !== dateText) date.textContent = dateText;

    if (kind === "psn") {
        const game = view.game;
        const label = item.querySelector(".status-item-label");
        const labelText = view.live
            ? (game ? t("psn.playing") : t("psn.onlineTitle"))
            : (game ? t("psn.played") : t("psn.wasOnline"));

        if (label.textContent !== labelText) label.textContent = labelText;

        setImage(item.querySelector(".status-item-cover"), game?.icon || data.avatar || DEFAULT_PFP);
        setTrackText(item, game?.name || data.onlineId, game?.platform || data.platform);
        return;
    }

    const track = view.track;
    const musicLabel = item.querySelector(".status-item-label");
    const musicText = view.live ? t("spotify.listening") : t("spotify.listened");

    if (musicLabel.textContent !== musicText) musicLabel.textContent = musicText;

    setImage(item.querySelector(".status-item-cover"), track.cover);
    setTrackText(item, track.name, track.artists);
}

function render() {
    const latestByUid = new Map();

    const active = [...statuses.entries()]
        .filter(([key, data]) => {
            const { kind, uid } = parseKey(key);

            if (!isActive(kind, data)) return false;

            if (!loadedProfiles.has(uid)) {
                getProfile(uid);
                return false;
            }

            getProfile(uid);
            const view = statusView(kind, data);
            latestByUid.set(uid, Math.max(latestByUid.get(uid) || 0, (view.live ? 1e15 : 0) + (view.at || 0)));
            return true;
        })
        .sort(([keyA], [keyB]) => {
            const a = parseKey(keyA);
            const b = parseKey(keyB);

            if (a.uid !== b.uid) {
                if (a.uid === myUid) return -1;
                if (b.uid === myUid) return 1;
                return (latestByUid.get(b.uid) || 0) - (latestByUid.get(a.uid) || 0) || (a.uid < b.uid ? -1 : 1);
            }

            return KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind);
        });

    const activeKeys = new Set(active.map(([key]) => key));

    row.querySelectorAll(".live-status-item").forEach(item => {
        if (activeKeys.has(item.dataset.key) || item.classList.contains("leaving")) return;

        item.classList.remove("entering");
        item.classList.add("leaving");
        item.addEventListener("animationend", () => item.remove(), { once: true });
    });

    active.forEach(([key, data], index) => {
        let item = row.querySelector(`.live-status-item[data-key="${CSS.escape(key)}"]:not(.leaving)`);

        if (!item) item = buildItem(key);

        fillItem(item, key, data);

        const current = row.querySelectorAll(".live-status-item:not(.leaving)")[index];
        if (current !== item) row.insertBefore(item, current || null);
    });

    section.classList.toggle("has-items", active.length > 0);
    saveStatusCache(active);
}

function cacheEntry(kind, data) {
    if (kind === "psn") {
        return {
            connected: data.connected,
            online: data.online,
            visible: data.visible,
            onlineId: data.onlineId,
            avatar: data.avatar,
            platform: data.platform,
            game: data.game || null,
            lastGame: data.lastGame || null,
            lastGameAt: data.lastGameAt || null,
            lastOnlineAt: data.lastOnlineAt || null,
            fetchedAt: data.fetchedAt
        };
    }

    return {
        isPlaying: data.isPlaying,
        track: data.track,
        progressMs: data.progressMs,
        lastTrack: data.lastTrack || null,
        lastPlayedAt: data.lastPlayedAt || null,
        fetchedAt: data.fetchedAt
    };
}

function saveStatusCache(active) {
    if (!myUid) return;

    try {
        localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({
            uid: myUid,
            items: active.map(([key, data]) => [key, cacheEntry(parseKey(key).kind, data)])
        }));
    } catch {}
}

function hydrateFromCache() {
    let cached = null;

    try {
        cached = JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || "null");
    } catch {}

    if (!cached?.items?.length) return;

    myUid = cached.uid;
    cached.items.forEach(([key, data]) => {
        const { kind, uid } = parseKey(String(key));
        if (KINDS.includes(kind) && isActive(kind, data) && loadedProfiles.has(uid)) statuses.set(key, data);
    });

    if (!statuses.size) return;

    section.style.transition = "none";
    render();
    row.querySelectorAll(".live-status-item").forEach(item => item.classList.remove("entering"));
    void section.offsetHeight;
    section.style.removeProperty("transition");
}

function watchStatus(uid) {
    KINDS.forEach(kind => {
        const key = statusKey(kind, uid);

        if (docListeners.has(key)) return;

        docListeners.set(key, onSnapshot(doc(db, COLLECTION_FOR_KIND[kind], uid), snap => {
            if (snap.exists()) statuses.set(key, snap.data());
            else statuses.delete(key);
            render();
        }, () => {}));
    });
}

function unwatchStatus(uid) {
    KINDS.forEach(kind => {
        const key = statusKey(kind, uid);
        docListeners.get(key)?.();
        docListeners.delete(key);
        statuses.delete(key);
    });
}

function watchedUids() {
    return new Set([...docListeners.keys(), ...statuses.keys()].map(key => parseKey(key).uid));
}

function stopAll() {
    unsubscribeFriends?.();
    unsubscribeFriends = null;
    watchedUids().forEach(unwatchStatus);
    render();
}

if (section && row) {
    hydrateFromCache();

    onAuthStateChanged(auth, user => {
        if (user?.uid !== myUid) stopAll();
        myUid = user?.uid || null;

        if (!user) return;

        watchStatus(user.uid);

        unsubscribeFriends = onSnapshot(collection(db, "users", user.uid, "friends"), snap => {
            const friendIds = new Set(snap.docs.map(friendDoc => friendDoc.id));

            friendIds.forEach(watchStatus);

            watchedUids().forEach(uid => {
                if (uid !== user.uid && !friendIds.has(uid)) unwatchStatus(uid);
            });

            render();
        }, () => {});
    });

    setInterval(render, RECHECK_MS);
}
