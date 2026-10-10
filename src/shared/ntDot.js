import { auth, db } from "/src/config/config.js";

import {
    collection,
    query,
    where,
    limit,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


const CACHE_KEY = "hasUnreadNotif";
const root = document.documentElement;

function setActive(active) {
    root.classList.toggle("has-unread-notif", active);
    localStorage.setItem(CACHE_KEY, active ? "1" : "0");
}

root.classList.toggle(
    "has-unread-notif",
    localStorage.getItem(CACHE_KEY) === "1"
);

let unsubscribe = null;

onAuthStateChanged(auth, user => {
    unsubscribe?.();
    unsubscribe = null;

    if (!user) {
        localStorage.removeItem(CACHE_KEY);
        root.classList.remove("has-unread-notif");
        return;
    }

    unsubscribe = onSnapshot(
        query(
            collection(db, "notifications"),
            where("toUid", "==", user.uid),
            where("read", "==", false),
            limit(100)
        ),
        snapshot => setActive(snapshot.docs.some(d => d.data().visible !== false)),
        error => console.error("Erro ao ouvir notificações:", error)
    );
});