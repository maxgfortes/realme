// nt-notifications.js - Sistema de Notificações para nt.html
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDocs,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===================
// CRIAR NOTIFICAÇÃO
// ===================
export async function criarNotificacao(userId, dados) {
  const notifId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const notificacao = {
    id: notifId,
    userId: userId,
    type: dados.type, // 'like', 'comment', 'follow', 'nudge', 'message', 'system'
    fromUserId: dados.fromUserId || null,
    fromUserName: dados.fromUserName || 'Sistema',
    fromUserPhoto: dados.fromUserPhoto || './src/icon/default.jpg',
    title: dados.title,
    body: dados.body,
    url: dados.url || null,
    postId: dados.postId || null,
    read: false,
    createdAt: serverTimestamp()
  };

  await setDoc(doc(db, 'users', userId, 'notifications', notifId), notificacao);
  return notificacao;
}

// ===================
// NOTIFICAR LIKE
// ===================
export async function notificarLike(postOwnerId, likerUserId, postId) {
  if (postOwnerId === likerUserId) return;

  const likerData = await buscarDadosUsuario(likerUserId);
  
  await criarNotificacao(postOwnerId, {
    type: 'like',
    fromUserId: likerUserId,
    fromUserName: likerData.displayname || likerData.username,
    fromUserPhoto: likerData.userphoto,
    title: 'Nova curtida',
    body: `curtiu o seu post`,
    url: `/PF.html?userid=${postOwnerId}#post-${postId}`,
    postId: postId
  });
}

// ===================
// NOTIFICAR COMENTÁRIO
// ===================
export async function notificarComentario(postOwnerId, commenterUserId, postId) {
  if (postOwnerId === commenterUserId) return;

  const commenterData = await buscarDadosUsuario(commenterUserId);
  
  await criarNotificacao(postOwnerId, {
    type: 'comment',
    fromUserId: commenterUserId,
    fromUserName: commenterData.displayname || commenterData.username,
    fromUserPhoto: commenterData.userphoto,
    title: 'Novo comentário',
    body: `comentou no seu post`,
    url: `/PF.html?userid=${postOwnerId}#post-${postId}`,
    postId: postId
  });
}

// ===================
// NOTIFICAR SEGUIR
// ===================
export async function notificarSeguir(followedUserId, followerUserId) {
  const followerData = await buscarDadosUsuario(followerUserId);
  
  await criarNotificacao(followedUserId, {
    type: 'follow',
    fromUserId: followerUserId,
    fromUserName: followerData.displayname || followerData.username,
    fromUserPhoto: followerData.userphoto,
    title: 'Novo seguidor',
    body: `começou a seguir você`,
    url: `/PF.html?userid=${followerUserId}`
  });
}

// ===================
// NOTIFICAR NUDGE
// ===================
export async function notificarNudge(receiverId, senderId) {
  const senderData = await buscarDadosUsuario(senderId);
  
  await criarNotificacao(receiverId, {
    type: 'nudge',
    fromUserId: senderId,
    fromUserName: senderData.displayname || senderData.username,
    fromUserPhoto: senderData.userphoto,
    title: 'Nudge!',
    body: `enviou um nudge para você`,
    url: `/direct.html?chatid=chat-${senderId}`
  });
}

// ===================
// NOTIFICAR MENSAGEM
// ===================
export async function notificarMensagem(receiverId, senderId, mensagem) {
  const senderData = await buscarDadosUsuario(senderId);
  
  await criarNotificacao(receiverId, {
    type: 'message',
    fromUserId: senderId,
    fromUserName: senderData.displayname || senderData.username,
    fromUserPhoto: senderData.userphoto,
    title: 'Nova mensagem',
    body: mensagem.substring(0, 50) + (mensagem.length > 50 ? '...' : ''),
    url: `/direct.html?chatid=chat-${senderId}`
  });
}

// ===================
// BUSCAR DADOS DO USUÁRIO
// ===================
async function buscarDadosUsuario(userId) {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  let userData = userSnap.exists() ? userSnap.data() : {};

  const mediaRef = doc(db, 'users', userId, 'user-infos', 'user-media');
  const mediaSnap = await getDoc(mediaRef);
  if (mediaSnap.exists()) {
    userData.userphoto = mediaSnap.data().userphoto || './src/icon/default.jpg';
  }

  return userData;
}

// ===================
// CARREGAR E RENDERIZAR NOTIFICAÇÕES
// ===================
export function inicializarPaginaNotificacoes() {
  const container = document.querySelector('.notifications');
  if (!container) {
    console.error('Container de notificações não encontrado');
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    // Remove notificações de exemplo
    const items = container.querySelectorAll('.notification-item');
    items.forEach(item => item.remove());

    // Adiciona loading
    const loading = document.createElement('div');
    loading.className = 'notification-loading';
    loading.innerHTML = `
      <div class="loading-spinner"></div>
      <p>Carregando notificações...</p>
    `;
    container.appendChild(loading);

    // Monitora notificações em tempo real
    const notifRef = collection(db, 'users', user.uid, 'notifications');
    const q = query(notifRef, orderBy('createdAt', 'desc'), limit(50));

    onSnapshot(q, async (snapshot) => {
      // Remove loading
      loading.remove();

      // Remove notificações antigas
      container.querySelectorAll('.notification-item').forEach(item => item.remove());

      if (snapshot.empty) {
        container.innerHTML += `
          <div class="notification-item empty-state">
            <div class="notification-text">
              <i class="fas fa-bell-slash"></i>
              <p>Você ainda não tem notificações</p>
            </div>
          </div>
        `;
        return;
      }

      // Renderiza cada notificação
      for (const docSnap of snapshot.docs) {
        const notif = docSnap.data();
        const notifElement = await criarElementoNotificacao(notif, user.uid);
        container.appendChild(notifElement);
      }
    });
  });
}

