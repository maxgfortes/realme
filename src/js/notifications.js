import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  updateDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  databaseURL: "https://ifriendmatch-default-rtdb.firebaseio.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.firebasestorage.app",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ─── Mensagens por tipo ─────────────────────────────────────────────────────
const NT_MESSAGES = {
  like:            "curtiu sua publicação.",
  like_comment:    "curtiu seu comentário.",
  comment:         "comentou na sua publicação.",
  reply:           "respondeu seu comentário.",
  follow:          "começou a te seguir.",
  mention_post:    "te mencionou em uma publicação.",
  mention_comment: "te mencionou em um comentário.",
};

function resolveMessage(nt) {
  return NT_MESSAGES[nt.type] ?? nt.message ?? "interagiu com você.";
}

// ─── Cache de dados de usuários ────────────────────────────────────────────
const userCache = {};

async function fetchUserData(uid) {
  if (userCache[uid]) return userCache[uid];
  try {
    const [userSnap, mediaSnap] = await Promise.all([
      getDoc(doc(db, "users", uid)),
      getDoc(doc(db, "users", uid, "user-infos", "user-media")),
    ]);
    const username = userSnap.exists() ? userSnap.data().username || "usuário" : "usuário";
    const userphoto = mediaSnap.exists() ? mediaSnap.data().userphoto || null : null;
    userCache[uid] = { username, userphoto };
    return userCache[uid];
  } catch {
    return { username: "usuário", userphoto: null };
  }
}

