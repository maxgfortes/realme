import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, query, where, orderBy,
  getDocs, getDoc, doc, setDoc, updateDoc,
  serverTimestamp, onSnapshot, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

// ── API keys ───────────────────────────────────────────────────────────────────
const GIPHY_API_KEY = "GlVGYHkr3WSBnllca54iNt0yFbjz7L59";
const IMGBB_API_KEY = "fc8497dcdf559dc9cbff97378c82344c";

// ── Sons ───────────────────────────────────────────────────────────────────────
const audioSend    = new Audio('./src/audio/msg send.mp3');
const audioReceive = new Audio('./src/audio/msg recive.mp3');

// ── DOM refs ───────────────────────────────────────────────────────────────────
const dmContainer    = document.querySelector('.dm-container');
const dmUsersList    = document.getElementById("dmUsersList");
const dmChatArea     = document.getElementById("dmChatArea");
const dmChatHeader   = document.getElementById("dmChatHeader");
const dmChatUserImg  = document.getElementById("dmChatUserImg");
const dmChatUserName = document.getElementById("dmChatUserName");
const dmMessages     = document.getElementById("dmMessages");
const dmMsgInput     = document.getElementById("dmMsgInput");
const dmSendBtn      = document.getElementById("dmSendBtn");
const dmBackBtn      = document.getElementById("dmBackBtn");
const dmNavbar       = document.getElementById('dmNavbar');
const navbarbottom   = document.querySelector(".navbar-bottom");
const dmListBackBtn  = document.getElementById('dmListBackBtn');
const dmTitle        = document.getElementById('dmTitle');
const dmSearchInput  = document.getElementById('dmSearchInput');
const dmSearchBtn    = document.getElementById('dmSearchBtn');
const imgDmBtn       = document.getElementById('img-dm');

// ── Estado global ──────────────────────────────────────────────────────────────
let loggedUser          = null;
let selectedUser        = null;
let unsubscribeMessages = null;
let allChats            = [];
let chatsArray          = [];
let ultimaQtdMensagens  = 0;
let replyingTo          = null;
let selectedChatId      = null;

// ── Cache de memória com persistência em localStorage ──────────────────────────
// TTLs agressivos: conversas = 2 min, usuários = 10 min, mensagens = 5 min
const CACHE_TTL = { conversas: 120_000, users: 600_000, msgs: 300_000 };

const memCache = {
  photos: new Map(),
  names:  new Map(),
  msgs:   new Map(), // chatId → { data, ts }

  setPhoto(uid, url) {
    this.photos.set(uid, url);
    try { localStorage.setItem(`up_${uid}`, url); } catch (_) {}
  },
  getPhoto(uid) {
    if (this.photos.has(uid)) return this.photos.get(uid);
    const c = localStorage.getItem(`up_${uid}`);
    if (c) { this.photos.set(uid, c); return c; }
    return null;
  },

  setName(uid, name) {
    this.names.set(uid, name);
    try { localStorage.setItem(`un_${uid}`, name); } catch (_) {}
  },
  getName(uid) {
    if (this.names.has(uid)) return this.names.get(uid);
    const c = localStorage.getItem(`un_${uid}`);
    if (c) { this.names.set(uid, c); return c; }
    return null;
  },

  setMsgs(chatId, arr) {
    this.msgs.set(chatId, { data: arr, ts: Date.now() });
    try { localStorage.setItem(`cm_${chatId}`, JSON.stringify({ data: arr, ts: Date.now() })); } catch (_) {}
  },
  getMsgs(chatId) {
    const m = this.msgs.get(chatId);
    if (m && Date.now() - m.ts < CACHE_TTL.msgs) return m.data;
    try {
      const raw = localStorage.getItem(`cm_${chatId}`);
      if (raw) {
        const p = JSON.parse(raw);
        if (Date.now() - p.ts < CACHE_TTL.msgs) { this.msgs.set(chatId, p); return p.data; }
      }
    } catch (_) {}
    return null;
  }
};

// ── Cache de conversas ─────────────────────────────────────────────────────────
const conversasCache = {
  data: null, ts: 0,
  set(d)  {
    this.data = d; this.ts = Date.now();
    try { localStorage.setItem('cc', JSON.stringify({ data: d, ts: this.ts })); } catch (_) {}
  },
  get()   {
    if (this.data && Date.now() - this.ts < CACHE_TTL.conversas) return this.data;
    try {
      const raw = localStorage.getItem('cc');
      if (raw) {
        const p = JSON.parse(raw);
        if (Date.now() - p.ts < CACHE_TTL.conversas) { this.data = p.data; this.ts = p.ts; return this.data; }
      }
    } catch (_) {}
    return null;
  },
  clear() { this.data = null; this.ts = 0; try { localStorage.removeItem('cc'); } catch (_) {} }
};

// ── Utilitários ────────────────────────────────────────────────────────────────
function gerarChatId(u1, u2) { return `chat-${[u1, u2].sort().join("-")}`; }

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function truncarMensagem(msg, max) {
  if (!msg) return "";
  if (msg.startsWith("__img__")) return "📷 Foto";
  if (msg.startsWith("__gif__")) return "🎞️ GIF";
  return msg.length > max ? msg.slice(0, max) + "…" : msg;
}

