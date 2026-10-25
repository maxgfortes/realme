import { t } from "/src/i18n/i18n.js";
import { auth, db } from "/src/config/config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    doc, getDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import "/src/shared/errorReporter.js";
import "/src/shared/activityDot.js";

const ACTIVE_THROTTLE_MS = 60 * 60 * 1000;
const ACTIVE_KEY = "realme.lastActivePing";

let isAdmin = false;
let config = {};
let overlay = null;

function shouldPing(uid) {
    try {
        const saved = JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}");
        return saved.uid !== uid || Date.now() - (saved.at || 0) > ACTIVE_THROTTLE_MS;
    } catch {
        return true;
    }
}

function markPinged(uid) {
    try {
        localStorage.setItem(ACTIVE_KEY, JSON.stringify({ uid, at: Date.now() }));
    } catch {}
}

async function pingActivity(uid) {
    if (!shouldPing(uid)) return;

    try {
        await updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() });
        markPinged(uid);
    } catch {}
}

async function checkBanned(uid) {
    try {
        const snap = await getDoc(doc(db, "users", uid));

        if (snap.exists() && snap.data().banned === true) {
            await signOut(auth);
            location.replace("/login.html?banned=1");
        }
    } catch {}
}

async function checkAdmin(uid) {
    try {
        isAdmin = (await getDoc(doc(db, "admin", uid))).exists();
    } catch {
        isAdmin = false;
    }
}

function renderMaintenance() {
    const active = config.maintenance === true && !isAdmin;

    if (!active) {
        overlay?.remove();
        overlay = null;
        return;
    }

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.className = "maintenance-overlay";
        overlay.innerHTML = `
            <div class="maintenance-box">
                <div class="maintenance-title"></div>
                <div class="maintenance-text"></div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    overlay.querySelector(".maintenance-title").textContent = config.maintenanceTitle || t("app.maintenanceTitle");
    overlay.querySelector(".maintenance-text").textContent = config.maintenanceMessage || t("app.maintenanceText");
}

onSnapshot(doc(db, "config", "app"), snap => {
    config = snap.exists() ? snap.data() : {};
    renderMaintenance();
}, () => {});

onAuthStateChanged(auth, async user => {
    if (!user) {
        isAdmin = false;
        renderMaintenance();
        return;
    }

    await checkAdmin(user.uid);
    renderMaintenance();
    checkBanned(user.uid);
    pingActivity(user.uid);
});
