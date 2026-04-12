import { getApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  query,
  where,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// ─── Firebase config ─────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
};

const app = getApp();
const auth = getAuth(app);
const db = getFirestore(app);

// ─── Listener em tempo real ──────────────────
let unsubscribe = null;

function listenUnreadNotifications(uid) {
  // evita múltiplos listeners
  if (unsubscribe) unsubscribe();

  const q = query(
    collection(db, "notifications"),
    where("toUid", "==", uid),
    where("read", "==", false),
    where("visible", "!=", false),
    limit(1)
  );

  const btn = document.querySelector(".top-btn2");

  if (!btn) return;

  unsubscribe = onSnapshot(q, (snap) => {
    if (!snap.empty) {
      btn.classList.add("update-dot-nt");
    } else {
      btn.classList.remove("update-dot-nt");
    }
  }, (err) => {
    console.error("Erro no realtime de notificações:", err);
  });
}

// ─── Auth ────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (user) {
    listenUnreadNotifications(user.uid);
  } else {
    const btn = document.querySelector(".top-btn2");
    if (btn) btn.classList.remove("update-dot-nt");

    if (unsubscribe) unsubscribe();
  }
});