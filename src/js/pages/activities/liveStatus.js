import { t } from "/src/i18n/i18n.js";
import { auth, db } from "/src/config/config.js";
import { collection, doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const STALE_AFTER_MS = 3 * 60 * 1000;
const END_GRACE_MS = 30000;
const RECHECK_MS = 15000;
const DEFAULT_PFP = "/public/img/default.jpg";
const PROFILE_CACHE_KEY = "realme.liveStatusProfiles";
const STATUS_CACHE_KEY = "realme.liveStatusCache";

const section = document.getElementById("liveStatus");
const row = document.getElementById("liveStatusRow");

const statuses = new Map();
const docListeners = new Map();
const profiles = new Map();

let myUid = null;
let unsubscribeFriends = null;

function isPlayingNow(data) {
    if (!data?.isPlaying || !data.track) return false;

    const age = Date.now() - (data.fetchedAt || 0);
    const remaining = (data.track.durationMs || 0) - (data.progressMs || 0);

    return age < STALE_AFTER_MS && age < remaining + END_GRACE_MS;
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

function buildItem(uid) {
    const item = document.createElement("a");
    item.className = "live-status-item";
    item.dataset.uid = uid;
    item.href = `/profile.html?uid=${encodeURIComponent(uid)}`;
    item.innerHTML = `
        <div class="status-item-header">
            <div class="status-item-pfp"><img alt=""></div>
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
    item.querySelector(".status-item-label").textContent = t("spotify.listening");

    item.classList.add("entering");
    item.addEventListener("animationend", () => item.classList.remove("entering"), { once: true });

    return item;
}

function fillItem(item, uid, track) {
    const profile = loadedProfiles.get(uid);
    const name = item.querySelector(".status-item-name");

    if (name.textContent !== profile.name) name.textContent = profile.name;

    setImage(item.querySelector(".status-item-pfp img"), profile.photo);
    setImage(item.querySelector(".status-item-cover"), track.cover);

    item.querySelector(".status-item-title").textContent = track.name || "";
    item.querySelector(".status-item-author").textContent = track.artists || "";
    item.querySelector(".status-item-sep").hidden = !(track.name && track.artists);
}

function render() {
    const active = [...statuses.entries()]
        .filter(([uid, data]) => {
            if (!isPlayingNow(data)) return false;
            if (!loadedProfiles.has(uid)) {
                getProfile(uid);
                return false;
            }
            getProfile(uid);
            return true;
        })
        .sort(([uidA, a], [uidB, b]) => {
            if (uidA === myUid) return -1;
            if (uidB === myUid) return 1;
            return (b.fetchedAt || 0) - (a.fetchedAt || 0);
        });

    const activeIds = new Set(active.map(([uid]) => uid));

    row.querySelectorAll(".live-status-item").forEach(item => {
        if (activeIds.has(item.dataset.uid) || item.classList.contains("leaving")) return;

        item.classList.remove("entering");
        item.classList.add("leaving");
        item.addEventListener("animationend", () => item.remove(), { once: true });
    });

    active.forEach(([uid, data], index) => {
        let item = row.querySelector(`.live-status-item[data-uid="${CSS.escape(uid)}"]:not(.leaving)`);

        if (!item) item = buildItem(uid);

        fillItem(item, uid, data.track);

        const current = row.querySelectorAll(".live-status-item:not(.leaving)")[index];
        if (current !== item) row.insertBefore(item, current || null);
    });

    section.classList.toggle("has-items", active.length > 0);
    saveStatusCache(active);
}

function saveStatusCache(active) {
    if (!myUid) return;

    try {
        localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify({
            uid: myUid,
            items: active.map(([uid, data]) => [uid, {
                isPlaying: data.isPlaying,
                track: data.track,
                progressMs: data.progressMs,
                fetchedAt: data.fetchedAt
            }])
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
    cached.items.forEach(([uid, data]) => {
        if (isPlayingNow(data) && loadedProfiles.has(uid)) statuses.set(uid, data);
    });

    if (!statuses.size) return;

    section.style.transition = "none";
    render();
    row.querySelectorAll(".live-status-item").forEach(item => item.classList.remove("entering"));
    void section.offsetHeight;
    section.style.removeProperty("transition");
}

function watchStatus(uid) {
    if (docListeners.has(uid)) return;

    docListeners.set(uid, onSnapshot(doc(db, "nowPlaying", uid), snap => {
        if (snap.exists()) statuses.set(uid, snap.data());
        else statuses.delete(uid);
        render();
    }, () => {}));
}

function unwatchStatus(uid) {
    docListeners.get(uid)?.();
    docListeners.delete(uid);
    statuses.delete(uid);
}

function stopAll() {
    unsubscribeFriends?.();
    unsubscribeFriends = null;
    [...docListeners.keys()].forEach(unwatchStatus);
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

            new Set([...docListeners.keys(), ...statuses.keys()]).forEach(uid => {
                if (uid !== user.uid && !friendIds.has(uid)) unwatchStatus(uid);
            });

            render();
        }, () => {});
    });

    setInterval(render, RECHECK_MS);
}
