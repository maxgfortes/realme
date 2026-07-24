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
  deleteDoc,
  setDoc,
  serverTimestamp,
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


const NT_MESSAGES = {
  like:            "curtiu sua publicação.",
  like_comment:    "curtiu seu comentário.",
  comment:         "comentou na sua publicação.",
  reply:           "respondeu seu comentário.",
  follow:          "começou a te seguir.",
  mention_post:    "te mencionou em uma publicação.",
  mention_comment: "te mencionou em um comentário.",
  friend_request:  "te enviou um pedido de amizade.",
  friend_accepted: "aceitou seu pedido de amizade.",
};

function resolveMessage(nt) {
  return NT_MESSAGES[nt.type] ?? nt.message ?? "interagiu com você.";
}


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


function formatTime(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}


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


// ─────────────────────────────────────────────────────────
// AMIZADE — aceitar / recusar
// ─────────────────────────────────────────────────────────
async function aceitarAmizade(fromUid, meUid) {
  // fromUid = quem enviou (resource.data.from)
  // meUid   = quem aceita (resource.data.to) — auth.uid deve ser este
  // updateDoc só toca status+acceptedAt, compatível com a security rule
  await updateDoc(doc(db, `friendRequests/${fromUid}_${meUid}`), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
  });
}

async function recusarAmizade(fromUid, meUid) {
  await Promise.all([
    deleteDoc(doc(db, `friendRequests/${fromUid}_${meUid}`)),
    deleteDoc(doc(db, `friendRequests/${meUid}_${fromUid}`)),
  ]);
}

