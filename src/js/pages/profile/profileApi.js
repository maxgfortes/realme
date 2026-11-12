import { Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { auth } from "./firebase.js";

const ENDPOINT = "https://us-central1-ifriendmatch.cloudfunctions.net/profileContent";
const CACHE_PREFIX = "realme.profileContent.v1.";
const CACHE_MAX_PROFILES = 12;

export function revive(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(revive);

    if (typeof value === "object") {
        if (typeof value.__ts === "number" && Object.keys(value).length === 1) return Timestamp.fromMillis(value.__ts);

        const out = {};
        for (const [key, inner] of Object.entries(value)) out[key] = revive(inner);
        return out;
    }

    return value;
}

export async function fetchProfileContent({ uid = "", username = "", section = "", cursor = "", anonymous = false } = {}) {
    const params = new URLSearchParams();

    if (uid) params.set("uid", uid);
    if (username) params.set("username", username);
    if (section) params.set("section", section);
    if (cursor) params.set("cursor", cursor);

    const headers = {};
    const user = anonymous ? null : auth.currentUser;

    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;

    const response = await fetch(`${ENDPOINT}?${params}`, { headers });

    if (response.status === 404) {
        const error = new Error("NOT_FOUND");
        error.code = "not-found";
        throw error;
    }

    if (!response.ok) throw new Error(`profileContent ${response.status}`);

    return response.json();
}

function cacheKey(uid) {
    return `${CACHE_PREFIX}${auth.currentUser?.uid || "anon"}.${uid}`;
}

export function readContentCache(uid) {
    try {
        return JSON.parse(localStorage.getItem(cacheKey(uid)) || "null");
    } catch {
        return null;
    }
}

export function writeContentCache(uid, content) {
    try {
        localStorage.setItem(cacheKey(uid), JSON.stringify({
            at: Date.now(),
            profile: content.profile,
            posts: content.posts,
            nextCursor: content.nextCursor,
            wall: (content.wall || []).slice(0, 30)
        }));

        const keys = Object.keys(localStorage)
            .filter(key => key.startsWith(CACHE_PREFIX))
            .map(key => [key, JSON.parse(localStorage.getItem(key) || "{}").at || 0])
            .sort((a, b) => b[1] - a[1]);

        keys.slice(CACHE_MAX_PROFILES).forEach(([key]) => localStorage.removeItem(key));
    } catch {}
}