function tempoRelativo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000), h = Math.floor(diff / 3_600_000), d = Math.floor(diff / 86_400_000);
  if (d > 0) return `${d}d`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}m`;
  return "agora";
}

function formatarTempoRelativo(date) {
  const diff = Date.now() - date;
  const m = Math.floor(diff / 60_000), h = Math.floor(diff / 3_600_000), d = Math.floor(diff / 86_400_000);
  if (diff < 60_000) return "agora";
  if (m < 60)        return `há ${m} min`;
  if (h < 24)        return `há ${h}h`;
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

function renderizarTexto(texto) {
  let t = escapeHtml(texto);
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;
  t = t.replace(urlRegex, url => `<a class="dm-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/_(.+?)_/g,       '<em>$1</em>');
  return t;
}

// ── Foto de perfil da navbar ───────────────────────────────────────────────────
function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic');
  const cached = localStorage.getItem('user_photo_cache');
  if (cached && navPic) navPic.src = cached; // instantâneo do cache

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const s = await getDoc(doc(db, `users/${user.uid}/user-infos/user-media`));
      if (s.exists()) {
        const url = s.data().userphoto || './public/img/default.jpg';
        if (navPic) navPic.src = url;
        localStorage.setItem('user_photo_cache', url);
      }
    } catch (_) {}
  });
}
document.addEventListener('DOMContentLoaded', carregarFotoPerfil);

// ── Buscar dados de usuário (lazy, não bloqueia render) ────────────────────────
function buscarDadosUsuarioLazy(userId) {
  // Retorna imediatamente do cache, fetch em background
  const photoUrl    = memCache.getPhoto(userId) || "./public/img/default.jpg";
  const displayName = memCache.getName(userId)  || userId;

  // Background: atualiza sem esperar
  Promise.all([
    getDoc(doc(db, "users", userId, "user-infos", "user-media"))
      .then(s => { if (s.exists() && s.data().userphoto) memCache.setPhoto(userId, s.data().userphoto); })
      .catch(() => {}),
    getDoc(doc(db, "users", userId))
      .then(s => {
        if (s.exists()) {
          const d = s.data();
          memCache.setName(userId, d.displayname || d.username || userId);
        }
      }).catch(() => {})
  ]).then(() => {
    // Atualiza botões na lista que ainda estejam visíveis
    const btn = dmUsersList.querySelector(`.dm-user-btn[data-friendid="${userId}"]`);
    if (btn) {
      const newPhoto = memCache.getPhoto(userId) || "./public/img/default.jpg";
      const newName  = memCache.getName(userId)  || userId;
      const img = btn.querySelector("img");
      const nameEl = btn.querySelector(".dm-user-name");
      if (img && img.src !== newPhoto) img.src = newPhoto;
      if (nameEl && nameEl.textContent !== newName) nameEl.textContent = newName;
    }
  });

  return { photoUrl, displayName };
}

// ── Skeletons de loading instantâneo ──────────────────────────────────────────
function mostrarSkeletons(count = 5) {
  dmUsersList.querySelectorAll(".dm-user-btn, .dm-skeleton, .dm-empty-state").forEach(e => e.remove());
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const sk = document.createElement("div");
    sk.className = "dm-skeleton";
    sk.innerHTML = `
      <div class="sk-avatar"></div>
      <div class="sk-lines">
        <div class="sk-line sk-name"></div>
        <div class="sk-line sk-msg"></div>
      </div>
    `;
    frag.appendChild(sk);
  }
  dmUsersList.appendChild(frag);
}

// ── Estado vazio ───────────────────────────────────────────────────────────────
function mostrarEstadoVazio() {
  const empty = document.createElement("div");
  empty.className = "dm-empty-state";
  empty.innerHTML = `
  <div class="dm-empty-icon"><svg aria-label="Mensagens" fill="currentColor" height="24" role="img" viewBox="0 0 24 24" width="24"><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path><line fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" x1="7.488" x2="15.515" y1="12.208" y2="7.641"></line></svg></div>
    <p class="dm-empty-title">Você não tem nenhuma conversa</p>
    <p class="dm-empty-subtitle">Vá até algum perfil para mandar a primeira mensagem</p>
  `;
  dmUsersList.appendChild(empty);
}

// ── Renderizar conversas ───────────────────────────────────────────────────────
function renderizarConversas(arr, filtrarTermo = "") {
  dmUsersList.querySelectorAll(".dm-user-btn, .dm-skeleton, .dm-empty-state").forEach(e => e.remove());

  const unicos = new Set();
  const frag   = document.createDocumentFragment();

  for (const chatObj of arr) {
    const fid = chatObj.friendId;
    if (unicos.has(fid)) continue;
    unicos.add(fid);

    const photo = memCache.getPhoto(fid) || "./public/img/default.jpg";
    const nome  = memCache.getName(fid)  || fid;

    if (filtrarTermo && !nome.toLowerCase().includes(filtrarTermo.toLowerCase())) continue;

    const isUnread    = chatObj.lastMessageSender !== loggedUser && !chatObj.lastMessageRead;
    const lastSnippet = truncarMensagem(chatObj.lastMessage, 28);
    const timeStr     = tempoRelativo(chatObj.lastMessageTime);

    const btn = document.createElement("button");
    btn.className = "dm-user-btn";
    btn.dataset.friendid = fid;
    btn.innerHTML = `
      <img src="${photo}" alt="" loading="lazy" onerror="this.src='./public/img/default.jpg'">
      <div class="dm-user-info">
        <div class="dm-user-row">
          <span class="dm-user-name${isUnread ? ' unread-name' : ''}">${escapeHtml(nome)}</span>
          <span class="dm-user-time">${timeStr}</span>
        </div>
        <span class="dm-user-last${isUnread ? ' unread-msg' : ''}">${escapeHtml(lastSnippet)}</span>
      </div>
      ${isUnread ? '<span class="dm-unread-dot"></span>' : ''}
    `;
    btn.addEventListener("click", () => selecionarUsuario(fid, photo, nome));
    frag.appendChild(btn);
  }

  dmUsersList.appendChild(frag);

  // Estado vazio
  if (unicos.size === 0) mostrarEstadoVazio();
}

