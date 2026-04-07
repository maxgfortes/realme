import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  addDoc
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
const db = getFirestore(app);
const auth = getAuth(app);

// ── Chaves de API ──────────────────────────────────────────────────────────────
const GIPHY_API_KEY = "GlVGYHkr3WSBnllca54iNt0yFbjz7L59"; // chave pública demo
const IMGBB_API_KEY = "fc8497dcdf559dc9cbff97378c82344c"; // substitua pela sua

// Sons
const audioSend    = new Audio('./src/audio/msg send.mp3');
const audioReceive = new Audio('./src/audio/msg recive.mp3');

// DOM
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

let loggedUser           = null;
let selectedUser         = null;
let unsubscribeMessages  = null;
let allChats             = [];
let chatsArray           = [];
let ultimaQtdMensagens   = 0;
let replyingTo           = null; // { id, content, sender, senderName }
let selectedChatId       = null;

// ── Cache de dados de usuários ─────────────────────────────────────────────────
const userCache = {
  photos: new Map(),
  names:  new Map(),
  setPhoto(uid, url)  { this.photos.set(uid, url); localStorage.setItem(`user_photo_${uid}`, url); },
  getPhoto(uid)       { if (this.photos.has(uid)) return this.photos.get(uid); const c = localStorage.getItem(`user_photo_${uid}`); if (c) { this.photos.set(uid, c); return c; } return null; },
  setName(uid, name)  { this.names.set(uid, name); localStorage.setItem(`user_name_${uid}`, name); },
  getName(uid)        { if (this.names.has(uid)) return this.names.get(uid); const c = localStorage.getItem(`user_name_${uid}`); if (c) { this.names.set(uid, c); return c; } return null; }
};

const conversasCache = {
  data: null, timestamp: 0, ttl: 30000,
  set(d)   { this.data = d; this.timestamp = Date.now(); try { localStorage.setItem('conversas_cache', JSON.stringify({ data: d, timestamp: this.timestamp })); } catch(_){} },
  get()    { if (this.data && Date.now() - this.timestamp < this.ttl) return this.data; try { const c = localStorage.getItem('conversas_cache'); if (c) { const p = JSON.parse(c); if (Date.now() - p.timestamp < this.ttl) { this.data = p.data; this.timestamp = p.timestamp; return this.data; } } } catch(_){} return null; },
  clear()  { this.data = null; this.timestamp = 0; try { localStorage.removeItem('conversas_cache'); } catch(_){} }
};

function gerarChatId(u1, u2) { return `chat-${[u1, u2].sort().join("-")}`; }

async function buscarDadosUsuario(userId) {
  let photoUrl    = userCache.getPhoto(userId) || "./src/icon/default.jpg";
  let displayName = userCache.getName(userId)  || userId;
  Promise.all([
    getDoc(doc(db, "users", userId, "user-infos", "user-media")).then(s => { if (s.exists() && s.data().userphoto) { userCache.setPhoto(userId, s.data().userphoto); } }).catch(()=>{}),
    getDoc(doc(db, "users", userId)).then(s => { if (s.exists()) { const d = s.data(); userCache.setName(userId, d.displayname || d.username || userId); } }).catch(()=>{})
  ]);
  return { photoUrl, displayName };
}

// ── Carrega e renderiza conversas ──────────────────────────────────────────────
async function carregarConversas(filtrarTermo = "") {
  const cached = conversasCache.get();
  if (cached && !filtrarTermo) renderizarConversas(cached, filtrarTermo);
  if (!loggedUser) return;

  const q = query(collection(db, "chats"), where("participants", "array-contains", loggedUser));
  const snap = await getDocs(q);

  chatsArray = [];
  const promises = [];
  for (const chatDoc of snap.docs) {
    const cd = chatDoc.data();
    if (cd.participants?.includes(loggedUser)) {
      const friendId = cd.participants.find(p => p !== loggedUser);
      if (friendId) {
        chatsArray.push({
          chatId: chatDoc.id,
          friendId,
          lastMessageTime: cd.lastMessageTime ? (cd.lastMessageTime.toMillis ? cd.lastMessageTime.toMillis() : cd.lastMessageTime.seconds * 1000) : 0,
          lastMessage: cd.lastMessage || "",
          lastMessageSender: cd.lastMessageSender || "",
          lastMessageRead: cd.lastMessageRead ?? true,
          chatData: cd
        });
        promises.push(buscarDadosUsuario(friendId));
      }
    }
  }
  await Promise.all(promises);
  chatsArray.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  allChats = chatsArray;
  conversasCache.set(chatsArray);
  renderizarConversas(chatsArray, filtrarTermo);
}

