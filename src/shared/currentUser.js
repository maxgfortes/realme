import { auth, db } from "/src/config/config.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const CACHE_KEY = "realme.currentUser";
const LEGACY_KEY = "greeting";

const listeners = new Set();

let state = readCache();
let unsubscribers = [];

function readCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        return cached?.uid ? cached : null;
    } catch {
        return null;
    }
}

function writeCache() {
    try {
        if (!state) {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(LEGACY_KEY);
            return;
        }

        localStorage.setItem(CACHE_KEY, JSON.stringify(state));
        localStorage.setItem(LEGACY_KEY, JSON.stringify({ displayName: state.name, userphoto: state.photo }));
    } catch {}
}

function emit() {
    writeCache();
    listeners.forEach(listener => {
        try {
            listener(state);
        } catch (error) {
            console.error(error);
        }
    });
}

function update(patch) {
    const next = { ...state, ...patch };

    if (next.name === state?.name && next.photo === state?.photo && next.username === state?.username) return;

    state = next;
    emit();
}

export function getCurrentUser() {
    return state;
}

export function onCurrentUser(listener) {
    listeners.add(listener);
    if (state) listener(state);
    return () => listeners.delete(listener);
}

onAuthStateChanged(auth, user => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    unsubscribers = [];

    if (!user) {
        if (state) {
            state = null;
            emit();
        }
        return;
    }

    if (state?.uid !== user.uid) {
        state = { uid: user.uid, name: "", username: "", photo: "" };
        emit();
    }

    unsubscribers.push(onSnapshot(doc(db, "users", user.uid), snap => {
        if (!snap.exists()) return;

        const data = snap.data();
        update({
            name: [data.name, data.surname].filter(Boolean).join(" ").trim() || data.username || "",
            username: data.username || ""
        });
    }, () => {}));

    unsubscribers.push(onSnapshot(doc(db, "users", user.uid, "user-infos", "user-media"), snap => {
        const photo = snap.exists() ? snap.data().userphoto || "" : "";
        if (photo) update({ photo });
    }, () => {}));
});