// ─────────────────────────────────────────────────────────
// OVERLAY — Pedidos de Amizade
// ─────────────────────────────────────────────────────────
async function abrirOverlayPedidos(meUid) {
  if (document.getElementById("fr-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "fr-overlay";
  overlay.innerHTML = `
    <div class="fr-backdrop"></div>
    <div class="fr-panel">
      <div class="fr-header">
        <div class="header-block">
          <button id="fr-close-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 298 511.93"><path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16l-215-214.47c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7l-185.5 185.04L285.77 441z"/></svg>
          </button>
          <div class="nt-title">Pedidos de amizade</div>
        </div>
        <div class="header-block"></div>
        <div class="header-block"></div>
      </div>
      <div class="fr-list" id="fr-list">
        <div class="fr-loading"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = "hidden";
  requestAnimationFrame(() => overlay.classList.add("fr-open"));

  const fechar = () => {
    overlay.classList.remove("fr-open");
    overlay.addEventListener("transitionend", () => {
      overlay.remove();
      document.body.style.overflow = "";
    }, { once: true });
  };

  overlay.querySelector("#fr-close-btn").addEventListener("click", fechar);
  overlay.querySelector(".fr-backdrop").addEventListener("click", fechar);

  await carregarPedidos(meUid, overlay.querySelector("#fr-list"));
}

async function carregarPedidos(meUid, listEl) {
  try {
    const snap = await getDocs(
      query(collection(db, "friendRequests"), where("to", "==", meUid), where("status", "==", "pending"))
    );

    if (snap.empty) {
      listEl.innerHTML = `
        <div class="fr-empty">
          <svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><path d="M384,448v-42.7c0-58.9-47.7-106.7-106.7-106.7H106.7C47.7,298.7,0,346.4,0,405.3V448c0,11.8,9.6,21.3,21.3,21.3c11.8,0,21.3-9.6,21.3-21.3v-42.7c0.1-35.3,28.7-63.9,64-64l170.7,0c35.3,0.1,63.9,28.7,64,64V448c0,11.8,9.6,21.3,21.3,21.3S384,459.8,384,448z"/><path d="M192,64v21.3c35.3,0.1,63.9,28.7,64,64c-0.1,35.3-28.7,63.9-64,64c-35.3-0.1-63.9-28.7-64-64c0.1-35.3,28.7-63.9,64-64V64V42.7c-58.9,0-106.7,47.7-106.7,106.7C85.3,208.3,133.1,256,192,256c58.9,0,106.7-47.7,106.7-106.7c0-58.9-47.7-106.7-106.7-106.7V64z"/><path d="M512,448v-42.7c0-48.6-32.9-91.1-80-103.2c-11.4-2.9-23,3.9-26,15.3c-2.9,11.4,3.9,23,15.3,26c28.2,7.3,48,32.8,48,61.9V448c0,11.8,9.6,21.3,21.3,21.3S512,459.8,512,448z"/><path d="M336,87.4c28.9,7.4,48.1,33.5,48.1,61.9c0,5.2-0.6,10.6-2,15.9c-5.8,22.6-23.5,40.3-46.1,46.1c-11.4,2.9-18.3,14.5-15.4,26c2.9,11.4,14.5,18.3,26,15.4c37.7-9.7,67.2-39.1,76.9-76.9c2.3-8.8,3.4-17.7,3.4-26.5c0-47.6-32-90.9-80.2-103.3c-11.4-2.9-23,4-26,15.4C317.7,72.9,324.6,84.5,336,87.4L336,87.4z"/></g></svg>
      
          <p>Nenhum pedido pendente</p>
        </div>`;
      return;
    }

    listEl.innerHTML = "";

    const pedidos = await Promise.all(
      snap.docs.map(async d => {
        const data   = d.data();
        const user   = await fetchUserData(data.from);
        return { reqId: d.id, fromUid: data.from, ...user };
      })
    );

    for (const p of pedidos) {
      const row = document.createElement("div");
      row.className = "fr-row";
      row.innerHTML = `
        <img class="fr-avatar" src="${p.userphoto || DEFAULT_AVATAR}"
             onerror="this.src='${DEFAULT_AVATAR}'" alt="${p.username}">
        <div class="fr-info">
          <span class="fr-username">${p.username}</span>
          <span class="fr-sub">quer ser seu amigo</span>
        </div>
        <div class="fr-actions">
          <button class="fr-btn fr-accept" title="Aceitar"><i class="fas fa-check"></i></button>
          <button class="fr-btn fr-decline" title="Recusar"><i class="fas fa-times"></i></button>
        </div>`;

      row.querySelector(".fr-accept").addEventListener("click", async () => {
        row.querySelectorAll(".fr-btn").forEach(b => b.disabled = true);
        await aceitarAmizade(p.fromUid, meUid);
        row.classList.add("fr-row-done");
        row.addEventListener("transitionend", () => {
          row.remove();
          if (!listEl.querySelector(".fr-row")) {
            listEl.innerHTML = `<div class="fr-empty"><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><path d="M384,448v-42.7c0-58.9-47.7-106.7-106.7-106.7H106.7C47.7,298.7,0,346.4,0,405.3V448c0,11.8,9.6,21.3,21.3,21.3c11.8,0,21.3-9.6,21.3-21.3v-42.7c0.1-35.3,28.7-63.9,64-64l170.7,0c35.3,0.1,63.9,28.7,64,64V448c0,11.8,9.6,21.3,21.3,21.3S384,459.8,384,448z"/><path d="M192,64v21.3c35.3,0.1,63.9,28.7,64,64c-0.1,35.3-28.7,63.9-64,64c-35.3-0.1-63.9-28.7-64-64c0.1-35.3,28.7-63.9,64-64V64V42.7c-58.9,0-106.7,47.7-106.7,106.7C85.3,208.3,133.1,256,192,256c58.9,0,106.7-47.7,106.7-106.7c0-58.9-47.7-106.7-106.7-106.7V64z"/><path d="M512,448v-42.7c0-48.6-32.9-91.1-80-103.2c-11.4-2.9-23,3.9-26,15.3c-2.9,11.4,3.9,23,15.3,26c28.2,7.3,48,32.8,48,61.9V448c0,11.8,9.6,21.3,21.3,21.3S512,459.8,512,448z"/><path d="M336,87.4c28.9,7.4,48.1,33.5,48.1,61.9c0,5.2-0.6,10.6-2,15.9c-5.8,22.6-23.5,40.3-46.1,46.1c-11.4,2.9-18.3,14.5-15.4,26c2.9,11.4,14.5,18.3,26,15.4c37.7-9.7,67.2-39.1,76.9-76.9c2.3-8.8,3.4-17.7,3.4-26.5c0-47.6-32-90.9-80.2-103.3c-11.4-2.9-23,4-26,15.4C317.7,72.9,324.6,84.5,336,87.4L336,87.4z"/></g></svg>
      <p>Nenhum pedido pendente</p></div>`;
          }
        }, { once: true });
      });

      row.querySelector(".fr-decline").addEventListener("click", async () => {
        row.querySelectorAll(".fr-btn").forEach(b => b.disabled = true);
        await recusarAmizade(p.fromUid, meUid);
        row.classList.add("fr-row-done");
        row.addEventListener("transitionend", () => {
          row.remove();
          if (!listEl.querySelector(".fr-row")) {
            listEl.innerHTML = `<div class="fr-empty"><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 512 512" style="enable-background:new 0 0 512 512;" xml:space="preserve"><g><path d="M384,448v-42.7c0-58.9-47.7-106.7-106.7-106.7H106.7C47.7,298.7,0,346.4,0,405.3V448c0,11.8,9.6,21.3,21.3,21.3c11.8,0,21.3-9.6,21.3-21.3v-42.7c0.1-35.3,28.7-63.9,64-64l170.7,0c35.3,0.1,63.9,28.7,64,64V448c0,11.8,9.6,21.3,21.3,21.3S384,459.8,384,448z"/><path d="M192,64v21.3c35.3,0.1,63.9,28.7,64,64c-0.1,35.3-28.7,63.9-64,64c-35.3-0.1-63.9-28.7-64-64c0.1-35.3,28.7-63.9,64-64V64V42.7c-58.9,0-106.7,47.7-106.7,106.7C85.3,208.3,133.1,256,192,256c58.9,0,106.7-47.7,106.7-106.7c0-58.9-47.7-106.7-106.7-106.7V64z"/><path d="M512,448v-42.7c0-48.6-32.9-91.1-80-103.2c-11.4-2.9-23,3.9-26,15.3c-2.9,11.4,3.9,23,15.3,26c28.2,7.3,48,32.8,48,61.9V448c0,11.8,9.6,21.3,21.3,21.3S512,459.8,512,448z"/><path d="M336,87.4c28.9,7.4,48.1,33.5,48.1,61.9c0,5.2-0.6,10.6-2,15.9c-5.8,22.6-23.5,40.3-46.1,46.1c-11.4,2.9-18.3,14.5-15.4,26c2.9,11.4,14.5,18.3,26,15.4c37.7-9.7,67.2-39.1,76.9-76.9c2.3-8.8,3.4-17.7,3.4-26.5c0-47.6-32-90.9-80.2-103.3c-11.4-2.9-23,4-26,15.4C317.7,72.9,324.6,84.5,336,87.4L336,87.4z"/></g></svg>
      <p>Nenhum pedido pendente</p></div>`;
          }
        }, { once: true });
      });

      listEl.appendChild(row);
    }
  } catch (e) {
    console.error("carregarPedidos:", e);
    listEl.innerHTML = `<div class="fr-empty"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar pedidos.</p></div>`;
  }
}

// ─────────────────────────────────────────────────────────
// BADGE — conta pedidos pendentes
// ─────────────────────────────────────────────────────────
async function atualizarBadgePedidos(meUid) {
  const badge = document.getElementById("fr-badge");
  if (!badge) return;
  try {
    const snap = await getDocs(
      query(collection(db, "friendRequests"), where("to", "==", meUid), where("status", "==", "pending"))
    );
    const count = snap.size;
    badge.textContent  = count > 9 ? "9+" : String(count);
    badge.style.display = count > 0 ? "flex" : "none";
  } catch { badge.style.display = "none"; }
}

const DEFAULT_AVATAR = "../public/img/default.jpg";

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

  if (nt.type === "friend_request") {
    contentArea.innerHTML = `
      <p><span class="nt-username">${nt.username}</span> ${resolveMessage(nt)} <span class="nt-time">${formatTime(nt.createdAt)}</span></p>
      <div class="nt-fr-actions">
        <button class="nt-fr-btn nt-fr-accept">Aceitar</button>
        <button class="nt-fr-btn nt-fr-decline">✕</button>
      </div>`;

    const acceptBtn  = contentArea.querySelector(".nt-fr-accept");
    const declineBtn = contentArea.querySelector(".nt-fr-decline");

    const dismiss = () => {
      wrapper.classList.add("nt-removing");
      wrapper.addEventListener("animationend", async () => {
        try { await updateDoc(doc(db, "notifications", nt.id), { visible: false }); } catch {}
        wrapper.remove();
        document.querySelectorAll(".nt-container").forEach(c => {
          if (!c.querySelector(".nt-swipe-wrapper")) c.remove();
        });
        checkEmptyAfterDelete();
      }, { once: true });
    };

    acceptBtn.addEventListener("click", async () => {
      acceptBtn.disabled = true; declineBtn.disabled = true;
      acceptBtn.textContent = "...";
      try { await aceitarAmizade(nt.fromUid, uid); } catch (e) { console.error(e); }
      dismiss();
      atualizarBadgePedidos(uid);
    });

    declineBtn.addEventListener("click", async () => {
      acceptBtn.disabled = true; declineBtn.disabled = true;
      try { await recusarAmizade(nt.fromUid, uid); } catch (e) { console.error(e); }
      dismiss();
      atualizarBadgePedidos(uid);
    });

  } else {
    contentArea.innerHTML = `<p><span class="nt-username">${nt.username}</span> ${resolveMessage(nt)} <span class="nt-time">${formatTime(nt.createdAt)}</span></p>`;
  }

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
    atualizarBadgePedidos(user.uid);

    const frBtn = document.getElementById("fr-btn");
    if (frBtn) frBtn.addEventListener("click", () => abrirOverlayPedidos(user.uid));
  } else {
    renderEmpty();
  }
});