function renderizarConversas(arr, filtrarTermo = "") {
  dmUsersList.querySelectorAll(".dm-user-btn").forEach(e => e.remove());
  const unicos = new Set();
  const frag   = document.createDocumentFragment();

  for (const chatObj of arr) {
    const fid = chatObj.friendId;
    if (unicos.has(fid)) continue;
    unicos.add(fid);

    const photo   = userCache.getPhoto(fid) || "./src/icon/default.jpg";
    const nome    = userCache.getName(fid)  || fid;
    if (filtrarTermo && !nome.toLowerCase().includes(filtrarTermo.toLowerCase())) continue;

    const isUnread  = chatObj.lastMessageSender !== loggedUser && !chatObj.lastMessageRead;
    const lastSnippet = truncarMensagem(chatObj.lastMessage, 28);
    const timeStr   = tempoRelativo(chatObj.lastMessageTime);

    const btn = document.createElement("button");
    btn.className = "dm-user-btn";
    btn.dataset.friendid = fid;
    btn.innerHTML = `
      <img src="${photo}" alt="Foto" onerror="this.src='./src/img/default.jpg'">
      <div class="dm-user-info">
        <div class="dm-user-row">
          <span class="dm-user-name ${isUnread ? 'unread-name' : ''}">${escapeHtml(nome)}</span>
          <span class="dm-user-time">${timeStr}</span>
        </div>
        <span class="dm-user-last ${isUnread ? 'unread-msg' : ''}">${escapeHtml(lastSnippet)}</span>
      </div>
    `;
    btn.addEventListener("click", () => selecionarUsuario(fid, photo, nome));
    frag.appendChild(btn);
  }
  dmUsersList.appendChild(frag);
}

function truncarMensagem(msg, max) {
  if (!msg) return "";
  if (msg.startsWith("__img__")) return "Foto";
  if (msg.startsWith("__gif__")) return "GIF";
  return msg.length > max ? msg.slice(0, max) + "…" : msg;
}

// ── Foto perfil navbar ─────────────────────────────────────────────────────────
function carregarFotoPerfil() {
  const navPic     = document.getElementById('nav-pic');
  const defaultPic = './src/icon/default.jpg';
  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto && navPic) navPic.src = cachedPhoto;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const s = await getDoc(doc(db, `users/${user.uid}/user-infos/user-media`));
        if (s.exists()) {
          const url = s.data().userphoto || defaultPic;
          if (navPic) navPic.src = url;
          localStorage.setItem('user_photo_cache', url);
        }
      } catch (_) {}
    }
  });
}
document.addEventListener('DOMContentLoaded', carregarFotoPerfil);

// ── Busca ──────────────────────────────────────────────────────────────────────
dmSearchInput.addEventListener("input", () => renderizarConversas(chatsArray, dmSearchInput.value.trim()));
dmSearchBtn.addEventListener("click",   () => renderizarConversas(chatsArray, dmSearchInput.value.trim()));

// ── Seleciona usuário ──────────────────────────────────────────────────────────
function selecionarUsuario(userId, photoUrl, displayName) {
  selectedUser = userId;
  selectedChatId = gerarChatId(loggedUser, userId);
  document.querySelectorAll(".dm-user-btn").forEach(b => b.classList.remove("active"));
  const btn = document.querySelector(`.dm-user-btn[data-friendid="${userId}"]`);
  if (btn) btn.classList.add("active");
  dmChatUserImg.src = photoUrl;
  dmChatUserName.textContent = displayName;
  dmChatUserName.setAttribute("data-userid", userId);
  cancelarReply();
  carregarMensagensTempoReal();
  dmContainer.classList.add('show-chat');
  dmNavbar.style.display = "none";
  dmChatHeader.style.display = "flex";
  if (navbarbottom) navbarbottom.style.display = "none";
}

