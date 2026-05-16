import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, query, where,
  getDocs, getDoc, doc, onSnapshot, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey:            "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain:        "ifriendmatch.firebaseapp.com",
  projectId:         "ifriendmatch",
  storageBucket:     "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId:             "1:306331636603:web:c0ae0bd22501803995e3de",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);


const DEFAULT_PHOTO  = "./public/img/default.jpg";
const DIRECT_URL     = "direct.html";
const POPUP_DURATION = 5000;  
const SESSION_KEY    = "chatNotify_seenOnLoad";


(function injectStyles() {
  if (document.getElementById("__chatNotifyStyles")) return;
  const style = document.createElement("style");
  style.id = "__chatNotifyStyles";
  style.textContent = `
    /* ── Container de popups ── */
    #__chatNotifyStack {
      position: fixed;
      top: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      width: min(92vw, 380px);
      pointer-events: none;
    }

    /* ── Card individual ── */
    .cn-popup {
      width: 100%;
      pointer-events: all;
      background: rgba(24, 24, 27, 0.82);
      backdrop-filter: blur(18px) saturate(160%);
      -webkit-backdrop-filter: blur(18px) saturate(160%);
      border-radius: 18px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      cursor: pointer;
      box-shadow:
        0 4px 24px rgba(0,0,0,0.45),
        0 1px 0 rgba(255,255,255,0.06) inset;
      animation: cn-slideIn 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      position: relative;
      overflow: hidden;
    }

    .cn-popup::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent);
    }

    .cn-popup.cn-leaving {
      animation: cn-slideOut 0.28s cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    /* ── Foto de perfil ── */
    .cn-avatar {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      background: #333;
    }

    /* ── Badge de não lidas (resumo inicial) ── */
    .cn-badge {
      position: absolute;
      top: -2px;
      left: 40px;
      background: #ef4444;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      min-width: 18px;
      height: 18px;
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
    }

    /* ── Textos ── */
    .cn-body {
      flex: 1;
      min-width: 0;
    }
    .cn-name {
      font-family: -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.3;
    }
    .cn-msg {
      font-family: -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif;
      font-size: 13px;
      color: rgba(255,255,255,0.60);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
      line-height: 1.4;
    }
    .cn-label {
      font-family: -apple-system, 'SF Pro Text', 'Segoe UI', sans-serif;
      font-size: 11px;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 1px;
    }

    /* ── Ícone de seta ── */
    .cn-arrow {
      color: rgba(255,255,255,0.25);
      flex-shrink: 0;
      font-size: 16px;
    }

    /* ── Barra de progresso ── */
    .cn-progress {
      position: absolute;
      bottom: 0; left: 0;
      height: 2px;
      background: rgba(255,255,255,0.20);
      border-radius: 0 0 18px 18px;
      animation: cn-drain var(--cn-duration, 5000ms) linear forwards;
      display; none;
    }

    /* ── Animações ── */
    @keyframes cn-slideIn {
      from { opacity: 0; transform: translateY(-20px) scale(0.94); }
      to   { opacity: 1; transform: translateY(0)     scale(1);    }
    }
    @keyframes cn-slideOut {
      from { opacity: 1; transform: translateY(0) scale(1);     max-height: 80px; }
      to   { opacity: 0; transform: translateY(-14px) scale(0.93); max-height: 0;   }
    }
    @keyframes cn-drain {
      from { width: 100%; }
      to   { width: 0%;   }
    }
  `;
  document.head.appendChild(style);
})();

