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

// Gera chatId
function gerarChatId(user1, user2) {
  return `chat-${[user1, user2].sort().join("-")}`;
}

// Carrega lista de conversas
async function carregarConversas(filtrarTermo = "") {
  dmUsersList.querySelectorAll(".dm-user-btn").forEach(e => e.remove());
  if (!loggedUser) return;
  const chatsRef = collection(db, "chats");
  const q = query(chatsRef, where("participants", "array-contains", loggedUser));
  const chatsSnap = await getDocs(q);

  chatsArray = [];
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
      }
    }
  }
  chatsArray.sort((a, b) => b.lastMessageTime - a.lastMessageTime);

  allChats = chatsArray;

  const friendsUnicos = new Set();
  for (const chatObj of chatsArray) {
    const friendId = chatObj.friendId;
    if (friendsUnicos.has(friendId)) continue;
    friendsUnicos.add(friendId);

    let friendPhotoUrl = "./src/icon/default.jpg";
    let friendDisplayName = friendId;
    try {
      const friendMediaDoc = await getDoc(doc(db, "users", friendId, "user-infos", "user-media"));
      if (friendMediaDoc.exists()) {
        const data = friendMediaDoc.data();
        if (data.userphoto) friendPhotoUrl = data.userphoto;
      }
      const friendDoc = await getDoc(doc(db, "users", friendId));
      if (friendDoc.exists()) {
        const data = friendDoc.data();
        friendDisplayName = data.displayname || data.username || friendId;
      }
    } catch (error) {}

    if (filtrarTermo && !friendDisplayName.toLowerCase().includes(filtrarTermo.toLowerCase())) continue;

    const btn = document.createElement("button");
    btn.className = "dm-user-btn";
    btn.innerHTML = `
      <img src="${friendPhotoUrl}" alt="Foto">
      <div class="dm-user-info">
        <span class="dm-user-name">${friendDisplayName}</span>
        <span class="dm-user-time">${tempoRelativo(chatObj.lastMessageTime)}</span>
      </div>
    `;
    btn.addEventListener("click", () => selecionarUsuario(friendId, friendPhotoUrl, friendDisplayName));
    dmUsersList.appendChild(btn);
  }
}

function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic'); // Elemento da foto de perfil na navbar

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userId = user.uid; // Obtém o ID do usuário logado
      try {
        // Busca a URL da foto de perfil no Firestore
        const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
        const userMediaSnap = await getDoc(userMediaRef);

        if (userMediaSnap.exists()) {
          const userPhoto = userMediaSnap.data().userphoto || './src/icon/default.jpg';
          navPic.src = userPhoto; // Atualiza a foto de perfil na navbar
        } else {
          console.warn('Foto de perfil não encontrada. Usando a padrão.');
          navPic.src = './src/icon/default.jpg';
        }
      } catch (error) {
        console.error('Erro ao carregar a foto de perfil:', error);
        navPic.src = './src/icon/default.jpg'; // Usa a foto padrão em caso de erro
      }
    } else {
      console.warn('Usuário não autenticado.');
      navPic.src = './src/icon/default.jpg'; // Usa a foto padrão se não estiver logado
    }
  });
}

// Chama a função ao carregar a página
document.addEventListener('DOMContentLoaded', carregarFotoPerfil);

// Busca conversas
dmSearchInput.addEventListener("input", () => {
  const termo = dmSearchInput.value.trim();
  carregarConversas(termo);
});
dmSearchBtn.addEventListener("click", () => {
  const termo = dmSearchInput.value.trim();
  carregarConversas(termo);
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

// Botão de voltar da navbar (opcional, para mobile)
dmListBackBtn.addEventListener('click', () => {
  window.history.back();
});

// Clique no nome do usuário no header leva ao perfil
dmChatUserName.addEventListener("click", () => {
  const userid = dmChatUserName.getAttribute("data-userid");
  if (userid) window.location.href = `pfmobile.html?userid=${userid}`;
});

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

    // Som de recebimento só para novas mensagens recebidas
    if (
      mensagens.length > ultimaQtdMensagens &&
      mensagens.length > 0 &&
      mensagens[mensagens.length - 1].sender !== loggedUser
    ) {
      audioReceive.play();
    }
    ultimaQtdMensagens = mensagens.length;

    dmMessages.innerHTML = "";

let lastSender = null;
let bloco = null;

mensagens.forEach((m, idx) => {
    const isSender = m.sender === loggedUser;
    const isLastMsg = idx === mensagens.length - 1;

    // Quebra o bloco quando trocar o remetente
    if (m.sender !== lastSender) {
        bloco = document.createElement("div");
        bloco.className = "dm-msg-bloco " + (isSender ? "meu-bloco" : "deles-bloco");
        dmMessages.appendChild(bloco);
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
    if (isSender && isLastMsg) {
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

dmMessages.scrollTop = dmMessages.scrollHeight;

  });
}



function enviarMensagemHandler(e) {
  if (e) e.preventDefault();
  enviarMensagem();
}



let enviando = false;
let ultimoEnvio = 0;

async function enviarMensagem() {
  const agora = Date.now();
  // Bloqueio por tempo: só permite enviar se passou pelo menos 700ms do último envio
  if (enviando || (agora - ultimoEnvio < 700)) return;
  enviando = true;
  ultimoEnvio = agora;

  const conteudo = dmMsgInput.value.trim();
  if (!conteudo || !selectedUser) {
    enviando = false;
    return;
  }
  dmMsgInput.value = "";
  dmMsgInput.blur(); // Remove foco para evitar disparos extras

  const chatId = gerarChatId(loggedUser, selectedUser);
  const msgDocRef = doc(collection(db, "chats", chatId, "messages"));
  const msgData = {
    content: conteudo,
    sender: loggedUser,
    timestamp: serverTimestamp()
  };
  try {
    await setDoc(msgDocRef, msgData);
    const chatRef = doc(db, "chats", chatId);
    await updateDoc(chatRef, {
      lastMessage: conteudo,
      lastMessageTime: serverTimestamp()
    });
    audioSend.play();
  } catch (err) {
    // erro opcional
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



// Eventos (registrados só uma vez)
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
    // Busca nome do usuário logado
    const userDoc = await getDoc(doc(db, "users", loggedUser));
    let displayName = loggedUser;
    if (userDoc.exists()) {
      const data = userDoc.data();
      displayName = data.displayname || data.username || loggedUser;
    }
    dmTitle.textContent = displayName;
    carregarConversas();
  } else {
    window.location.href = "login.html";
  }
});