// ===================   
// CRIAR ELEMENTO DE NOTIFICAÇÃO
// ===================
async function criarElementoNotificacao(notif, currentUserId) {
  const div = document.createElement('div');
  div.className = `notification-item ${!notif.read ? 'unread' : ''}`;
  div.setAttribute('data-notif-id', notif.id);

  const icone = getIconeNotificacao(notif.type);
  const tempo = formatarTempo(notif.createdAt);

  div.innerHTML = `
    <div class="notification-content">
      <img
        src="${notif.fromUserPhoto}"
        class="notification-avatar"
        alt="Avatar de ${notif.fromUserName}"
        onerror="this.src='./src/icon/default.jpg'"
      />

      <div class="notification-text">
        <p>
          ${icone}
          <b><i>${notif.fromUserName}</i></b> ${notif.body}
        </p>
      </div>
      <span class="notification-time">${tempo}</span>
    </div>
  `;

  div.style.cursor = 'pointer';

  div.addEventListener('click', async () => {
    if (!notif.read) {
      await marcarComoLida(currentUserId, notif.id);
      div.classList.remove('unread');
    }

    if (notif.url) {
      window.location.href = notif.url;
    }
  });

  return div;
}

// ===================
// ÍCONE POR TIPO
// ===================
function getIconeNotificacao(type) {
  const icones = {
    like: '<i class="fas fa-heart" style="color: #dc3545;"></i>',
    comment: '<i class="fas fa-comment" style="color: #28a745;"></i>',
    follow: '<i class="fas fa-user-plus" style="color: #4A90E2;"></i>',
    nudge: '<i class="fas fa-hand-point-right" style="color: #ffc107;"></i>',
    message: '<i class="fas fa-comments" style="color: #17a2b8;"></i>',
    system: '<i class="fa-solid fa-circle-info" style="color: #6c757d;"></i>'
  };
  return icones[type] || icones.system;
}

// ===================
// FORMATAR TEMPO
// ===================
function formatarTempo(timestamp) {
  if (!timestamp) return 'Agora';
  
  const now = new Date();
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Agora';
  if (minutes < 60) return `${minutes} minuto${minutes !== 1 ? 's' : ''} atrás`;
  if (hours < 24) return `${hours} hora${hours !== 1 ? 's' : ''} atrás`;
  if (days < 7) return `${days} dia${days !== 1 ? 's' : ''} atrás`;
  
  return date.toLocaleDateString('pt-BR');
}

// ===================
// MARCAR COMO LIDA
// ===================
async function marcarComoLida(userId, notifId) {
  const notifRef = doc(db, 'users', userId, 'notifications', notifId);
  await updateDoc(notifRef, { read: true });
}

// ===================
// BADGE DE NOTIFICAÇÕES (PARA NAVBAR)
// ===================
export function inicializarBadgeNotificacoes() {
  onAuthStateChanged(auth, (user) => {
    if (!user) return;

    const notifRef = collection(db, 'users', user.uid, 'notifications');
    const q = query(notifRef, where('read', '==', false));

    onSnapshot(q, (snapshot) => {
      const count = snapshot.size;
      
      // Atualiza todos os badges de notificação
      document.querySelectorAll('.notification-badge').forEach(badge => {
        if (count > 0) {
          badge.textContent = count > 99 ? '99+' : count;
          badge.style.display = 'inline-block';
        } else {
          badge.style.display = 'none';
        }
      });

      // Atualiza badge do app (iOS/PWA)
      if ('setAppBadge' in navigator) {
        navigator.setAppBadge(count);
      }
    });
  });
}

// CSS adicional para estado não lido
const style = document.createElement('style');
style.textContent = `
  .notification-item.unread {
    background: rgba(74, 144, 226, 0.1);
    border-left: 3px solid #4A90E2;
  }

  .notification-loading {
    text-align: center;
    padding: 40px 20px;
    color: #999;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: #4A90E2;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 15px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    text-align: center;
    padding: 40px 20px !important;
    cursor: default !important;
  }

  .empty-state i {
    font-size: 48px;
    opacity: 0.3;
    margin-bottom: 10px;
  }

  .notification-item {
    transition: all 0.3s ease;
  }

  .notification-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .notification-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #dc3545;
    color: white;
    border-radius: 10px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: bold;
    min-width: 18px;
    text-align: center;
    display: none;
  }

  /* Badge na navbar */
  nav a {
    position: relative;
  }
`;

document.head.appendChild(style);

async function atualizarMarqueeUltimoUsuario() {
  const lastUpdateRef = doc(db, "lastupdate", "latestUser");
  const docSnap = await getDoc(lastUpdateRef);
  const marquee = document.querySelector(".marquee");
  if (!marquee) return;
  if (docSnap.exists()) {
    const data = docSnap.data();
    const nomeUsuario = data.username || "Usuário";
    marquee.textContent = `${nomeUsuario} acabou de entrar no RealMe!`;
  } else {
    marquee.textContent = "Bem-vindo ao RealMe!";
  }
}

document.addEventListener('DOMContentLoaded', atualizarMarqueeUltimoUsuario);