// ── Carregar conversas — cache imediato + fetch em bg ─────────────────────────
async function carregarConversas(filtrarTermo = "") {
  if (!loggedUser) return;

  // 1) Renderiza do cache instantaneamente
  const cached = conversasCache.get();
  if (cached && cached.length > 0) {
    chatsArray = cached;
    allChats   = cached;
    renderizarConversas(cached, filtrarTermo);
  } else {
    mostrarSkeletons(6);
  }

  // 2) Fetch em background sem bloquear
  try {
    const q    = query(collection(db, "chats"), where("participants", "array-contains", loggedUser));
    const snap = await getDocs(q);

    const novos   = [];
    const fetchBg = [];

    for (const chatDoc of snap.docs) {
      const cd       = chatDoc.data();
      const friendId = cd.participants?.find(p => p !== loggedUser);
      if (!friendId) continue;

      novos.push({
        chatId: chatDoc.id,
        friendId,
        lastMessageTime: cd.lastMessageTime
          ? (cd.lastMessageTime.toMillis ? cd.lastMessageTime.toMillis() : cd.lastMessageTime.seconds * 1000)
          : 0,
        lastMessage:       cd.lastMessage       || "",
        lastMessageSender: cd.lastMessageSender || "",
        lastMessageRead:   cd.lastMessageRead   ?? true,
      });

      if (!memCache.getName(friendId) || !memCache.getPhoto(friendId)) {
        fetchBg.push(buscarDadosUsuarioLazy(friendId));
      }
    }

    novos.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    chatsArray = novos;
    allChats   = novos;
    conversasCache.set(novos);

    await Promise.all(fetchBg);
    renderizarConversas(novos, filtrarTermo); // se vazio, mostra estado vazio
  } catch (err) {
    console.error("Erro ao carregar conversas:", err);
    renderizarConversas([], filtrarTermo); // erro também cai no estado vazio
  }
}

// ── Busca ──────────────────────────────────────────────────────────────────────
dmSearchInput.addEventListener("input",  () => renderizarConversas(chatsArray, dmSearchInput.value.trim()));
dmSearchBtn.addEventListener("click",   () => renderizarConversas(chatsArray, dmSearchInput.value.trim()));

// ── Selecionar usuário ─────────────────────────────────────────────────────────
function selecionarUsuario(userId, photoUrl, displayName) {
  selectedUser   = userId;
  selectedChatId = gerarChatId(loggedUser, userId);

  document.querySelectorAll(".dm-user-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.dm-user-btn[data-friendid="${userId}"]`);
  if (btn) btn.classList.add("active");

  dmChatUserImg.src        = photoUrl;
  dmChatUserName.textContent = displayName;
  dmChatUserName.setAttribute("data-userid", userId);

  cancelarReply();
  carregarMensagensTempoReal();

  dmContainer.classList.add('show-chat');
  dmNavbar.style.display     = "none";
  dmChatHeader.style.display = "flex";
  if (navbarbottom) navbarbottom.style.display = "none";
}

dmBackBtn.addEventListener('click', () => {
  dmContainer.classList.remove('show-chat');
  selectedUser   = null;
  selectedChatId = null;
  dmMessages.innerHTML = `<div class="dm-no-chat">Selecione uma conversa para começar</div>`;
  document.querySelectorAll(".dm-user-btn").forEach(b => b.classList.remove("active"));
  dmNavbar.style.display     = "";
  dmChatHeader.style.display = "none";
  if (navbarbottom) navbarbottom.style.display = "";
  cancelarReply();
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
});

dmListBackBtn.addEventListener('click', () => window.history.back());

dmChatUserName.addEventListener("click", () => {
  const uid = dmChatUserName.getAttribute("data-userid");
  if (uid) window.location.href = `profile.html?uid=${uid}`;
});

// ── Marcar mensagens como lidas ────────────────────────────────────────────────
async function marcarMensagensComoLidas(chatId, mensagens) {
  const promises = mensagens
    .filter(m => m.sender !== loggedUser && !m.read)
    .map(m => updateDoc(doc(db, "chats", chatId, "messages", m.id), { read: true }).catch(() => {}));
  if (promises.length) {
    await Promise.all(promises);
    updateDoc(doc(db, "chats", chatId), { lastMessageRead: true }).catch(() => {});
  }
}

// ── Mensagens em tempo real — mostra cache antes do snapshot ──────────────────
function carregarMensagensTempoReal() {
  if (unsubscribeMessages) unsubscribeMessages();
  const chatId = gerarChatId(loggedUser, selectedUser);

  // Mostra cache instantaneamente enquanto snapshot não chega
  const cachedMsgs = memCache.getMsgs(chatId);
  if (cachedMsgs && cachedMsgs.length > 0) {
    renderizarMensagens(cachedMsgs);
  } else {
    dmMessages.innerHTML = "";
    mostrarSkeletonMensagens();
  }

  const q = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));

  unsubscribeMessages = onSnapshot(q, async (snapshot) => {
    const msgs = [];
    snapshot.forEach(d => { const m = d.data(); m.id = d.id; msgs.push(m); });

    marcarMensagensComoLidas(chatId, msgs);

    if (msgs.length > ultimaQtdMensagens && msgs.length > 0 &&
        msgs[msgs.length - 1].sender !== loggedUser) {
      audioReceive.currentTime = 0;
      audioReceive.play().catch(() => {});
    }
    ultimaQtdMensagens = msgs.length;
    memCache.setMsgs(chatId, msgs);
    renderizarMensagens(msgs);
  });
}