dmBackBtn.addEventListener('click', () => {
  dmContainer.classList.remove('show-chat');
  selectedUser = null;
  selectedChatId = null;
  dmMessages.innerHTML = `<div class="dm-no-chat">Selecione uma conversa para começar</div>`;
  document.querySelectorAll(".dm-user-btn").forEach(b => b.classList.remove("active"));
  dmNavbar.style.display = "";
  dmChatHeader.style.display = "none";
  if (navbarbottom) navbarbottom.style.display = "";
  cancelarReply();
  if (unsubscribeMessages) { unsubscribeMessages(); unsubscribeMessages = null; }
});

dmListBackBtn.addEventListener('click', () => window.history.back());

dmChatUserName.addEventListener("click", () => {
  const uid = dmChatUserName.getAttribute("data-userid");
  if (uid) window.location.href = `profile.html?u=${uid}`;
});

// ── Marcar mensagens como lidas ────────────────────────────────────────────────
async function marcarMensagensComoLidas(chatId, mensagens) {
  const promises = mensagens
    .filter(m => m.sender !== loggedUser && !m.read)
    .map(m => updateDoc(doc(db, "chats", chatId, "messages", m.id), { read: true }).catch(()=>{}));
  if (promises.length) {
    await Promise.all(promises);
    updateDoc(doc(db, "chats", chatId), { lastMessageRead: true }).catch(()=>{});
  }
}

// ── Mensagens em tempo real ────────────────────────────────────────────────────
function carregarMensagensTempoReal() {
  if (unsubscribeMessages) unsubscribeMessages();
  dmMessages.innerHTML = "";
  if (!loggedUser || !selectedUser) return;

  const chatId = gerarChatId(loggedUser, selectedUser);
  const q      = query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "asc"));

  unsubscribeMessages = onSnapshot(q, async (snapshot) => {
    let msgs = [];
    snapshot.forEach(d => { const m = d.data(); m.id = d.id; msgs.push(m); });

    marcarMensagensComoLidas(chatId, msgs);

    if (msgs.length > ultimaQtdMensagens && msgs.length > 0 && msgs[msgs.length - 1].sender !== loggedUser) {
      audioReceive.currentTime = 0;
      audioReceive.play().catch(()=>{});
    }
    ultimaQtdMensagens = msgs.length;
    renderizarMensagens(msgs);
  });
}