// ─── Tempo relativo ─────────────────────────────────────────────────────────
function formatTime(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// ─── Agrupamento por dia ────────────────────────────────────────────────────
function getDayLabel(date) {
  const now = new Date();
  const d = new Date(date);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor(
    (todayStart - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000
  );
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  if (diffDays < 7) return weekdays[d.getDay()];
  return "Semana passada";
}

function groupByDay(notifications) {
  const groups = {};
  const order = [];
  for (const nt of notifications) {
    const label = getDayLabel(nt.createdAt);
    if (!groups[label]) {
      groups[label] = [];
      order.push(label);
    }
    groups[label].push(nt);
  }
  return { groups, order };
}

// ─── Estado vazio ───────────────────────────────────────────────────────────
function renderEmpty() {
  const list = document.getElementById("notifications-list");
  list.innerHTML = `
    <div class="nt-empty">
      <p class="nt-empty-title">Sem notificações</p>
      <p class="nt-empty-sub">Interaja para receber notificações</p>
    </div>`;
}

function checkEmptyAfterDelete() {
  const list = document.getElementById("notifications-list");
  if (!list.querySelector(".nt-swipe-wrapper")) renderEmpty();
}

// ─── Swipe para deletar ─────────────────────────────────────────────────────
function attachSwipe(boxEl) {
  let startX = 0;
  let currentX = 0;
  let dragging = false;
  const THRESHOLD = 72;

  const btn = () => boxEl.parentElement?.querySelector(".nt-delete-btn");

  const onStart = (e) => {
    startX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX;
    dragging = true;
    boxEl.style.transition = "none";
  };
  const onMove = (e) => {
    if (!dragging) return;
    const x = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
    currentX = Math.min(0, x - startX);
    boxEl.style.transform = `translateX(${currentX}px)`;
    const b = btn();
    if (b) b.style.opacity = Math.min(1, Math.abs(currentX) / THRESHOLD);
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    boxEl.style.transition = "transform 0.25s ease";
    if (Math.abs(currentX) >= THRESHOLD) {
      boxEl.style.transform = `translateX(-${THRESHOLD}px)`;
    } else {
      boxEl.style.transform = "translateX(0)";
      const b = btn();
      if (b) b.style.opacity = "0";
    }
    currentX = 0;
  };

  boxEl.addEventListener("touchstart", onStart, { passive: true });
  boxEl.addEventListener("touchmove", onMove, { passive: true });
  boxEl.addEventListener("touchend", onEnd);
  boxEl.addEventListener("mousedown", onStart);
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onEnd);
}

// ─── Elemento de notificação ────────────────────────────────────────────────
const DEFAULT_AVATAR = "../src/img/default.jpg";

function createNtElement(nt, uid) {
  const wrapper = document.createElement("div");
  wrapper.className = "nt-swipe-wrapper";
  wrapper.dataset.ntId = nt.id;

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "nt-delete-btn";
  deleteBtn.setAttribute("aria-label", "Apagar notificação");
  deleteBtn.innerHTML = `Apagar`;

  const box = document.createElement("div");
  box.className = `nt-box${!nt.read ? " new" : ""}`;

  const avatarArea = document.createElement("div");
  avatarArea.className = "avatar-area";
  const img = document.createElement("img");
  img.src = nt.userphoto || DEFAULT_AVATAR;
  img.alt = nt.username;
  img.loading = "lazy";
  img.onerror = () => { img.src = DEFAULT_AVATAR; };
  avatarArea.appendChild(img);

  const contentArea = document.createElement("div");
  contentArea.className = "content-area";
  contentArea.innerHTML = `<p><span class="nt-username">${nt.username}</span> ${resolveMessage(nt)} <span class="nt-time">${formatTime(nt.createdAt)}</span></p>`;

  box.appendChild(avatarArea);
  box.appendChild(contentArea);
  wrapper.appendChild(deleteBtn);
  wrapper.appendChild(box);

  attachSwipe(box);

  deleteBtn.addEventListener("click", () => {
    wrapper.classList.add("nt-removing");
    wrapper.addEventListener("animationend", async () => {
  try {
    await updateDoc(doc(db, "notifications", nt.id), { visible: false });
  } catch (err) {
    console.error("Erro ao ocultar notificação:", err);
  }

  wrapper.remove();

  document.querySelectorAll(".nt-container").forEach((c) => {
    if (!c.querySelector(".nt-swipe-wrapper")) c.remove();
  });

  checkEmptyAfterDelete();
}, { once: true });
  });

  return wrapper;
}

// ─── Renderizar notificações ────────────────────────────────────────────────
async function renderNotifications(uid) {
  const list = document.getElementById("notifications-list");
  list.innerHTML = "";

  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  let snaps;
  try {
    const q = query(
      collection(db, "notifications"),
      where("toUid", "==", uid),
      where("visible", "!=", false),
      where("createdAt", ">=", Timestamp.fromDate(twoWeeksAgo)),
      orderBy("createdAt", "desc")
    );
    snaps = await getDocs(q);

    const unread = snaps.docs.filter(d => !d.data().read);

    await Promise.all(
       unread.map(d =>
       updateDoc(doc(db, "notifications", d.id), { read: true })
     )
    );

  } catch (err) {
    console.error("Erro ao buscar notificações:", err);
    renderEmpty();
    return;
  }

  if (snaps.empty) {
    renderEmpty();
    return;
  }

  const rawNts = snaps.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt?.toDate(),
  }));

  const uniqueUids = [...new Set(rawNts.map((n) => n.fromUid).filter(Boolean))];
  await Promise.all(uniqueUids.map(fetchUserData));

  const notifications = rawNts.map((nt) => {
    const userData = userCache[nt.fromUid] || { username: "usuário", userphoto: null };
    return { ...nt, ...userData };
  });

  const { groups, order } = groupByDay(notifications);

  list.innerHTML = "";

  for (const label of order) {
    const container = document.createElement("div");
    container.className = "nt-container";

    const title = document.createElement("div");
    title.className = "nt-container-title";
    title.textContent = label;

    const nts = document.createElement("div");
    nts.className = "nts";

    for (const nt of groups[label]) {
      nts.appendChild(createNtElement(nt, uid));
    }

    container.appendChild(title);
    container.appendChild(nts);
    list.appendChild(container);
  }

  list.querySelectorAll(".nt-swipe-wrapper").forEach((el, i) => {
    el.style.animationDelay = `${i * 40}ms`;
    el.classList.add("nt-animate-in");
  });
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    renderNotifications(user.uid);
  } else {
    renderEmpty();
  }
});