function mostrarSkeletonMensagens() {
  const frag = document.createDocumentFragment();
  const lados = ["deles", "meu", "deles", "deles", "meu", "deles"];
  for (const lado of lados) {
    const d = document.createElement("div");
    d.className = `dm-msg-bloco ${lado === "meu" ? "meu-bloco" : "deles-bloco"}`;
    d.innerHTML = `<div class="sk-bubble ${lado === "meu" ? "sk-bubble-meu" : ""}"></div>`;
    frag.appendChild(d);
  }
  dmMessages.appendChild(frag);
}

// ── Formatar label do separador de tempo ──────────────────────────────────────
function formatarLabelSeparador(date) {
  const agora   = new Date();
  const hoje    = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const ontem   = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  const dataMsg = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const hhmm = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (dataMsg.getTime() === hoje.getTime())    return `hoje às ${hhmm}`;
  if (dataMsg.getTime() === ontem.getTime())   return `ontem às ${hhmm}`;

  const diffDias = Math.floor((hoje - dataMsg) / 86_400_000);
  if (diffDias < 7) {
    const dia = date.toLocaleDateString("pt-BR", { weekday: "long" });
    return `${dia} às ${hhmm}`;
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) + ` às ${hhmm}`;
}

function criarSeparadorTempo(label) {
  const sep = document.createElement("div");
  sep.className = "dm-time-separator";
  sep.innerHTML = `<span>${label}</span>`;
  return sep;
}

// ── Renderizar mensagens ───────────────────────────────────────────────────────
function renderizarMensagens(mensagens) {
  const frag     = document.createDocumentFragment();
  let lastSender = null;
  let bloco      = null;

  const visiveis = mensagens.filter(m => m.type !== "deleted");

  let lastUserMsgIdx = -1;
  for (let i = visiveis.length - 1; i >= 0; i--) {
    if (visiveis[i].sender === loggedUser) { lastUserMsgIdx = i; break; }
  }

  const GAP_SEPARADOR_MS = 4 * 60 * 60 * 1000; // 4 horas
  let lastMsgDate = null;

  visiveis.forEach((m, idx) => {
    const isSender = m.sender === loggedUser;

    // ── Separadores de tempo ────────────────────────────────────────────────
    const tsRaw  = m.timestamp
      ? (m.timestamp.toDate ? m.timestamp.toDate() : new Date(m.timestamp.seconds * 1000))
      : null;

    if (tsRaw) {
      const msgDay = new Date(tsRaw.getFullYear(), tsRaw.getMonth(), tsRaw.getDate()).getTime();

      if (!lastMsgDate) {
        // Primeira mensagem: sempre mostra separador
        frag.appendChild(criarSeparadorTempo(formatarLabelSeparador(tsRaw)));
      } else {
        const lastDay = new Date(lastMsgDate.getFullYear(), lastMsgDate.getMonth(), lastMsgDate.getDate()).getTime();
        const gapMs   = tsRaw - lastMsgDate;

        if (msgDay !== lastDay) {
          // Mudou o dia
          frag.appendChild(criarSeparadorTempo(formatarLabelSeparador(tsRaw)));
          lastSender = null; // forçar novo bloco de bolhas após separador
        } else if (gapMs >= GAP_SEPARADOR_MS) {
          // Mesmo dia mas gap ≥ 4h
          frag.appendChild(criarSeparadorTempo(formatarLabelSeparador(tsRaw)));
          lastSender = null; // forçar novo bloco de bolhas após separador
        }
      }
      lastMsgDate = tsRaw;
    }
    // ────────────────────────────────────────────────────────────────────────

    if (m.sender !== lastSender) {
      bloco = document.createElement("div");
      bloco.className = "dm-msg-bloco " + (isSender ? "meu-bloco" : "deles-bloco");
      frag.appendChild(bloco);
    }

    const bubble = document.createElement("div");
    bubble.className = "dm-msg-bubble " + (isSender ? "meu" : "deles");
    bubble.dataset.msgid = m.id;

    // Reply preview
    if (m.replyTo) {
      const rp    = document.createElement("div");
      rp.className = "reply-preview";
      const rName = m.replyTo.senderName ||
        (m.replyTo.sender === loggedUser ? "Você" : memCache.getName(m.replyTo.sender) || "...");
      rp.innerHTML = `
        <span class="reply-author">${escapeHtml(rName)}</span>
        <span class="reply-text">${escapeHtml(truncarMensagem(m.replyTo.content, 40))}</span>
      `;
      bubble.appendChild(rp);
    }

    // Conteúdo
    if (m.type === "image") {
      const img = document.createElement("img");
      img.className = "dm-msg-image";
      img.src     = m.content;
      img.alt     = "imagem";
      img.loading = "lazy";
      img.addEventListener("click", () => abrirLightbox(m.content));
      bubble.appendChild(img);
    } else if (m.type === "gif") {
      const gif = document.createElement("img");
      gif.className = "dm-msg-gif";
      gif.src     = m.content;
      gif.alt     = "gif";
      gif.loading = "lazy";
      gif.addEventListener("click", () => abrirLightbox(m.content));
      bubble.appendChild(gif);
    } else {
      const p = document.createElement("p");
      p.innerHTML = renderizarTexto(m.content || "");
      bubble.appendChild(p);
    }

    // Reações
    if (m.reactions && Object.keys(m.reactions).length > 0) {
      const reacDiv  = document.createElement("div");
      reacDiv.className = "dm-reactions";
      const grouped  = {};
      Object.values(m.reactions).forEach(emoji => { grouped[emoji] = (grouped[emoji] || 0) + 1; });
      Object.entries(grouped).forEach(([emoji, count]) => {
        const span = document.createElement("span");
        span.className   = "dm-reaction-chip";
        span.textContent = `${emoji}${count > 1 ? ' ' + count : ''}`;
        reacDiv.appendChild(span);
      });
      bubble.appendChild(reacDiv);
    }

    bloco.appendChild(bubble);
    adicionarGestos(bubble, m, isSender);

    // Foto do outro na última bolha do bloco
    if (!isSender) {
      const next = visiveis[idx + 1];
      if (!next || next.sender === loggedUser) {
        const img2 = document.createElement("img");
        img2.className = "dm-msg-foto";
        img2.src = dmChatUserImg.src;
        bloco.appendChild(img2);
      }
    }

    // Footer na última mensagem enviada
    if (idx === lastUserMsgIdx) {
      const footer = document.createElement("div");
      footer.className = "dm-msg-footer";
      const ts    = m.timestamp
        ? (m.timestamp.toDate ? m.timestamp.toDate() : new Date(m.timestamp.seconds * 1000))
        : new Date();
      const visto = m.read
        ? `•<span class="dm-visto"> visto</span>`
        : `•<span class="dm-enviado"> enviado</span>`;
      footer.innerHTML = `<span>${formatarTempoRelativo(ts)}</span>${visto}`;
      bloco.appendChild(footer);
    }

    lastSender = m.sender;
  });

  dmMessages.innerHTML = "";
  dmMessages.appendChild(frag);
  scrollToBottomBouncy();
}