// ── Render de mensagens ────────────────────────────────────────────────────────
function renderizarMensagens(mensagens) {
  const frag      = document.createDocumentFragment();
  let lastSender  = null;
  let bloco       = null;

  // Filtra mensagens apagadas do fluxo geral
  const visiveis = mensagens.filter(m => m.type !== "deleted");

  let lastUserMsgIdx = -1;
  for (let i = visiveis.length - 1; i >= 0; i--) {
    if (visiveis[i].sender === loggedUser) { lastUserMsgIdx = i; break; }
  }

  visiveis.forEach((m, idx) => {
    const isSender = m.sender === loggedUser;

    if (m.sender !== lastSender) {
      bloco = document.createElement("div");
      bloco.className = "dm-msg-bloco " + (isSender ? "meu-bloco" : "deles-bloco");
      frag.appendChild(bloco);
    }

    const bubble = document.createElement("div");
    bubble.className = "dm-msg-bubble " + (isSender ? "meu" : "deles");
    bubble.dataset.msgid = m.id;

    // ── Reply preview ───────────────────────────────────────────
    if (m.replyTo) {
      const rp = document.createElement("div");
      rp.className = "reply-preview";
      const rName = m.replyTo.senderName || (m.replyTo.sender === loggedUser ? "Você" : userCache.getName(m.replyTo.sender) || "...");
      rp.innerHTML = `<span class="reply-author">${escapeHtml(rName)}</span><span class="reply-text">${escapeHtml(truncarMensagem(m.replyTo.content, 40))}</span>`;
      bubble.appendChild(rp);
    }

    // ── Conteúdo da mensagem ────────────────────────────────────
    if (m.type === "image") {
      const img = document.createElement("img");
      img.className = "dm-msg-image";
      img.src = m.content;
      img.alt = "imagem";
      img.loading = "lazy";
      img.addEventListener("click", () => abrirLightbox(m.content));
      bubble.appendChild(img);
    } else if (m.type === "gif") {
      const gif = document.createElement("img");
      gif.className = "dm-msg-gif";
      gif.src = m.content;
      gif.alt = "gif";
      gif.loading = "lazy";
      gif.addEventListener("click", () => abrirLightbox(m.content));
      bubble.appendChild(gif);
    } else {
      const p = document.createElement("p");
      p.innerHTML = renderizarTexto(m.content || "");
      bubble.appendChild(p);
    }

    // ── Reações ─────────────────────────────────────────────────
    if (m.reactions && Object.keys(m.reactions).length > 0) {
      const reacDiv = document.createElement("div");
      reacDiv.className = "dm-reactions";
      const grouped = {};
      Object.values(m.reactions).forEach(emoji => { grouped[emoji] = (grouped[emoji] || 0) + 1; });
      Object.entries(grouped).forEach(([emoji, count]) => {
        const span = document.createElement("span");
        span.className = "dm-reaction-chip";
        span.textContent = `${emoji}${count > 1 ? ' ' + count : ''}`;
        reacDiv.appendChild(span);
      });
      bubble.appendChild(reacDiv);
    }

    bloco.appendChild(bubble);

    // ── Long-press / hold para react & reply ───────────────────
    adicionarGestos(bubble, m, isSender);

    // ── Foto da outra pessoa na última bolha do bloco ───────────
    if (!isSender) {
      const next = visiveis[idx + 1];
      if (!next || next.sender === loggedUser) {
        const img2 = document.createElement("img");
        img2.className = "dm-msg-foto";
        img2.src = dmChatUserImg.src;
        bloco.appendChild(img2);
      }
    }

    // ── Footer na última mensagem enviada ───────────────────────
    if (idx === lastUserMsgIdx) {
      const footer = document.createElement("div");
      footer.className = "dm-msg-footer";
      const ts    = m.timestamp ? (m.timestamp.toDate ? m.timestamp.toDate() : new Date(m.timestamp.seconds * 1000)) : new Date();
      const visto = m.read ? `•<span class="dm-visto"> visto</span>` : `•<span class="dm-enviado"> enviado</span>`;
      footer.innerHTML = `<span>${formatarTempoRelativo(ts)}</span>${visto}`;
      bloco.appendChild(footer);
    }

    lastSender = m.sender;
  });

  dmMessages.innerHTML = "";
  dmMessages.appendChild(frag);
  scrollToBottomBouncy();
}

