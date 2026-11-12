import { auth, db } from "/src/config/config.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { terminate, clearIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const KEEP_KEYS = ["realme.lang", "realme.theme", "realme.radius"];

function clearStorage() {
    try {
        const kept = KEEP_KEYS
            .map(key => [key, localStorage.getItem(key)])
            .filter(([, value]) => value !== null);

        localStorage.clear();
        kept.forEach(([key, value]) => localStorage.setItem(key, value));
    } catch {}

    try {
        sessionStorage.clear();
    } catch {}
}

async function clearCaches() {
    if (!("caches" in window)) return;

    try {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
    } catch {}
}

async function clearFirestore() {
    try {
        await terminate(db);
        await clearIndexedDbPersistence(db);
    } catch {}
}

export async function clearAppData() {
    clearStorage();
    await Promise.all([clearCaches(), clearFirestore()]);
}

export async function logoutAndClear(redirect = "/login.html") {
    try {
        await signOut(auth);
    } catch {}

    await clearAppData();
    location.replace(redirect);
}
