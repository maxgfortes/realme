import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Configuração do Firebase (usar a mesma do seu projeto)
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
// REGISTRO DO SERVICE WORKER
// ===================
async function registrarServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      console.log('Service Worker registrado:', registration);
      return registration;
    } catch (error) {
      console.error('Erro ao registrar Service Worker:', error);
    }
  }
}

// ===================
// SOLICITAR PERMISSÃO PARA NOTIFICAÇÕES
// ===================
async function solicitarPermissaoNotificacoes() {
  if (!('Notification' in window)) {
    console.log('Este navegador não suporta notificações');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// ===================
// CRIAR NOTIFICAÇÃO
// ===================
async function criarNotificacao(userId, dados) {
  const notifId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const notificacao = {
    id: notifId,
    userId: userId,
    type: dados.type, // 'like', 'comment', 'follow', 'nudge', 'message'
    fromUserId: dados.fromUserId,
    fromUserName: dados.fromUserName,
    fromUserPhoto: dados.fromUserPhoto,
    title: dados.title,
    body: dados.body,
    icon: dados.icon || './src/icon/icon-192x192.png',
    url: dados.url || '/',
    postId: dados.postId || null,
    read: false,
    createdAt: serverTimestamp()
  };

  await setDoc(doc(db, 'users', userId, 'notifications', notifId), notificacao);
  return notificacao;
}

// ===================
// ENVIAR NOTIFICAÇÃO DE LIKE
// ===================
export async function notificarLike(postOwnerId, likerUserId, postId) {
  if (postOwnerId === likerUserId) return; // Não notifica se curtiu próprio post

  const likerData = await buscarDadosUsuario(likerUserId);
  
  await criarNotificacao(postOwnerId, {
    type: 'like',
    fromUserId: likerUserId,
    fromUserName: likerData.displayname || likerData.username,
    fromUserPhoto: likerData.userphoto,
    title: 'Nova curtida',
    body: `${likerData.displayname || likerData.username} curtiu seu post`,
    url: `/PF.html?userid=${postOwnerId}#post-${postId}`,
    postId: postId
  });
}

// ===================
// ENVIAR NOTIFICAÇÃO DE COMENTÁRIO
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
    body: `${commenterData.displayname || commenterData.username} comentou no seu post`,
    url: `/PF.html?userid=${postOwnerId}#post-${postId}`,
    postId: postId
  });
}

// ===================
// ENVIAR NOTIFICAÇÃO DE SEGUIR
// ===================
export async function notificarSeguir(followedUserId, followerUserId) {
  const followerData = await buscarDadosUsuario(followerUserId);
  
  await criarNotificacao(followedUserId, {
    type: 'follow',
    fromUserId: followerUserId,
    fromUserName: followerData.displayname || followerData.username,
    fromUserPhoto: followerData.userphoto,
    title: 'Novo seguidor',
    body: `${followerData.displayname || followerData.username} começou a seguir você`,
    url: `/PF.html?userid=${followerUserId}`
  });
}

// ===================
// ENVIAR NOTIFICAÇÃO DE NUDGE
// ===================
export async function notificarNudge(receiverId, senderId) {
  const senderData = await buscarDadosUsuario(senderId);
  
  await criarNotificacao(receiverId, {
    type: 'nudge',
    fromUserId: senderId,
    fromUserName: senderData.displayname || senderData.username,
    fromUserPhoto: senderData.userphoto,
    title: 'Nudge!',
    body: `${senderData.displayname || senderData.username} enviou um nudge para você`,
    url: `/direct.html?chatid=chat-${senderId}`
  });
}

