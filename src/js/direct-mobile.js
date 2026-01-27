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
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firebase config
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

// Sons
const audioSend = new Audio('./src/audio/msg send.mp3');
const audioReceive = new Audio('./src/audio/msg recive.mp3');

// DOM
const dmContainer = document.querySelector('.dm-container');
const dmUsersList = document.getElementById("dmUsersList");
const dmChatArea = document.getElementById("dmChatArea");
const dmChatHeader = document.getElementById("dmChatHeader");
const dmChatUserImg = document.getElementById("dmChatUserImg");
const dmChatUserName = document.getElementById("dmChatUserName");
const dmMessages = document.getElementById("dmMessages");
const dmMsgInput = document.getElementById("dmMsgInput");
const dmSendBtn = document.getElementById("dmSendBtn");
const dmBackBtn = document.getElementById("dmBackBtn");
const dmNavbar = document.getElementById('dmNavbar');
const dmListBackBtn = document.getElementById('dmListBackBtn');
const dmTitle = document.getElementById('dmTitle');
const dmSearchInput = document.getElementById('dmSearchInput');
const dmSearchBtn = document.getElementById('dmSearchBtn');

let loggedUser = null;
let selectedUser = null;
let unsubscribeMessages = null;
let allChats = [];
let chatsArray = [];
let ultimaQtdMensagens = 0;

// Cache de dados de usuários
const userCache = {
  photos: new Map(),
  names: new Map(),
  
  setPhoto(userId, photoUrl) {
    this.photos.set(userId, photoUrl);
    localStorage.setItem(`user_photo_${userId}`, photoUrl);
  },
  
  getPhoto(userId) {
    if (this.photos.has(userId)) return this.photos.get(userId);
    const cached = localStorage.getItem(`user_photo_${userId}`);
    if (cached) {
      this.photos.set(userId, cached);
      return cached;
    }
    return null;
  },
  
  setName(userId, displayName) {
    this.names.set(userId, displayName);
    localStorage.setItem(`user_name_${userId}`, displayName);
  },
  
  getName(userId) {
    if (this.names.has(userId)) return this.names.get(userId);
    const cached = localStorage.getItem(`user_name_${userId}`);
    if (cached) {
      this.names.set(userId, cached);
      return cached;
    }
    return null;
  }
};

// Cache de conversas
const conversasCache = {
  data: null,
  timestamp: 0,
  ttl: 30000, // 30 segundos
  
  set(data) {
    this.data = data;
    this.timestamp = Date.now();
    localStorage.setItem('conversas_cache', JSON.stringify({
      data,
      timestamp: this.timestamp
    }));
  },
  
  get() {
    if (this.data && Date.now() - this.timestamp < this.ttl) {
      return this.data;
    }
    
    const cached = localStorage.getItem('conversas_cache');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.timestamp < this.ttl) {
        this.data = parsed.data;
        this.timestamp = parsed.timestamp;
        return this.data;
      }
    }
    return null;
  },
  
  clear() {
    this.data = null;
    this.timestamp = 0;
    localStorage.removeItem('conversas_cache');
  }
};

// Gera chatId
function gerarChatId(user1, user2) {
  return `chat-${[user1, user2].sort().join("-")}`;
}

// Busca dados do usuário com cache
async function buscarDadosUsuario(userId) {
  let photoUrl = userCache.getPhoto(userId) || "./src/icon/default.jpg";
  let displayName = userCache.getName(userId) || userId;
  
  // Busca em background para atualizar cache
  Promise.all([
    getDoc(doc(db, "users", userId, "user-infos", "user-media")).then(mediaDoc => {
      if (mediaDoc.exists() && mediaDoc.data().userphoto) {
        const newPhoto = mediaDoc.data().userphoto;
        if (newPhoto !== photoUrl) {
          userCache.setPhoto(userId, newPhoto);
        }
      }
    }).catch(() => {}),
    
    getDoc(doc(db, "users", userId)).then(userDoc => {
      if (userDoc.exists()) {
        const data = userDoc.data();
        const newName = data.displayname || data.username || userId;
        if (newName !== displayName) {
          userCache.setName(userId, newName);
        }
      }
    }).catch(() => {})
  ]);
  
  return { photoUrl, displayName };
}

