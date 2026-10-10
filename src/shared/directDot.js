import { auth, db } from "/src/config/config.js";

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const CACHE_KEY = "hasUnreadDm";

const unreadChats = new Set();
const listeners = new Map();

function render() {
    const has = unreadChats.size > 0;

    document.documentElement.classList.toggle("has-unread-dm", has);
    localStorage.setItem(CACHE_KEY, has ? "1" : "0");
}

document.documentElement.classList.toggle(
    "has-unread-dm",
    localStorage.getItem(CACHE_KEY) === "1"
);

onAuthStateChanged(auth, user => {
    if (!user) {
        localStorage.removeItem(CACHE_KEY);
        document.documentElement.classList.remove("has-unread-dm");
        return;
    }

    onSnapshot(
        query(collection(db, "chats"), where("participants", "array-contains", user.uid)),
        chats => {
            const ids = new Set(chats.docs.map(d => d.id));

            for (const [id, unsubscribe] of listeners) {
                if (ids.has(id)) continue;

                unsubscribe();
                listeners.delete(id);
                unreadChats.delete(id);
            }

            ids.forEach(id => {
                if (listeners.has(id)) return;

                const latest = query(
                    collection(db, "chats", id, "messages"),
                    orderBy("timestamp", "desc"),
                    limit(1)
                );

                listeners.set(id, onSnapshot(latest, snap => {
                    const msg = snap.docs[0]?.data();
                    const unread = msg && msg.sender !== user.uid && msg.read === false;

                    unread ? unreadChats.add(id) : unreadChats.delete(id);
                    render();
                }));
            });

            render();
        }
    );
});