// ===================
// ENVIAR NOTIFICAÇÃO DE MENSAGEM
// ===================
export async function notificarMensagem(receiverId, senderId, mensagem) {
  const senderData = await buscarDadosUsuario(senderId);
  
  await criarNotificacao(receiverId, {
    type: 'message',
    fromUserId: senderId,
    fromUserName: senderData.displayname || senderData.username,
    fromUserPhoto: senderData.userphoto,
    title: 'Nova mensagem',
    body: `${senderData.displayname || senderData.username}: ${mensagem.substring(0, 50)}${mensagem.length > 50 ? '...' : ''}`,
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

  // Busca foto no subdocumento
  const mediaRef = doc(db, 'users', userId, 'user-infos', 'user-media');
  const mediaSnap = await getDoc(mediaRef);
  if (mediaSnap.exists()) {
    userData.userphoto = mediaSnap.data().userphoto || './src/icon/default.jpg';
  }

  return userData;
}

// ===================
// MONITORAR NOTIFICAÇÕES EM TEMPO REAL
// ===================
export function monitorarNotificacoes(userId, callback) {
  const notifRef = collection(db, 'users', userId, 'notifications');
  const q = query(notifRef, orderBy('createdAt', 'desc'), limit(20));

  return onSnapshot(q, snapshot => {
    const notifications = [];
    snapshot.forEach(doc => {
      notifications.push({ id: doc.id, ...doc.data() });
    });
    callback(notifications);
  });
}

// ===================
// MARCAR NOTIFICAÇÃO COMO LIDA
// ===================
export async function marcarComoLida(userId, notifId) {
  const notifRef = doc(db, 'users', userId, 'notifications', notifId);
  await updateDoc(notifRef, { read: true });
}

// ===================
// MARCAR TODAS COMO LIDAS
// ===================
export async function marcarTodasComoLidas(userId) {
  const notifRef = collection(db, 'users', userId, 'notifications');
  const q = query(notifRef, where('read', '==', false));
  const snapshot = await getDocs(q);

  const promises = [];
  snapshot.forEach(doc => {
    promises.push(updateDoc(doc.ref, { read: true }));
  });

  await Promise.all(promises);
}

// ===================
// CONTAR NOTIFICAÇÕES NÃO LIDAS
// ===================
export async function contarNaoLidas(userId) {
  const notifRef = collection(db, 'users', userId, 'notifications');
  const q = query(notifRef, where('read', '==', false));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

// ===================
// INICIALIZAR SISTEMA DE NOTIFICAÇÕES
// ===================
export async function inicializarNotificacoes() {
  // Registra Service Worker
  await registrarServiceWorker();

  // Solicita permissão
  const permissao = await solicitarPermissaoNotificacoes();
  
  if (!permissao) {
    console.log('Permissão de notificações negada');
    return false;
  }

  // Monitora autenticação
  onAuthStateChanged(auth, user => {
    if (user) {
      // Inicia monitoramento de notificações
      monitorarNotificacoes(user.uid, atualizarBadgeNotificacoes);
    }
  });

  return true;
}

// ===================
// ATUALIZAR BADGE DE NOTIFICAÇÕES
// ===================
function atualizarBadgeNotificacoes(notifications) {
  const naoLidas = notifications.filter(n => !n.read).length;
  
  // Atualiza badge no ícone da navbar
  const badge = document.querySelector('.notification-badge');
  if (badge) {
    if (naoLidas > 0) {
      badge.textContent = naoLidas > 99 ? '99+' : naoLidas;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // Atualiza badge do app (iOS)
  if ('setAppBadge' in navigator) {
    navigator.setAppBadge(naoLidas);
  }
}

// ===================
// MOSTRAR NOTIFICAÇÃO LOCAL
// ===================
export function mostrarNotificacaoLocal(titulo, corpo, icone, url) {
  if (Notification.permission === 'granted') {
    const notification = new Notification(titulo, {
      body: corpo,
      icon: icone || './src/icon/icon-192x192.png',
      badge: './src/icon/badge-72x72.png',
      vibrate: [200, 100, 200]
    });

    notification.onclick = () => {
      window.focus();
      if (url) window.location.href = url;
      notification.close();
    };
  }
}

// Inicializa quando o script carrega
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarNotificacoes);
} else {
  inicializarNotificacoes();
}