// Carrega lista de conversas
async function carregarConversas(filtrarTermo = "") {
  // Carrega do cache primeiro
  const cached = conversasCache.get();
  if (cached && !filtrarTermo) {
    renderizarConversas(cached, filtrarTermo);
  }
  
  if (!loggedUser) return;
  
  const chatsRef = collection(db, "chats");
  const q = query(chatsRef, where("participants", "array-contains", loggedUser));
  const chatsSnap = await getDocs(q);

  chatsArray = [];
  const promises = [];
  
  for (const chatDoc of chatsSnap.docs) {
    const chatData = chatDoc.data();
    if (chatData.participants && chatData.participants.includes(loggedUser)) {
      const friendId = chatData.participants.find(p => p !== loggedUser);
      if (friendId) {
        chatsArray.push({
          friendId,
          lastMessageTime: chatData.lastMessageTime ? chatData.lastMessageTime.toMillis ? chatData.lastMessageTime.toMillis() : chatData.lastMessageTime.seconds * 1000 : 0,
          lastMessage: chatData.lastMessage || "",
          chatData
        });
        
        // Busca dados do usuário em paralelo
        promises.push(buscarDadosUsuario(friendId));
      }
    }
  }
  
  // Aguarda todas as buscas de dados
  await Promise.all(promises);
  
  chatsArray.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
  allChats = chatsArray;
  
  // Salva no cache
  conversasCache.set(chatsArray);
  
  renderizarConversas(chatsArray, filtrarTermo);
}

// Renderiza conversas na tela
function renderizarConversas(chatsArray, filtrarTermo = "") {
  dmUsersList.querySelectorAll(".dm-user-btn").forEach(e => e.remove());
  
  const friendsUnicos = new Set();
  const fragment = document.createDocumentFragment();
  
  for (const chatObj of chatsArray) {
    const friendId = chatObj.friendId;
    if (friendsUnicos.has(friendId)) continue;
    friendsUnicos.add(friendId);

    const friendPhotoUrl = userCache.getPhoto(friendId) || "./src/icon/default.jpg";
    const friendDisplayName = userCache.getName(friendId) || friendId;

    if (filtrarTermo && !friendDisplayName.toLowerCase().includes(filtrarTermo.toLowerCase())) continue;

    const btn = document.createElement("button");
    btn.className = "dm-user-btn";
    btn.innerHTML = `
      <img src="${friendPhotoUrl}" alt="Foto" onerror="this.src='./src/icon/default.jpg'" >
      <div class="dm-user-info">
        <span class="dm-user-name">${friendDisplayName}</span>
        <span class="dm-user-time">${tempoRelativo(chatObj.lastMessageTime)}</span>
      </div>
    `;
    btn.addEventListener("click", () => selecionarUsuario(friendId, friendPhotoUrl, friendDisplayName));
    fragment.appendChild(btn);
  }
  
  dmUsersList.appendChild(fragment);
}

function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = './src/icon/default.jpg';

  // Carregamento imediato do cache
  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto) {
    navPic.src = cachedPhoto;
  }

  // Validação em segundo plano
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userId = user.uid;
      try {
        const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
        const userMediaSnap = await getDoc(userMediaRef);

        if (userMediaSnap.exists()) {
          const userPhoto = userMediaSnap.data().userphoto || defaultPic;

          if (userPhoto !== cachedPhoto) {
            navPic.src = userPhoto;
            localStorage.setItem('user_photo_cache', userPhoto);
          }
        } else {
          navPic.src = defaultPic;
          localStorage.removeItem('user_photo_cache');
        }
      } catch (error) {
        console.error('Erro ao buscar foto:', error);
        if (!cachedPhoto) navPic.src = defaultPic;
      }
    } else {
      navPic.src = defaultPic;
      localStorage.removeItem('user_photo_cache');
    }
  });
}

document.addEventListener('DOMContentLoaded', carregarFotoPerfil);

// Busca conversas
dmSearchInput.addEventListener("input", () => {
  const termo = dmSearchInput.value.trim();
  renderizarConversas(chatsArray, termo);
});

dmSearchBtn.addEventListener("click", () => {
  const termo = dmSearchInput.value.trim();
  renderizarConversas(chatsArray, termo);
});

