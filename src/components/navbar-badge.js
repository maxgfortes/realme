import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain:        "ifriendmatch.firebaseapp.com",
  projectId:         "ifriendmatch",
  storageBucket:     "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId:             "1:306331636603:web:c0ae0bd22501803995e3de",
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ── Estilo do badge ───────────────────────────────────────────────────────────
(function injectStyle() {
  if (document.getElementById("__navBadgeStyle")) return;
  const s = document.createElement("style");
  s.id = "__navBadgeStyle";
  s.textContent = `
    .nav-direct-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    #__navUnreadBadge {
      position: absolute;
      bottom: 4px;
      right: 4px;
      min-width: 17px;
      height: 17px;
      aspect-ratio: 1/1;
      padding: 2px 4px;
      border-radius: 999px;
      background: red;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      font-family: -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      text: none;
      border: 2px solid var(--navbar-bg, #fff);
      pointer-events: none;
      animation: __badgePop 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    #__navUnreadBadge.hidden {
      display: none;
    }
    @keyframes __badgePop {
      from { transform: scale(0.4); opacity: 0; }
      to   { transform: scale(1);   opacity: 1; }
    }
  `;
  document.head.appendChild(s);
})();

function getOrCreateWrapper() {
  const existing = document.getElementById("__navDirectWrap");
  if (existing) return existing;

  const link = document.querySelector('a[href="direct.html"], a[href="./direct.html"]');
  if (!link) return null;

  const wrap = document.createElement("span");
  wrap.id = "__navDirectWrap";
  wrap.className = "nav-direct-wrap";
  link.parentNode.insertBefore(wrap, link);
  wrap.appendChild(link);
  return wrap;
}

function getBadge() {
  let badge = document.getElementById("__navUnreadBadge");
  if (!badge) {
    const wrap = getOrCreateWrapper();
    if (!wrap) return null;
    badge = document.createElement("span");
    badge.id = "__navUnreadBadge";
    badge.className = "hidden";
    wrap.appendChild(badge);
  }
  return badge;
}

function updateBadge(count) {
  const badge = getBadge();
  if (!badge) return;

  if (count <= 0) {
    badge.classList.add("hidden");
    return;
  }

  badge.classList.remove("hidden");
  badge.style.animation = "none";
  requestAnimationFrame(() => { badge.style.animation = ""; });
  badge.textContent = count > 99 ? "99+" : String(count);
}

// ── Listener em tempo real ────────────────────────────────────────────────────
let unsub = null;

function startBadgeListener(myUid) {
  if (unsub) unsub();

  unsub = onSnapshot(
    query(collection(db, "chats"), where("participants", "array-contains", myUid)),
    (snap) => {
      let totalUnread = 0;
      snap.forEach(chatDoc => {
        const cd = chatDoc.data();
        if (
          cd.lastMessageSender &&
          cd.lastMessageSender !== myUid &&
          !cd.lastMessageRead
        ) {
          totalUnread++;
        }
      });
      updateBadge(totalUnread);
    },
    (err) => console.warn("[navbar-badge]", err.message)
  );
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Espera o DOM estar pronto antes de buscar o link na navbar
function init() {
  onAuthStateChanged(auth, (user) => {
    if (!user) { updateBadge(0); return; }
    startBadgeListener(user.uid);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}