function getStack() {
  let s = document.getElementById("__chatNotifyStack");
  if (!s) {
    s = document.createElement("div");
    s.id = "__chatNotifyStack";
    document.body.appendChild(s);
  }
  return s;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatMsg(content) {
  if (!content) return "";
  if (content.startsWith("__img__")) return "Foto";
  if (content.startsWith("__gif__")) return "GIF";
  return content.length > 50 ? content.slice(0, 50) + "…" : content;
}

function showPopup({ photo, name, message, unreadCount, senderId, duration = POPUP_DURATION }) {
  const stack = getStack();

  const card = document.createElement("div");
  card.className = "cn-popup";
  card.style.setProperty("--cn-duration", `${duration}ms`);

  card.innerHTML = `
    <div style="position:relative;flex-shrink:0">
      <img class="cn-avatar" src="${esc(photo)}" alt=""
           onerror="this.src='${DEFAULT_PHOTO}'">
      ${unreadCount > 1 ? `<span class="cn-badge">${unreadCount}</span>` : ""}
    </div>
    <div class="cn-body">
      ${unreadCount > 1
        ? `<div class="cn-label">Mensagens não lidas</div>`
        : ""}
      <div class="cn-name">${esc(name)}</div>
      <div class="cn-msg">${esc(message)}</div>
    </div>
    <span class="cn-arrow">›</span>
    <div class="cn-progress"></div>
  `;

  card.addEventListener("click", () => {
    const url = senderId
      ? `${DIRECT_URL}?u=${encodeURIComponent(senderId)}`
      : DIRECT_URL;
    window.location.href = url;
  });

  let timer;
  const startTimer = () => {
    timer = setTimeout(() => dismissPopup(card), duration);
  };
  card.addEventListener("mouseenter", () => clearTimeout(timer));
  card.addEventListener("mouseleave", () => startTimer());

  stack.appendChild(card);
  startTimer();
}

function dismissPopup(card) {
  if (!card.isConnected) return;
  card.classList.add("cn-leaving");
  card.addEventListener("animationend", () => card.remove(), { once: true });
}

async function getUserData(uid) {
  try {
    const [mediaSnap, userSnap] = await Promise.all([
      getDoc(doc(db, "users", uid, "user-infos", "user-media")),
      getDoc(doc(db, "users", uid)),
    ]);
    const photo = mediaSnap.exists()
      ? (mediaSnap.data().userphoto || DEFAULT_PHOTO)
      : DEFAULT_PHOTO;
    const name = userSnap.exists()
      ? (userSnap.data().displayname || userSnap.data().username || uid)
      : uid;
    return { photo, name };
  } catch (_) {
    return { photo: DEFAULT_PHOTO, name: uid };
  }
}


async function checkUnreadOnLoad(myUid) {
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, "1");

  try {
    const chatsSnap = await getDocs(
      query(collection(db, "chats"), where("participants", "array-contains", myUid))
    );

    const unreadBySender = new Map();

    for (const chatDoc of chatsSnap.docs) {
      const cd = chatDoc.data();
      if (cd.lastMessageSender && cd.lastMessageSender !== myUid && !cd.lastMessageRead) {
        const sid = cd.lastMessageSender;
        const prev = unreadBySender.get(sid) || { count: 0, lastMsg: "" };
        try {
          const msgsSnap = await getDocs(
            query(
              collection(db, "chats", chatDoc.id, "messages"),
              where("read", "==", false),
              where("sender", "!=", myUid),
              orderBy("sender"),
              orderBy("timestamp", "desc"),
              limit(50)
            )
          );
          const count = msgsSnap.size;
          const lastContent = msgsSnap.docs[0]?.data()?.content || cd.lastMessage || "";
          unreadBySender.set(sid, {
            count: prev.count + count,
            lastMsg: prev.count === 0 ? lastContent : prev.lastMsg,
          });
        } catch (_) {
          unreadBySender.set(sid, {
            count: prev.count + 1,
            lastMsg: cd.lastMessage || "",
          });
        }
      }
    }

    if (unreadBySender.size === 0) return;
    let i = 0;
    for (const [senderId, { count, lastMsg }] of unreadBySender) {
      if (i >= 3) break;
      const delay = i * 300;
      setTimeout(async () => {
        const { photo, name } = await getUserData(senderId);
        showPopup({
          photo,
          name,
          message: count > 1
            ? `${count} mensagens não lidas`
            : formatMsg(lastMsg),
          unreadCount: count,
          senderId,
          duration: 7000,
        });
      }, delay);
      i++;
    }
  } catch (err) {
    console.warn("[chat-notify] checkUnreadOnLoad:", err.message);
  }
}

let realtimeUnsub = null;
let knownChats    = new Map();
let initialized   = false;

async function startRealtimeListener(myUid) {
  if (realtimeUnsub) realtimeUnsub();
  const initSnap = await getDocs(
    query(collection(db, "chats"), where("participants", "array-contains", myUid))
  );
  initSnap.forEach(d => {
    const ts = d.data().lastMessageTime;
    const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : 0);
    knownChats.set(d.id, ms);
  });
  initialized = true;

  realtimeUnsub = onSnapshot(
    query(collection(db, "chats"), where("participants", "array-contains", myUid)),
    async (snap) => {
      if (!initialized) return;

      for (const change of snap.docChanges()) {
        if (change.type !== "added" && change.type !== "modified") continue;

        const cd     = change.doc.data();
        const chatId = change.doc.id;

        if (!cd.lastMessageSender || cd.lastMessageSender === myUid) continue;
        if (cd.lastMessageRead) continue;

        const ts = cd.lastMessageTime;
        const ms = ts?.toMillis?.() ?? (ts?.seconds ? ts.seconds * 1000 : 0);
        const prev = knownChats.get(chatId) ?? 0;

        if (ms <= prev) continue;

        knownChats.set(chatId, ms);

        const senderId = cd.lastMessageSender;
        const { photo, name } = await getUserData(senderId);
        showPopup({
          photo,
          name,
          message: formatMsg(cd.lastMessage),
          unreadCount: 1,
          senderId,
          duration: POPUP_DURATION,
        });
      }
    },
    (err) => console.warn("[chat-notify] listener:", err.message)
  );
}

onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const myUid = user.uid;
  checkUnreadOnLoad(myUid);
  startRealtimeListener(myUid);
});