// Seleciona usuário e carrega chat
function selecionarUsuario(userId, photoUrl, displayName) {
  selectedUser = userId;
  document.querySelectorAll(".dm-user-btn").forEach(btn => btn.classList.remove("active"));
  const btn = Array.from(document.querySelectorAll(".dm-user-btn")).find(b => b.innerText.includes(displayName));
  if (btn) btn.classList.add("active");
  dmChatUserImg.src = photoUrl;
  dmChatUserName.textContent = displayName;
  dmChatUserName.setAttribute("data-userid", userId);
  carregarMensagensTempoReal();
  dmContainer.classList.add('show-chat');
  dmNavbar.style.display = "none";
  dmChatHeader.style.display = "flex";
}

// Botão de voltar para lista
dmBackBtn.addEventListener('click', () => {
  dmContainer.classList.remove('show-chat');
  selectedUser = null;
  dmMessages.innerHTML = `<div class="dm-no-chat">Selecione uma conversa para começar</div>`;
  document.querySelectorAll(".dm-user-btn").forEach(btn => btn.classList.remove("active"));
  dmNavbar.style.display = "";
  dmChatHeader.style.display = "none";
});

// Botão de voltar da navbar
dmListBackBtn.addEventListener('click', () => {
  window.history.back();
});

// Clique no nome do usuário no header leva ao perfil
dmChatUserName.addEventListener("click", () => {
  const userid = dmChatUserName.getAttribute("data-userid");
  if (userid) window.location.href = `pfmobile.html?userid=${userid}`;
});

// Marcar mensagens como lidas ao abrir o chat
async function marcarMensagensComoLidas(chatId, mensagens) {
  const promises = [];
  for (const m of mensagens) {
    if (m.sender !== loggedUser && !m.read) {
      const msgRef = doc(db, "chats", chatId, "messages", m.id);
      promises.push(updateDoc(msgRef, { read: true }));
    }
  }
  await Promise.all(promises);
}

// Carrega mensagens em tempo real
function carregarMensagensTempoReal() {
  if (unsubscribeMessages) unsubscribeMessages();
  dmMessages.innerHTML = "";
  if (!loggedUser || !selectedUser) {
    dmMessages.innerHTML = `<div class="dm-no-chat">Selecione uma conversa para começar</div>`;
    return;
  }
  const chatId = gerarChatId(loggedUser, selectedUser);
  const mensagensRef = collection(db, "chats", chatId, "messages");
  const mensagensQuery = query(mensagensRef, orderBy("timestamp", "asc"));
  unsubscribeMessages = onSnapshot(mensagensQuery, async (snapshot) => {
    let mensagens = [];
    snapshot.forEach((doc) => {
      const m = doc.data();
      m.id = doc.id;
      mensagens.push(m);
    });

    // Marcar como lidas as mensagens recebidas
    marcarMensagensComoLidas(chatId, mensagens);

    // Som de recebimento só para novas mensagens recebidas
    if (
      mensagens.length > ultimaQtdMensagens &&
      mensagens.length > 0 &&
      mensagens[mensagens.length - 1].sender !== loggedUser
    ) {
      audioReceive.play();
    }
    ultimaQtdMensagens = mensagens.length;

    renderizarMensagens(mensagens);
  });
}