// ── Scroll suave estilo iMessage ───────────────────────────────────────────────
function scrollToBottomBouncy() {
  const el     = dmMessages;
  const target = el.scrollHeight - el.clientHeight;
  const start  = el.scrollTop;
  const diff   = target - start;
  if (Math.abs(diff) < 2) return;

  const duration  = 380;
  let   startTime = null;

  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function step(ts) {
    if (!startTime) startTime = ts;
    const elapsed  = ts - startTime;
    const progress = Math.min(elapsed / duration, 1);
    el.scrollTop   = start + diff * easeOutBack(progress);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Gestos: long-press + swipe para reply ─────────────────────────────────────
let contextTimeout = null;

function adicionarGestos(bubble, msg, isSender) {
  function abrirContexto(e) {
    e.preventDefault?.();
    fecharContextoAtivo();
    mostrarContextMenu(bubble, msg, isSender);
  }

  let swipeStartX = 0, swipeStartY = 0, swipeDelta = 0;
  let swipeActive = false, swipeTriggered = false;
  const SWIPE_THRESHOLD = 60;
  const SWIPE_DIR = isSender ? -1 : 1;

  bubble.addEventListener("touchstart", e => {
    swipeStartX    = e.touches[0].clientX;
    swipeStartY    = e.touches[0].clientY;
    swipeDelta     = 0;
    swipeActive    = true;
    swipeTriggered = false;
    bubble.style.transition = "";
    contextTimeout = setTimeout(() => { swipeActive = false; abrirContexto({}); }, 500);
  }, { passive: true });

  bubble.addEventListener("touchmove", e => {
    clearTimeout(contextTimeout);
    if (!swipeActive) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;
    if (Math.abs(dy) > Math.abs(dx) + 5) { swipeActive = false; return; }
    if (dx * SWIPE_DIR < 0) return;

    swipeDelta = dx * SWIPE_DIR;
    const move    = Math.min(swipeDelta, SWIPE_THRESHOLD + 20) * SWIPE_DIR * 0.45;
    const opacity = Math.min(swipeDelta / SWIPE_THRESHOLD, 1);
    bubble.style.transition = "none";
    bubble.style.transform  = `translateX(${move}px)`;

    let icon = bubble._replyIcon;
    if (!icon) {
      icon = document.createElement("span");
      icon.className   = "swipe-reply-icon";
      bubble.parentElement.appendChild(icon);
      bubble._replyIcon = icon;
    }
    icon.style.opacity   = opacity;
    icon.style.transform = `scale(${0.7 + opacity * 0.4})`;

    if (swipeDelta >= SWIPE_THRESHOLD && !swipeTriggered) {
      swipeTriggered = true;
      navigator.vibrate?.(30);
      iniciarReply(msg);
    }
  }, { passive: true });

  function resetSwipe() {
    clearTimeout(contextTimeout);
    swipeActive = false;
    bubble.style.transition = "transform 0.3s cubic-bezier(0.25,1,0.5,1)";
    bubble.style.transform  = "";
    if (bubble._replyIcon) {
      bubble._replyIcon.style.opacity   = "0";
      bubble._replyIcon.style.transform = "scale(0.7)";
      setTimeout(() => { if (bubble._replyIcon) { bubble._replyIcon.remove(); bubble._replyIcon = null; } }, 300);
    }
  }

  bubble.addEventListener("touchend",    resetSwipe, { passive: true });
  bubble.addEventListener("touchcancel", resetSwipe, { passive: true });
  bubble.addEventListener("contextmenu", abrirContexto);
}

function fecharContextoAtivo() {
  document.querySelectorAll(".dm-context-menu").forEach(el => el.remove());
}

function mostrarContextMenu(bubble, msg, isSender) {
  const menu = document.createElement("div");
  menu.className = "dm-context-menu";

  const emojis  = ["❤️","😂","👍","😮","😢","🔥"];
  const reacRow = document.createElement("div");
  reacRow.className = "dm-context-emojis";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.textContent = e;
    btn.addEventListener("click", async () => { await reagirMensagem(msg.id, e); fecharContextoAtivo(); });
    reacRow.appendChild(btn);
  });
  menu.appendChild(reacRow);

  const acoes = [{ icon: "", label: "Responder", fn: () => iniciarReply(msg) }];
  if (isSender) acoes.push({ icon: "", label: "Apagar", fn: () => apagarMensagem(msg.id) });
  acoes.push({ icon: "", label: "Copiar", fn: () => { navigator.clipboard?.writeText(msg.content || ""); fecharContextoAtivo(); } });

  acoes.forEach(({ icon, label, fn }) => {
    const item = document.createElement("button");
    item.className = "dm-context-item";
    item.innerHTML = `<span>${icon}</span><span>${label}</span>`;
    item.addEventListener("click", () => { fn(); fecharContextoAtivo(); });
    menu.appendChild(item);
  });

  bubble.style.position = "relative";
  bubble.appendChild(menu);
  setTimeout(() => document.addEventListener("click", fecharContextoAtivo, { once: true }), 100);
}