// ── Elastic / bouncy scroll iMessage style ─────────────────────────────────────
function scrollToBottomBouncy() {
  const el = dmMessages;
  const target = el.scrollHeight - el.clientHeight;
  const start = el.scrollTop;
  const diff = target - start;
  if (Math.abs(diff) < 2) return;

  const duration = 380;
  let startTime = null;

  // Spring easing: fast then overshoot + settle
  function easeOutBack(t) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  function step(ts) {
    if (!startTime) startTime = ts;
    const elapsed = ts - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = easeOutBack(progress);
    el.scrollTop = start + diff * ease;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ── Renderiza texto com links e formatação ─────────────────────────────────────
function renderizarTexto(texto) {
  // Escapa HTML
  let t = escapeHtml(texto);
  // URLs complexas
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
  t = t.replace(urlRegex, url => `<a class="dm-link" href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  // Negrito **texto**
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Itálico _texto_
  t = t.replace(/_(.+?)_/g, '<em>$1</em>');
  return t;
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ── Gestos: long-press abre menu de contexto ──────────────────────────────────
let contextTimeout = null;
function adicionarGestos(bubble, msg, isSender) {
  function abrirContexto(e) {
    e.preventDefault();
    fecharContextoAtivo();
    mostrarContextMenu(bubble, msg, isSender);
  }

  // ── Swipe para reply ────────────────────────────────────────────────────
  let swipeStartX = 0, swipeStartY = 0, swipeDelta = 0, swipeActive = false, swipeTriggered = false;
  const SWIPE_THRESHOLD = 60;
  const SWIPE_DIR = isSender ? -1 : 1; // minha msg: esquerda, deles: direita

  bubble.addEventListener("touchstart", e => {
    swipeStartX    = e.touches[0].clientX;
    swipeStartY    = e.touches[0].clientY;
    swipeDelta     = 0;
    swipeActive    = true;
    swipeTriggered = false;
    bubble.style.transition = "";
    contextTimeout = setTimeout(() => { swipeActive = false; abrirContexto({ preventDefault: ()=>{} }); }, 500);
  }, { passive: true });

  bubble.addEventListener("touchmove", e => {
    clearTimeout(contextTimeout);
    if (!swipeActive) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;

    if (Math.abs(dy) > Math.abs(dx) + 5) { swipeActive = false; return; }
    if (dx * SWIPE_DIR < 0) return;

    swipeDelta = dx * SWIPE_DIR;
    const move = Math.min(swipeDelta, SWIPE_THRESHOLD + 20) * SWIPE_DIR * 0.45;
    const opacity = Math.min(swipeDelta / SWIPE_THRESHOLD, 1);

    bubble.style.transition = "none";
    bubble.style.transform  = `translateX(${move}px)`;

    let icon = bubble._replyIcon;
    if (!icon) {
      icon = document.createElement("span");
      icon.className = "swipe-reply-icon";
      icon.textContent = "";
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

  // Right click / long press mouse
  bubble.addEventListener("contextmenu", abrirContexto);
}

function fecharContextoAtivo() {
  document.querySelectorAll(".dm-context-menu").forEach(el => el.remove());
}

function mostrarContextMenu(bubble, msg, isSender) {
  const menu = document.createElement("div");
  menu.className = "dm-context-menu";

  // Reações rápidas
  const emojis = ["❤️", "😂", "👍", "😮", "😢", "🔥"];
  const reacRow = document.createElement("div");
  reacRow.className = "dm-context-emojis";
  emojis.forEach(e => {
    const btn = document.createElement("button");
    btn.textContent = e;
    btn.addEventListener("click", async () => {
      await reagirMensagem(msg.id, e);
      fecharContextoAtivo();
    });
    reacRow.appendChild(btn);
  });
  menu.appendChild(reacRow);

  // Ações
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
    content: msg.type === "image" ? " Foto" : msg.type === "gif" ? " GIF" : msg.content,
    sender: msg.sender,
    senderName: msg.sender === loggedUser ? "Você" : (userCache.getName(msg.sender) || "...")
  };

  let bar = document.getElementById("dm-reply-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "dm-reply-bar";
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
  const bar = document.getElementById("dm-reply-bar");
  if (bar) bar.remove();
}

// ── Reagir ─────────────────────────────────────────────────────────────────────
async function reagirMensagem(msgId, emoji) {
  if (!selectedChatId || !loggedUser) return;
  try {
    const msgRef = doc(db, "chats", selectedChatId, "messages", msgId);
    const snap   = await getDoc(msgRef);
    if (!snap.exists()) return;
    const reactions = snap.data().reactions || {};
    // Toggle: se já reagiu com mesmo emoji, remove
    if (reactions[loggedUser] === emoji) {
      delete reactions[loggedUser];
    } else {
      reactions[loggedUser] = emoji;
    }
    await updateDoc(msgRef, { reactions });
  } catch (err) { console.error("Erro ao reagir:", err); }
}

// ── Apagar mensagem ────────────────────────────────────────────────────────────
async function apagarMensagem(msgId) {
  if (!selectedChatId) return;
  try {
    const msgRef = doc(db, "chats", selectedChatId, "messages", msgId);
    await updateDoc(msgRef, { content: "", type: "deleted", reactions: {} });
  } catch (err) { console.error("Erro ao apagar:", err); }
}

// ── Lightbox ───────────────────────────────────────────────────────────────────
function abrirLightbox(src) {
  let lb = document.getElementById("dm-lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "dm-lightbox";
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
  const lb = document.getElementById("dm-lightbox");
  if (lb) lb.classList.remove("active");
}

// ── GIF Picker ─────────────────────────────────────────────────────────────────
function criarGifPicker() {
  let picker = document.getElementById("dm-gif-picker");
  if (picker) { picker.classList.toggle("active"); return; }

  picker = document.createElement("div");
  picker.id = "dm-gif-picker";
  picker.className = "dm-gif-picker";
  picker.innerHTML = `
    <div class="gif-picker-header">
      <input type="text" id="gif-search-input" placeholder="Buscar GIFs..." autocomplete="off">
      <button id="gif-search-btn"></button>
    </div>
    <div class="gif-grid" id="gif-grid">
      <div class="gif-loading">Carregando trending GIFs...</div>
    </div>
  `;
  document.querySelector(".dm-chat-area").appendChild(picker);

  picker.classList.add("active");
  carregarGifsTrending();

  document.getElementById("gif-search-btn").addEventListener("click", () => buscarGifs(document.getElementById("gif-search-input").value));
  document.getElementById("gif-search-input").addEventListener("keypress", e => { if (e.key === "Enter") buscarGifs(e.target.value); });

  document.addEventListener("click", e => {
    if (!picker.contains(e.target) && e.target.id !== "gif-btn") {
      picker.classList.remove("active");
    }
  }, { capture: false });
}

async function carregarGifsTrending() {
  try {
    const r = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`);
    const d = await r.json();
    renderizarGifs(d.data);
  } catch (_) {
    document.getElementById("gif-grid").innerHTML = `<p style="color:#888;padding:12px">Erro ao carregar GIFs.</p>`;
  }
}

async function buscarGifs(termo) {
  if (!termo.trim()) { carregarGifsTrending(); return; }
  document.getElementById("gif-grid").innerHTML = `<div class="gif-loading">Buscando...</div>`;
  try {
    const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(termo)}&limit=24&rating=pg-13`);
    const d = await r.json();
    renderizarGifs(d.data);
  } catch (_) {}
}

function renderizarGifs(gifs) {
  const grid = document.getElementById("gif-grid");
  if (!gifs || !gifs.length) { grid.innerHTML = `<p style="color:#888;padding:12px">Nenhum GIF encontrado.</p>`; return; }
  grid.innerHTML = "";
  gifs.forEach(g => {
    const url = g.images?.fixed_height_small?.url || g.images?.original?.url;
    if (!url) return;
    const img = document.createElement("img");
    img.src     = url;
    img.className = "gif-item";
    img.loading = "lazy";
    img.addEventListener("click", () => { enviarGif(url); document.getElementById("dm-gif-picker")?.classList.remove("active"); });
    grid.appendChild(img);
  });
}

async function enviarGif(gifUrl) {
  if (!selectedUser || !loggedUser) return;
  const chatId = gerarChatId(loggedUser, selectedUser);
  await garantirChatExiste(chatId);
  const msgData = {
    type: "gif", content: gifUrl,
    sender: loggedUser, timestamp: serverTimestamp(), read: false,
    ...(replyingTo ? { replyTo: replyingTo } : {})
  };
  try {
    await Promise.all([
      addDoc(collection(db, "chats", chatId, "messages"), msgData),
      updateDoc(doc(db, "chats", chatId), { lastMessage: "__gif__", lastMessageTime: serverTimestamp(), lastMessageSender: loggedUser, lastMessageRead: false })
    ]);
    cancelarReply();
    conversasCache.clear();
  } catch (err) { console.error("Erro ao enviar GIF:", err); }
}

// ── Upload foto (ImgBB) ────────────────────────────────────────────────────────
imgDmBtn.style.display = "flex";
imgDmBtn.innerHTML = `<i class="fa-solid fa-image"></i>`;

// Criar o input de arquivo
const fileInput = document.createElement("input");
fileInput.type = "file";
fileInput.accept = "image/*";
fileInput.style.display = "none";
document.body.appendChild(fileInput);

// Botão GIF
const gifBtn = document.createElement("button");
gifBtn.id = "gif-btn";
gifBtn.className = "gif-btn";
gifBtn.textContent = "GIF";
imgDmBtn.insertAdjacentElement("afterend", gifBtn);

imgDmBtn.addEventListener("click", () => fileInput.click());
gifBtn.addEventListener("click", criarGifPicker);

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file || !selectedUser) return;

  // Preview otimista
  const localUrl  = URL.createObjectURL(file);
  const tempId    = "temp_" + Date.now();
  adicionarMensagemLocal({ id: tempId, type: "image", content: localUrl, sender: loggedUser, timestamp: { seconds: Date.now() / 1000 }, uploading: true });

  try {
    const formData = new FormData();
    formData.append("image", file);
    const r  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: "POST", body: formData });
    const d  = await r.json();
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
      updateDoc(doc(db, "chats", chatId), { lastMessage: "__img__", lastMessageTime: serverTimestamp(), lastMessageSender: loggedUser, lastMessageRead: false })
    ]);
    cancelarReply();
    conversasCache.clear();
    audioSend.currentTime = 0;
    audioSend.play().catch(()=>{});
  } catch (err) {
    console.error("Erro ao enviar imagem:", err);
    document.querySelector(`[data-msgid="${tempId}"]`)?.remove();
  }
  URL.revokeObjectURL(localUrl);
});

function adicionarMensagemLocal(m) {
  const bloco = document.createElement("div");
  bloco.className = "dm-msg-bloco meu-bloco";
  const bubble = document.createElement("div");
  bubble.className = "dm-msg-bubble meu";
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

// ── Garantir que o doc do chat existe ─────────────────────────────────────────
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
  enviando = true;
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
    audioSend.play().catch(()=>{});
    conversasCache.clear();
  } catch (err) { console.error('Erro ao enviar:', err); }
  enviando = false;
}

function enviarMensagemHandler(e) { if (e) e.preventDefault(); enviarMensagem(); }

dmSendBtn.addEventListener("click", enviarMensagemHandler);
dmMsgInput.addEventListener("keypress", e => { if (e.key === "Enter" && !e.shiftKey) enviarMensagemHandler(e); });

// ── Utilitários de tempo ───────────────────────────────────────────────────────
function formatarTempoRelativo(date) {
  const diff = Date.now() - date;
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (diff < 60000) return "agora";
  if (m < 60)       return `há ${m} min`;
  if (h < 24)       return `há ${h} h`;
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

function tempoRelativo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), d = Math.floor(diff / 86400000);
  if (d > 0)  return `${d}d`;
  if (h > 0)  return `${h}h`;
  if (m > 0)  return `${m}m`;
  return "agora";
}

// ── Auth ───────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (user) {
    loggedUser = user.uid;
    let displayName = userCache.getName(loggedUser) || loggedUser;
    dmTitle.textContent = displayName;
    try {
      const ud = await getDoc(doc(db, "users", loggedUser));
      if (ud.exists()) {
        const d = ud.data();
        const n = d.displayname || d.username || loggedUser;
        userCache.setName(loggedUser, n);
        dmTitle.textContent = n;
      }
    } catch (_) {}
    carregarConversas();
    iniciarElasticScroll();
  } else {
    window.location.href = "login.html";
  }
});

// ── iMessage elastic rubber-band overscroll ────────────────────────────────────
function iniciarElasticScroll() {
  let startY = 0, lastY = 0, velocity = 0, rafId = null;
  let isAtTop = false, isAtBottom = false;
  let extraTranslate = 0, animating = false;

  // ── Rubber-band overscroll ──────────────────────────────────────────────
  dmMessages.addEventListener("touchstart", e => {
    startY = e.touches[0].clientY;
    lastY = startY;
    velocity = 0;
    cancelAnimationFrame(rafId);
    extraTranslate = 0;
    dmMessages.style.transform = "";
  }, { passive: true });

  dmMessages.addEventListener("touchmove", e => {
    const y = e.touches[0].clientY;
    const dy = y - lastY;
    lastY = y;
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
    const startVal = extraTranslate;
    const startTime = performance.now();
    const dur = 420;

    function springBack(ts) {
      const t = Math.min((ts - startTime) / dur, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      extraTranslate = startVal * (1 - ease);
      dmMessages.style.transform = extraTranslate !== 0 ? `translateY(${extraTranslate}px)` : "";
      if (t < 1) {
        rafId = requestAnimationFrame(springBack);
      } else {
        dmMessages.style.transform = "";
        animating = false;
        extraTranslate = 0;
      }
    }
    rafId = requestAnimationFrame(springBack);
  }, { passive: true });
}