import { auth, db } from "/src/config/config.js";
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const MAX_PER_SESSION = 5;
const IGNORED = [
    "ResizeObserver loop",
    "Script error",
    "Load failed",
    "NetworkError",
    "Failed to fetch",
    "The operation was aborted"
];

const seen = new Set();
let sent = 0;

function clip(value, max) {
    return String(value || "").slice(0, max);
}

function report(message, stack, source) {
    message = clip(message, 300);

    if (!message || sent >= MAX_PER_SESSION) return;
    if (IGNORED.some(pattern => message.includes(pattern))) return;
    if (seen.has(message)) return;

    seen.add(message);
    sent += 1;

    addDoc(collection(db, "clientErrors"), {
        message,
        stack: clip(stack, 2000),
        source: clip(source, 300),
        page: clip(location.pathname, 120),
        userAgent: clip(navigator.userAgent, 300),
        uid: auth.currentUser?.uid || null,
        createdAt: serverTimestamp()
    }).catch(() => {});
}

window.addEventListener("error", event => {
    report(event.message, event.error?.stack, `${event.filename || ""}:${event.lineno || 0}:${event.colno || 0}`);
});

window.addEventListener("unhandledrejection", event => {
    const reason = event.reason;
    report(reason?.message || String(reason), reason?.stack, "promise");
});