// ── Reply ──────────────────────────────────────────────────────────────────────
function iniciarReply(msg) {
  replyingTo = {
    id: msg.id,
    content: msg.type === "image" ? "📷 Foto" : msg.type === "gif" ? "🎞️ GIF" : msg.content,
    sender: msg.sender,
    senderName: msg.sender === loggedUser ? "Você" : (memCache.getName(msg.sender) || "...")
  };

  let bar = document.getElementById("dm-reply-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id        = "dm-reply-bar";
    bar.className = "dm-reply-bar";
    document.querySelector(".dm-send-area").prepend(bar);
  }
  bar.innerHTML = `
    <div class="reply-bar-inner">
      <div class="reply-bar-line"></div>
      <div class="reply-bar-content">
        <span class="reply-bar-name">${escapeHtml(replyingTo.senderName)}</span>
        <span class="reply-bar-text">${escapeHtml(truncarMensagem(replyingTo.content, 50))}</span>
      </div>
      <button class="reply-bar-close" id="replyCloseBtn">✕</button>
    </div>
  `;
  document.getElementById("replyCloseBtn").addEventListener("click", cancelarReply);
  dmMsgInput.focus();
}

function cancelarReply() {
  replyingTo = null;
  document.getElementById("dm-reply-bar")?.remove();
}

// ── Reagir ─────────────────────────────────────────────────────────────────────
async function reagirMensagem(msgId, emoji) {
  if (!selectedChatId || !loggedUser) return;
  try {
    const msgRef  = doc(db, "chats", selectedChatId, "messages", msgId);
    const snap    = await getDoc(msgRef);
    if (!snap.exists()) return;
    const reactions = snap.data().reactions || {};
    if (reactions[loggedUser] === emoji) delete reactions[loggedUser];
    else reactions[loggedUser] = emoji;
    await updateDoc(msgRef, { reactions });
  } catch (err) { console.error("Erro ao reagir:", err); }
}

// ── Apagar mensagem ────────────────────────────────────────────────────────────
async function apagarMensagem(msgId) {
  if (!selectedChatId) return;
  try {
    await updateDoc(doc(db, "chats", selectedChatId, "messages", msgId), {
      content: "", type: "deleted", reactions: {}
    });
  } catch (err) { console.error("Erro ao apagar:", err); }
}

// ── Lightbox ───────────────────────────────────────────────────────────────────
function abrirLightbox(src) {
  let lb = document.getElementById("dm-lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id        = "dm-lightbox";
    lb.className = "dm-lightbox";
    lb.innerHTML = `<div class="dm-lightbox-backdrop"></div><img class="dm-lightbox-img" alt="imagem ampliada">`;
    document.body.appendChild(lb);
    lb.querySelector(".dm-lightbox-backdrop").addEventListener("click", fecharLightbox);
    lb.querySelector(".dm-lightbox-img").addEventListener("click", e => e.stopPropagation());
  }
  lb.querySelector(".dm-lightbox-img").src = src;
  lb.classList.add("active");
}
function fecharLightbox() {
  document.getElementById("dm-lightbox")?.classList.remove("active");
}

