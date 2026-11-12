import { db } from "/src/config/config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const STORE_KEY = "realme.userSummaries.v1";
const TTL_MS = 20 * 60 * 1000;
const MAX_ENTRIES = 500;
const DEFAULT_PHOTO = "/public/img/default.jpg";

const pending = new Map();

function readStore() {
    try {
        return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {};
    } catch {
        return {};
    }
}

const store = readStore();
let saveTimer = null;

function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        const entries = Object.entries(store)
            .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
            .slice(0, MAX_ENTRIES);

        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(entries)));
        } catch {}
    }, 300);
}

function fresh(entry) {
    return entry && Date.now() - (entry.at || 0) < TTL_MS;
}

export function peekUserSummary(uid) {
    const entry = store[uid];
    return entry ? { uid, name: entry.name, username: entry.username, photo: entry.photo } : null;
}

async function fetchSummary(uid) {
    const [userSnap, mediaSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "users", uid, "user-infos", "user-media")).catch(() => null)
    ]);

    const user = userSnap.exists() ? userSnap.data() : {};
    const media = mediaSnap?.exists() ? mediaSnap.data() : {};

    const summary = {
        name: `${user.name || ""} ${user.surname || ""}`.trim() || user.username || "",
        username: user.username || "",
        photo: media.userphoto || media.pfp || DEFAULT_PHOTO,
        at: Date.now()
    };

    if (userSnap.exists()) {
        store[uid] = summary;
        persist();
    }

    return { uid, name: summary.name, username: summary.username, photo: summary.photo };
}

export function getUserSummary(uid) {
    if (!uid) return Promise.resolve({ uid: "", name: "", username: "", photo: DEFAULT_PHOTO });

    if (fresh(store[uid])) return Promise.resolve(peekUserSummary(uid));

    if (!pending.has(uid)) {
        pending.set(uid, fetchSummary(uid)
            .catch(() => peekUserSummary(uid) || { uid, name: "", username: "", photo: DEFAULT_PHOTO })
            .finally(() => pending.delete(uid)));
    }

    return pending.get(uid);
}