// Renderiza mensagens
function renderizarMensagens(mensagens) {
  const fragment = document.createDocumentFragment();
  let lastSender = null;
  let bloco = null;

  // Encontrar o índice da última mensagem enviada pelo usuário
  let lastUserMsgIndex = -1;
  for (let i = mensagens.length - 1; i >= 0; i--) {
    if (mensagens[i].sender === loggedUser) {
      lastUserMsgIndex = i;
      break;
    }
  }

  mensagens.forEach((m, idx) => {
    const isSender = m.sender === loggedUser;

    // Quebra o bloco quando trocar o remetente
    if (m.sender !== lastSender) {
      bloco = document.createElement("div");
      bloco.className = "dm-msg-bloco " + (isSender ? "meu-bloco" : "deles-bloco");
      fragment.appendChild(bloco);
    }

    // Cria a bubble
    const bubble = document.createElement("div");
    bubble.className = "dm-msg-bubble " + (isSender ? "meu" : "deles");
    bubble.innerHTML = `<p>${m.content}</p>`;
    bloco.appendChild(bubble);

    // Foto da outra pessoa: somente na ÚLTIMA mensagem do bloco dela
    if (!isSender) {
      const next = mensagens[idx + 1];
      if (!next || next.sender === loggedUser) {
        const img = document.createElement("img");
        img.className = "dm-msg-foto";
        img.src = dmChatUserImg.src;
        bloco.appendChild(img);
      }
    }

    // Footer apenas na ÚLTIMA mensagem enviada por VOCÊ
    if (idx === lastUserMsgIndex) {
      const footer = document.createElement("div");
      footer.className = "dm-msg-footer";

      const time = formatarTempoRelativo(
        m.timestamp ? m.timestamp.toDate ? m.timestamp.toDate() : new Date(m.timestamp.seconds * 1000) : new Date()
      );

      const visto = m.read ? "• visto" : "• enviado";

      footer.innerHTML = `<span>${time}</span> <span class="dm-visto">${visto}</span>`;
      bloco.appendChild(footer);
    }

    lastSender = m.sender;
  });

  dmMessages.innerHTML = "";
  dmMessages.appendChild(fragment);
  dmMessages.scrollTop = dmMessages.scrollHeight;
}

function enviarMensagemHandler(e) {
  if (e) e.preventDefault();
  enviarMensagem();
}

let enviando = false;
let ultimoEnvio = 0;

async function enviarMensagem() {
  const agora = Date.now();
  if (enviando || (agora - ultimoEnvio < 700)) return;
  enviando = true;
  ultimoEnvio = agora;

  const conteudo = dmMsgInput.value.trim();
  if (!conteudo || !selectedUser) {
    enviando = false;
    return;
  }
  dmMsgInput.value = "";
  dmMsgInput.blur();

  const chatId = gerarChatId(loggedUser, selectedUser);
  const msgDocRef = doc(collection(db, "chats", chatId, "messages"));
  const msgData = {
    content: conteudo,
    sender: loggedUser,
    timestamp: serverTimestamp()
  };
  
  try {
    await Promise.all([
      setDoc(msgDocRef, msgData),
      updateDoc(doc(db, "chats", chatId), {
        lastMessage: conteudo,
        lastMessageTime: serverTimestamp()
      })
    ]);
    audioSend.play();
    conversasCache.clear(); // Limpa cache para atualizar lista
  } catch (err) {
    console.error('Erro ao enviar mensagem:', err);
  }
  enviando = false;
}

// Formata tempo relativo
function formatarTempoRelativo(date) {
  const agora = new Date();
  const diffMs = agora - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "agora";
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffHour < 24) return `há ${diffHour} h`;
  return `há ${diffDay} dia${diffDay > 1 ? "s" : ""}`;
}

function tempoRelativo(timestamp) {
  if (!timestamp) return "";
  const agora = Date.now();
  const diff = agora - timestamp;
  const segundos = Math.floor(diff / 1000);
  const minutos = Math.floor(segundos / 60);
  const horas = Math.floor(minutos / 60);
  const dias = Math.floor(horas / 24);

  if (dias > 0) return `Enviado há ${dias} dia${dias > 1 ? 's' : ''}`;
  if (horas > 0) return `Enviado há ${horas} h`;
  if (minutos > 0) return `Enviado há ${minutos} min`;
  return "Enviado agora mesmo";
}

// Eventos
dmSendBtn.addEventListener("click", enviarMensagemHandler);
dmMsgInput.addEventListener("keypress", function(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    enviarMensagemHandler(e);
  }
});

// Autenticação e inicialização
onAuthStateChanged(auth, async (user) => {
  if (user) {
    loggedUser = user.uid;
    
    // Busca nome do usuário logado do cache primeiro
    let displayName = userCache.getName(loggedUser) || loggedUser;
    dmTitle.textContent = displayName;
    
    // Atualiza em background
    const userDoc = await getDoc(doc(db, "users", loggedUser));
    if (userDoc.exists()) {
      const data = userDoc.data();
      const newName = data.displayname || data.username || loggedUser;
      userCache.setName(loggedUser, newName);
      dmTitle.textContent = newName;
    }
    
    carregarConversas();
  } else {
    window.location.href = "login.html";
  }
});