// ── GIF Picker ─────────────────────────────────────────────────────────────────
function criarGifPicker() {
  let picker = document.getElementById("dm-gif-picker");
  if (picker) { picker.classList.toggle("active"); return; }

  picker = document.createElement("div");
  picker.id        = "dm-gif-picker";
  picker.className = "dm-gif-picker";
  picker.innerHTML = `
    <div class="gif-picker-header">
      <input type="text" id="gif-search-input" placeholder="Buscar GIFs..." autocomplete="off">
      <button id="gif-search-btn">🔍</button>
    </div>
    <div class="gif-grid" id="gif-grid">
      <div class="gif-loading">Carregando GIFs...</div>
    </div>
  `;
  document.querySelector(".dm-chat-area").appendChild(picker);
  picker.classList.add("active");
  carregarGifsTrending();

  document.getElementById("gif-search-btn").addEventListener("click", () =>
    buscarGifs(document.getElementById("gif-search-input").value));
  document.getElementById("gif-search-input").addEventListener("keypress", e => {
    if (e.key === "Enter") buscarGifs(e.target.value);
  });

  document.addEventListener("click", e => {
    if (!picker.contains(e.target) && e.target.id !== "gif-btn")
      picker.classList.remove("active");
  }, { capture: false });
}

async function carregarGifsTrending() {
  try {
    const r = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`);
    const d = await r.json();
    renderizarGifs(d.data);
  } catch (_) {
    const g = document.getElementById("gif-grid");
    if (g) g.innerHTML = `<p style="color:#888;padding:12px">Erro ao carregar GIFs.</p>`;
  }
}

async function buscarGifs(termo) {
  if (!termo.trim()) { carregarGifsTrending(); return; }
  const g = document.getElementById("gif-grid");
  if (g) g.innerHTML = `<div class="gif-loading">Buscando...</div>`;
  try {
    const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(termo)}&limit=24&rating=pg-13`);
    const d = await r.json();
    renderizarGifs(d.data);
  } catch (_) {}
}

function renderizarGifs(gifs) {
  const grid = document.getElementById("gif-grid");
  if (!gifs || !gifs.length) { if (grid) grid.innerHTML = `<p style="color:#888;padding:12px">Nenhum GIF encontrado.</p>`; return; }
  grid.innerHTML = "";
  gifs.forEach(g => {
    const url = g.images?.fixed_height_small?.url || g.images?.original?.url;
    if (!url) return;
    const img = document.createElement("img");
    img.src       = url;
    img.className = "gif-item";
    img.loading   = "lazy";
    img.addEventListener("click", () => {
      enviarGif(url);
      document.getElementById("dm-gif-picker")?.classList.remove("active");
    });
    grid.appendChild(img);
  });
}

async function enviarGif(gifUrl) {
  if (!selectedUser || !loggedUser) return;
  const chatId  = gerarChatId(loggedUser, selectedUser);
  await garantirChatExiste(chatId);
  const msgData = {
    type: "gif", content: gifUrl,
    sender: loggedUser, timestamp: serverTimestamp(), read: false,
    ...(replyingTo ? { replyTo: replyingTo } : {})
  };
  try {
    await Promise.all([
      addDoc(collection(db, "chats", chatId, "messages"), msgData),
      updateDoc(doc(db, "chats", chatId), {
        lastMessage: "__gif__", lastMessageTime: serverTimestamp(),
        lastMessageSender: loggedUser, lastMessageRead: false
      })
    ]);
    cancelarReply();
    conversasCache.clear();
  } catch (err) { console.error("Erro ao enviar GIF:", err); }
}

// ── Upload de imagem (ImgBB) ───────────────────────────────────────────────────
imgDmBtn.style.display = "flex";
imgDmBtn.innerHTML = `<i class="fa-solid fa-image"></i>`;

const fileInput = document.createElement("input");
fileInput.type    = "file";
fileInput.accept  = "image/*";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

const gifBtn       = document.createElement("button");
gifBtn.id          = "gif-btn";
gifBtn.className   = "gif-btn";
gifBtn.textContent = "GIF";
imgDmBtn.insertAdjacentElement("afterend", gifBtn);

imgDmBtn.addEventListener("click", () => fileInput.click());
gifBtn.addEventListener("click",   criarGifPicker);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file || !selectedUser) return;

  const localUrl = URL.createObjectURL(file);
  const tempId   = "temp_" + Date.now();
  adicionarMensagemLocal({ id: tempId, type: "image", content: localUrl, sender: loggedUser, timestamp: { seconds: Date.now() / 1000 }, uploading: true });

  try {
    const formData = new FormData();
    formData.append("image", file);
    const r   = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const d   = await r.json();
    const url = d.data?.url;
    if (!url) throw new Error("ImgBB sem URL");

    const chatId  = gerarChatId(loggedUser, selectedUser);
    await garantirChatExiste(chatId);
    const msgData = {
      type: "image", content: url,
      sender: loggedUser, timestamp: serverTimestamp(), read: false,
      ...(replyingTo ? { replyTo: replyingTo } : {})
    };
    await Promise.all([
      addDoc(collection(db, "chats", chatId, "messages"), msgData),
      updateDoc(doc(db, "chats", chatId), {
        lastMessage: "__img__", lastMessageTime: serverTimestamp(),
        lastMessageSender: loggedUser, lastMessageRead: false
      })
    ]);
    cancelarReply();
    conversasCache.clear();
    audioSend.currentTime = 0;
    audioSend.play().catch(() => {});
  } catch (err) {
    console.error("Erro ao enviar imagem:", err);
    document.querySelector(`[data-msgid="${tempId}"]`)?.remove();
  }
  URL.revokeObjectURL(localUrl);
});

function adicionarMensagemLocal(m) {
  const bloco  = document.createElement("div");
  bloco.className = "dm-msg-bloco meu-bloco";
  const bubble = document.createElement("div");
  bubble.className    = "dm-msg-bubble meu";
  bubble.dataset.msgid = m.id;
  if (m.type === "image") {
    const img = document.createElement("img");
    img.className = "dm-msg-image" + (m.uploading ? " uploading" : "");
    img.src = m.content;
    bubble.appendChild(img);
  }
  bloco.appendChild(bubble);
  dmMessages.appendChild(bloco);
  scrollToBottomBouncy();
}

// ── Garantir doc do chat ───────────────────────────────────────────────────────
async function garantirChatExiste(chatId) {
  const chatRef = doc(db, "chats", chatId);
  const s = await getDoc(chatRef);
  if (!s.exists()) {
    await setDoc(chatRef, {
      participants: [loggedUser, selectedUser],
      lastMessage: "", lastMessageTime: serverTimestamp(),
      lastMessageSender: "", lastMessageRead: true
    });
  }
}

// ── Enviar mensagem de texto ───────────────────────────────────────────────────
let enviando = false, ultimoEnvio = 0;

async function enviarMensagem() {
  const agora = Date.now();
  if (enviando || agora - ultimoEnvio < 700) return;
  enviando    = true;
  ultimoEnvio = agora;

  const conteudo = dmMsgInput.value.trim();
  if (!conteudo || !selectedUser) { enviando = false; return; }
  dmMsgInput.value = "";
  dmMsgInput.blur();

  const chatId  = gerarChatId(loggedUser, selectedUser);
  await garantirChatExiste(chatId);

  const msgData = {
    type: "text", content: conteudo,
    sender: loggedUser, timestamp: serverTimestamp(), read: false,
    ...(replyingTo ? { replyTo: replyingTo } : {})
  };
  cancelarReply();

  try {
    await Promise.all([
      addDoc(collection(db, "chats", chatId, "messages"), msgData),
      updateDoc(doc(db, "chats", chatId), {
        lastMessage: conteudo, lastMessageTime: serverTimestamp(),
        lastMessageSender: loggedUser, lastMessageRead: false
      })
    ]);
    audioSend.currentTime = 0;
    audioSend.play().catch(() => {});
    conversasCache.clear();
  } catch (err) { console.error("Erro ao enviar:", err); }
  enviando = false;
}

dmSendBtn.addEventListener("click", e => { e.preventDefault(); enviarMensagem(); });
dmMsgInput.addEventListener("keypress", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviarMensagem(); } });

// ── Auth ───────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    loggedUser = user.uid;

    // Mostra nome do cache imediatamente
    const cachedName = memCache.getName(loggedUser);
    if (cachedName) dmTitle.textContent = cachedName;

    try {
      const ud = await getDoc(doc(db, "users", loggedUser));
      if (ud.exists()) {
        const d = ud.data();
        const n = d.displayname || d.username || loggedUser;
        memCache.setName(loggedUser, n);
        dmTitle.textContent = n;
      }
    } catch (_) {}

    carregarConversas();
    iniciarElasticScroll();
  } else {
    window.location.href = "login.html";
  }
});

// ── Elastic rubber-band overscroll ────────────────────────────────────────────
function iniciarElasticScroll() {
  let startY = 0, lastY = 0, velocity = 0, rafId = null;
  let isAtTop = false, isAtBottom = false;
  let extraTranslate = 0, animating = false;

  dmMessages.addEventListener("touchstart", e => {
    startY = e.touches[0].clientY;
    lastY  = startY;
    velocity = 0;
    cancelAnimationFrame(rafId);
    extraTranslate = 0;
    dmMessages.style.transform = "";
  }, { passive: true });

  dmMessages.addEventListener("touchmove", e => {
    const y  = e.touches[0].clientY;
    const dy = y - lastY;
    lastY    = y;
    velocity = dy * 0.6 + velocity * 0.4;

    isAtTop    = dmMessages.scrollTop <= 0;
    isAtBottom = dmMessages.scrollTop + dmMessages.clientHeight >= dmMessages.scrollHeight - 1;

    if ((isAtTop && dy > 0) || (isAtBottom && dy < 0)) {
      extraTranslate += dy * 0.3;
      dmMessages.style.transform = `translateY(${extraTranslate}px)`;
    }
  }, { passive: true });

  dmMessages.addEventListener("touchend", () => {
    if (extraTranslate === 0) return;
    animating = true;
    const startVal  = extraTranslate;
    const startTime = performance.now();
    const dur       = 420;

    function springBack(ts) {
      const t    = Math.min((ts - startTime) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      extraTranslate = startVal * (1 - ease);
      dmMessages.style.transform = extraTranslate !== 0 ? `translateY(${extraTranslate}px)` : "";
      if (t < 1) {
        rafId = requestAnimationFrame(springBack);
      } else {
        dmMessages.style.transform = "";
        animating      = false;
        extraTranslate = 0;
      }
    }
    rafId = requestAnimationFrame(springBack);
  }, { passive: true });
}