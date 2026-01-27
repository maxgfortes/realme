import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  increment,
  serverTimestamp,
  where,
  deleteDoc
  
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getMessaging,
  getToken,
  onMessage
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

import {
  query,
  orderBy,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { 
  toggleSalvarPost, 
  verificarSeEstaSalvo 
} from './save-posts.js';

let lastPostSnapshot = null; 
let allItems = []; 

// ConfiguraÃ§Ã£o do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const IMGBB_API_KEY = 'fc8497dcdf559dc9cbff97378c82344c';

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
// Messaging (push)
let messaging;

// PUBLIC_VAPID_KEY: prefer reading from `window.PUBLIC_VAPID_KEY` (set by `src/js/config.js`),
// fallback to the in-file key below if not provided.
const PUBLIC_VAPID_KEY = (typeof window !== 'undefined' && window.PUBLIC_VAPID_KEY) ? window.PUBLIC_VAPID_KEY : 'BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg';

/**
 * Pede permissão de notificações, obtém token FCM (web) e salva em Firestore
 * Usa Firebase Messaging (getToken) com a VAPID public key.
 */
async function registerForPushNotifications(uid) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return;

    // inicializa messaging se necessário
    if (!messaging) messaging = getMessaging(app);

    const token = await getToken(messaging, { vapidKey: PUBLIC_VAPID_KEY });
    if (!token) return;

    // salva token no documento do usuário (pushTokens array)
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    const data = userSnap.exists() ? userSnap.data() : {};
    const tokens = Array.isArray(data.pushTokens) ? data.pushTokens : [];
    if (!tokens.includes(token)) {
      tokens.push(token);
      await setDoc(userRef, { pushTokens: tokens }, { merge: true });
    }

    // Escuta mensagens em foreground
    onMessage(messaging, (payload) => {
      console.log('Mensagem recebida em foreground:', payload);
      // Opcional: mostrar toast no app
      if (payload && payload.notification) {
        const title = payload.notification.title || '';
        const body = payload.notification.body || '';
        // mostrar notificação local (apenas UI) para o usuário
        try {
          new Notification(title, { body });
        } catch (e) {}
      }
    });

  } catch (err) {
    console.error('Erro ao registrar push:', err);
  }
}

// Elementos DOM
const feed = document.getElementById('feed');
const loadMoreBtn = document.getElementById('load-more-btn');
const postInput = document.querySelector('.post-box input[type="text"]');
const postButton = document.querySelector('.post-button');

// ConfiguraÃ§Ãµes
const POSTS_LIMIT = 10;
let lastVisible = null;
let loading = false;
let allPosts = [];
let currentPage = 0;
let hasMorePosts = true;

// Lista de domÃ­nios maliciosos conhecidos
const DOMINIOS_MALICIOSOS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 't.co',
  'phishing-example.com', 'malware-site.net', 'scam-website.org'
];







// ===================
// SISTEMA DE POP-UPS
// ===================
function criarPopup(titulo, mensagem, tipo = 'info') {
  const popupExistente = document.querySelector('.custom-popup');
  if (popupExistente) {
    popupExistente.remove();
  }
  const popup = document.createElement('div');
  popup.className = `custom-popup ${tipo}`;
  const iconMap = {
    'success': 'fas fa-check-circle',
    'error': 'fas fa-exclamation-circle',
    'warning': 'fas fa-exclamation-triangle',
    'info': 'fas fa-info-circle'
  };
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <i class="${iconMap[tipo] || iconMap.info}"></i>
        <h3>${titulo}</h3>
      </div>
      <div class="popup-body">
        <p>${mensagem}</p>
      </div>
      <div class="popup-footer">
        <button class="popup-btn popup-btn-primary" onclick="this.closest('.custom-popup').remove()">
          OK
        </button>
      </div>
    </div>
    <div class="popup-overlay" onclick="this.closest('.custom-popup').remove()"></div>
  `;
  document.body.appendChild(popup);
  if (tipo === 'success') {
    setTimeout(() => {
      if (popup.parentNode) {
        popup.remove();
      }
    }, 5000);
  }
  return popup;
}

function mostrarPopupConfirmacao(titulo, mensagem, callback) {
  const popup = document.createElement('div');
  popup.className = 'custom-popup warning';
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <i class="fas fa-question-circle"></i>
        <h3>${titulo}</h3>
      </div>
      <div class="popup-body">
        <p>${mensagem}</p>
      </div>
      <div class="popup-footer">
        <button class="popup-btn popup-btn-secondary" onclick="this.closest('.custom-popup').remove()">
          Cancelar
        </button>
        <button class="popup-btn popup-btn-primary" id="popup-confirm-btn">
          Confirmar
        </button>
      </div>
    </div>
    <div class="popup-overlay" onclick="this.closest('.custom-popup').remove()"></div>
  `;
  document.body.appendChild(popup);
  const confirmBtn = popup.querySelector('#popup-confirm-btn');
  confirmBtn.addEventListener('click', () => {
    popup.remove();
    if (callback) callback();
  });
  return popup;
}


function criarModalDenuncia({targetType, targetId, targetPath, targetOwnerId, targetOwnerUsername}) {
  const modalExistente = document.querySelector('.modal-denuncia');
  if (modalExistente) modalExistente.remove();

  const modal = document.createElement('div');
  modal.className = 'modal-denuncia';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Denunciar conteúdo</h2>
      <form id="formDenuncia">
        <label>Categoria:</label>
        <select name="category" required>
          <option value="inappropriate_content">Conteúdo impróprio</option>
        </select>
        <label>Subcategoria:</label>
        <select name="subcategory" required>
          <option value="nudity">Nudez</option>
          <option value="violence">Violência</option>
          <option value="hate_speech">Discurso de ódio</option>
          <option value="spam">Spam</option>
          <option value="other">Outro</option>
        </select>
        <label>Motivo (opcional):</label>
        <input type="text" name="reason" maxlength="120" placeholder="Descreva o motivo (opcional)">
        <label>Descrição detalhada (opcional):</label>
        <textarea name="description" rows="3" maxlength="500" placeholder="Descreva o problema (opcional)"></textarea>
        <div class="modal-actions">
          <button type="button" class="btn-cancel">Cancelar</button>
          <button type="submit" class="btn-submit">Enviar denúncia</button>
        </div>
      </form>
    </div>
    <div class="modal-overlay"></div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('.btn-cancel').onclick = () => modal.remove();
  modal.querySelector('.modal-overlay').onclick = () => modal.remove();

  modal.querySelector('#formDenuncia').onsubmit = async (e) => {
    e.preventDefault();
    const usuarioLogado = auth.currentUser;
    if (!usuarioLogado) {
      criarPopup('Erro', 'Você precisa estar logado para denunciar.', 'warning');
      modal.remove();
      return;
    }
    const form = e.target;
    const category = form.category.value;
    const subcategory = form.subcategory.value;
    const reason = form.reason.value.trim();
    const description = form.description.value.trim();

    // Só permite uma denúncia por usuário por post
    const reportsRef = collection(db, 'reports');
    const q = query(
      reportsRef,
      where('targetType', '==', targetType),
      where('targetId', '==', targetId),
      where('reporterId', '==', usuarioLogado.uid)
    );
    const existing = await getDocs(q);
    if (!existing.empty) {
      criarPopup('Atenção', 'Você já denunciou este conteúdo.', 'warning');
      modal.remove();
      return;
    }

    // Dados do denunciante
    let reporterUsername = "cache";
    let reporterEmail = "cache";
    try {
      const userData = await buscarDadosUsuarioPorUid(usuarioLogado.uid);
      reporterUsername = userData?.username || usuarioLogado.displayName || usuarioLogado.email || "cache";
      reporterEmail = usuarioLogado.email || "cache";
    } catch {}

    // Monta o objeto de denúncia
    const reportId = gerarIdUnico('rep');
    const reportData = {
      reportId,
      createdAt: serverTimestamp(),
      targetType,
      targetId,
      targetPath,
      targetOwnerId,
      targetOwnerUsername,
      reporterId: usuarioLogado.uid,
      reporterUsername,
      reporterEmail,
      isAnonymous: false,
      category,
      subcategory,
      reason,
      description,
      evidence: [],
      status: "open",
      priority: "medium",
      severity: 2
    };

    try {
      const reportRef = doc(db, 'reports', reportId);
      await setDoc(reportRef, reportData);

      // Checa se já existem 8 denúncias para este post
      const q2 = query(
  reportsRef,
  where('targetType', '==', targetType),
  where('targetId', '==', targetId)
);
const snap = await getDocs(q2);
// Use o ID do documento do post, não o campo postid
const postRef = doc(db, 'posts', targetId);
if ((await getDoc(postRef)).exists() && snap.size >= 8) {
  await updateDoc(postRef, { visible: false });
}

      modal.querySelector('.modal-content').innerHTML = `
        <h2>Denúncia enviada</h2>
        <p>Sua denúncia foi registrada e será analisada pela equipe.</p>
        <div style="text-align:center;margin-top:20px;">
          <button class="btn-ok" style="padding:8px 24px;border-radius:6px;background:#4A90E2;color:#fff;border:none;font-size:1em;cursor:pointer;">OK</button>
        </div>
      `;
      modal.querySelector('.btn-ok').onclick = () => modal.remove();
    } catch (error) {
      criarPopup('Erro', 'Não foi possível enviar a denúncia.', 'error');
      modal.remove();
    }
  };
}

// CSS do modal de denúncia
(function adicionarEstiloModalDenuncia() {
  if (document.getElementById('modal-denuncia-css')) return;
  const style = document.createElement('style');
  style.id = 'modal-denuncia-css';
  style.textContent = `
    .modal-denuncia {
      position: fixed; z-index: 100000000001; top: 0; left: 0; width: 100vw; height: 100vh;
      display: flex; align-items: center; justify-content: center;
    }
    .modal-denuncia .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.5);
    }
    .modal-denuncia .modal-content {
      background: #232323; color: #fff; border-radius: 12px; padding: 28px 24px 18px 24px;
      min-width: 320px; max-width: 95vw; box-shadow: 0 8px 32px #000a;
      position: relative; z-index: 2;
    }
    .modal-denuncia h2 { margin-top: 0; font-size: 1.3em; }
    .modal-denuncia label { display: block; margin: 12px 0 4px 0; font-size: 0.98em; }
    .modal-denuncia select, .modal-denuncia input[type="text"], .modal-denuncia textarea {
      width: 100%; padding: 7px 10px; border-radius: 6px; border: 1px solid #444; background: #181818; color: #fff;
      margin-bottom: 6px; font-size: 1em;
    }
    .modal-denuncia textarea { resize: none;
      height: 100px;
    .modal-denuncia .modal-actions {
      display: flex; justify-content: flex-end; gap: 10px; margin-top: 12px;
    }
    .modal-denuncia .btn-cancel, .modal-denuncia .btn-submit {
      padding: 7px 18px; border-radius: 6px; border: none; font-size: 1em; cursor: pointer;
    }
    .modal-denuncia .btn-cancel { background: #444; color: #fff; }
    .modal-denuncia .btn-submit { background: #e74c3c; color: #fff; }
    .modal-denuncia .btn-submit:hover { background: #c0392b; }
  `;
  document.head.appendChild(style);
})();


// ===================
// ANIMAÃ‡ÃƒO DO AVIÃƒO DE PAPEL
// ===================
function criarAnimacaoAviaoPapel() {
  const aviao = document.createElement('div');
  aviao.className = 'aviao-papel';
  aviao.innerHTML = '<i class="fas fa-paper-plane"></i>';
  aviao.style.cssText = `
    position: fixed;
    left: -50px;
    top: 50%;
    z-index: 10000;
    font-size: 196px;
    color: #ffffffff;
    animation: voarAviao 1s ease-in-out forwards;
    pointer-events: none;
  `;
  if (!document.querySelector('#aviao-animation-style')) {
    const style = document.createElement('style');
    style.id = 'aviao-animation-style';
    style.textContent = `
      @keyframes voarAviao {
        0% { left: -50px; transform: rotate(0deg) translateY(0px); opacity: 1; }
        25% { transform: rotate(5deg) translateY(-10px); }
        50% { transform: rotate(-3deg) translateY(5px); }
        75% { transform: rotate(2deg) translateY(-5px); }
        100% { left: calc(100% + 50px); transform: rotate(0deg) translateY(0px); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  document.body.appendChild(aviao);
  setTimeout(() => {
    if (aviao.parentNode) {
      aviao.remove();
    }
  }, 2000);
}

// ===================
// DETECTAR E FORMATAR HASHTAGS
// ===================
function formatarHashtags(texto) {
  return texto.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
}

// ===================
// DETECTAR LINKS MALICIOSOS
// ===================
function detectarLinksMaliciosos(texto) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const urls = texto.match(urlRegex) || [];
  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname.toLowerCase();
      if (DOMINIOS_MALICIOSOS.some(domain => hostname.includes(domain))) {
        return { malicioso: true, url: url };
      }
      const padroesSuspeitos = [
        /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/,
        /[a-z0-9]{20,}\./,
        /\.tk$|\.ml$|\.ga$|\.cf$/,
      ];
      if (padroesSuspeitos.some(pattern => pattern.test(hostname))) {
        return { malicioso: true, url: url };
      }
    } catch (e) {
      return { malicioso: true, url: url };
    }
  }
  return { malicioso: false };
}


// ===================
// SISTEMA DE LOADING
// ===================
function mostrarLoading(texto = 'Carregando...') {
  let loadingBar = document.querySelector('.loading-bar');
  if (!loadingBar) {
    loadingBar = document.createElement('div');
    loadingBar.className = 'loading-bar';
    loadingBar.innerHTML = `
      <div class="loading-progress"></div>
      <div class="loading-text">${texto}</div>
    `;
    document.body.appendChild(loadingBar);
  } else {
    loadingBar.querySelector('.loading-text').textContent = texto;
  }
  loadingBar.classList.add('active');
  const progress = loadingBar.querySelector('.loading-progress');
  progress.style.width = '0%';
  let width = 0;
  const interval = setInterval(() => {
    width += Math.random() * 15;
    if (width > 90) width = 90;
    progress.style.width = width + '%';
  }, 100);
  return { loadingBar, interval };
}

function esconderLoading() {
  const loadingBar = document.querySelector('.loading-bar');
  if (loadingBar) {
    const progress = loadingBar.querySelector('.loading-progress');
    progress.style.width = '100%';
    setTimeout(() => {
      loadingBar.classList.remove('active');
    }, 300);
  }
}

function atualizarTextoLoading(texto) {
  const loadingText = document.querySelector('.loading-text');
  if (loadingText) {
    loadingText.textContent = texto;
  }
}

// ===================
// TOCAR SOM DE ENVIO
// ===================
function tocarSomEnvio() {
  try {
    const audio = new Audio('./src/audio/send.mp3');
    audio.volume = 0.5;
    audio.play().catch(error => {
      console.warn("Não foi possível reproduzir o som de envio:", error);
    });
  } catch (error) {
    console.warn("Erro ao criar/tocar áudio:", error);
  }
}


// JS
//document.addEventListener("DOMContentLoaded", () => {
//  const searchBar = document.getElementById("mobileSearchBar");
//  let shown = false;

//  window.addEventListener("scroll", () => {
//    if (!shown && window.scrollY > 50) { 
      // ao rolar 50px para cima, mostra
//      searchBar.classList.add("visible");
//      shown = true; // garante que fique para sempre
//    }
//  });
//});

// ===================
// VERIFICAR LOGIN COM AUTH
// ===================
function verificarLogin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        criarPopup('Acesso Negado', 'VocÃª precisa estar logado para acessar esta pÃ¡gina.', 'warning');
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
        resolve(null);
      } else {
        resolve(user);
      }
      loadPosts();
    });
  });
}

// ===================
// GERAR ID UNICO
// ===================
function gerarIdUnico(prefixo = 'id') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `${prefixo}-${timestamp}${random}`;
}

// ===================
// BUSCAR DADOS DO USUÃRIO POR UID
// ===================
async function buscarDadosUsuarioPorUid(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) return null;
    const userData = docSnap.data();

    // Busca userphoto
    let userphoto = '';
    try {
      const photoRef = doc(db, "users", uid, "user-infos", "user-media");
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        userphoto = photoSnap.data().userphoto || '';
      }
    } catch {}

    return {
      userphoto,
      username: userData.username || '',
      displayname: userData.displayname || '',
      verified: userData.verified || false
    };
  } catch (error) {
    console.error("Erro ao buscar dados do usuário:", error);
    return null;
  }
}


function configurarScrollInfinito() {
  window.addEventListener('scroll', async () => {
    // 1. Cálculo da posição atual do scroll
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    // 2. Definir uma margem para carregar antes de chegar ao fim (ex: 300px)
    const threshold = 300;

    if (scrollTop + windowHeight >= documentHeight - threshold) {
      
      // Verifica qual DIV de feed está visível no momento
      const divFirebase = document.getElementById('feed');
      const divMastodon = document.getElementById('feed2');

      // Lógica para o Feed do Firebase (ID: feed)
      if (divFirebase && window.getComputedStyle(divFirebase).display !== 'none') {
        if (!loading && hasMorePosts) {
          console.log("A carregar mais posts do Firebase...");
          await loadPosts();
        }
      }

      // Lógica para o Feed do Mastodon (ID: feed2)
      if (divMastodon && window.getComputedStyle(divMastodon).display !== 'none') {
        // Nota: no seu código original verificava 'block', mas 'none' é mais seguro
        if (!loadingMastodon) {
          console.log("A carregar mais posts do Mastodon...");
          await carregarFeedMastodon(true); 
        }
      }
    }
  });
}

// ===================
// CARREGAR COMENTÃRIOS - VERSÃO CORRIGIDA
// ===================
async function carregarComentarios(postId) {
  try {
    const comentariosRef = collection(db, 'posts', postId, 'coments');
    const comentariosSnapshot = await getDocs(comentariosRef);
    const comentarios = [];
    
    for (const comentarioDoc of comentariosSnapshot.docs) {
      const comentarioData = comentarioDoc.data();
      const userData = await buscarDadosUsuarioPorUid(comentarioData.senderid);
      comentarios.push({
        id: comentarioDoc.id,
        userData: userData,
        ...comentarioData
      });
    }
    
    // ORDENAÇÃO CORRIGIDA - Comentários do mais antigo para o mais recente
    // ORDENAÇÃO CORRIGIDA - Comentários do mais antigo para o mais recente
comentarios.sort((a, b) => {
  if (!a.create || !b.create) return 0;
  let dataA, dataB;
  if (typeof a.create === 'object' && a.create.seconds) {
    dataA = a.create.seconds;
  } else {
    dataA = new Date(a.create).getTime() / 1000;
  }
  if (typeof b.create === 'object' && b.create.seconds) {
    dataB = b.create.seconds;
  } else {
    dataB = new Date(b.create).getTime() / 1000;
  }
  return dataA - dataB; // Do mais antigo para o mais recente
});
    
    return comentarios;
  } catch (error) {
    console.error("Erro ao carregar comentários:", error);
    return [];
  }
}

// ===================
// RENDERIZAR COMENTÃRIOS
// ===================
async function renderizarComentarios(uid, postId, container) {
  const loadingInfo = mostrarLoading('Carregando comentários...');
  try {
    const comentarios = await carregarComentarios(postId);
    container.innerHTML = '';
    if (comentarios.length === 0) {
      container.innerHTML = '<p class="no-comments">Nenhum comentario ainda.</p>';
    } else {
      comentarios.forEach(comentario => {
        const nomeParaExibir = comentario.userData?.displayname || comentario.userData?.username || comentario.senderid;
        const usernameParaExibir = comentario.userData?.username ? `@${comentario.userData.username}` : '';
        const fotoUsuario = comentario.userData?.userphoto || obterFotoPerfil(comentario.userData, null);
        const conteudoFormatado = formatarHashtags(comentario.content);
        const isVerified = comentario.userData?.verified ? '<i class="fas fa-check-circle" style="margin-left: 4px; font-size: 0.85em; color: var(--verified-blue)"></i>' : '';
        const comentarioEl = document.createElement('div');
        comentarioEl.className = 'comentario-item';
        comentarioEl.innerHTML = `
          <div class="comentario-header">
            <img src="${fotoUsuario}" alt="Avatar" class="comentario-avatar"
                 onerror="this.src='./src/icon/default.jpg'" />
            <div class="comentario-meta">
              <strong class="comentario-nome" data-username="${comentario.senderid}">${nomeParaExibir}${isVerified}</strong>
              <small class="comentario-usuario">${usernameParaExibir}</small>
              <small class="comentario-data">${formatarDataRelativa(comentario.create)}</small>
            </div>
          </div>
          <div class="comentario-conteudo">${conteudoFormatado}</div>
        `;
        container.appendChild(comentarioEl);
      });
    }
    clearInterval(loadingInfo.interval);
    esconderLoading();
  } catch (error) {
    console.error("Erro ao renderizar comentarios:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    container.innerHTML = '<p class="error-comments">Erro ao carregar comentarios.</p>';
  }
}


// ===================
// ADICIONAR COMENTÃRIO
// ===================
async function adicionarComentario(uid, postId, conteudo) {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  const linkCheck = detectarLinksMaliciosos(conteudo);
  if (linkCheck.malicioso) {
    criarPopup('Link Bloqueado', `O link "${linkCheck.url}" foi identificado como potencialmente malicioso e não pode ser postado.`, 'warning');
    return false;
  }
  const loadingInfo = mostrarLoading('Enviando comentario...');
  try {
    const comentarioId = gerarIdUnico('comentid');
    const comentarioData = {
      content: conteudo,
      create: serverTimestamp(),
      senderid: usuarioLogado.uid,
      report: 0
    };
    // Salva em users/{userid}/posts/{postid}/coments/{comentid}
    const userComentRef = doc(db, 'users', uid, 'posts', postId, 'coments', comentarioId);
    await setDoc(userComentRef, comentarioData);
    // Salva em posts/{postid}/coments/{comentid}
    const postComentRef = doc(db, 'posts', postId, 'coments', comentarioId);
    await setDoc(postComentRef, comentarioData);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    return true;
  } catch (error) {
    console.error("Erro ao adicionar comentario:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar comentario', 'error');
    return false;
  }
}

// ===================
// FORMATAR DATA RELATIVA
// ===================
function formatarDataRelativa(data) {
  if (!data) return 'Data não disponível';
  try {
    let date;
    if (typeof data === 'object' && data.seconds) {
      date = new Date(data.seconds * 1000);
    } else {
      date = new Date(data);
    }
    const agora = new Date();
    const diferenca = agora.getTime() - date.getTime();
    const minutos = Math.floor(diferenca / (1000 * 60));
    const horas = Math.floor(diferenca / (1000 * 60 * 60));
    const dias = Math.floor(diferenca / (1000 * 60 * 60 * 24));
    const semanas = Math.floor(dias / 7);
    const meses = Math.floor(dias / 30);
    const anos = Math.floor(dias / 365);
    if (minutos < 1) return 'Agora mesmo';
    else if (minutos < 60) return `Há ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    else if (horas < 24) return `Há ${horas} hora${horas !== 1 ? 's' : ''}`;
    else if (dias < 7) return `Há ${dias} dia${dias !== 1 ? 's' : ''}`;
    else if (semanas < 4) return `Há ${semanas} semana${semanas !== 1 ? 's' : ''}`;
    else if (meses < 12) return `Há ${meses} mês${meses !== 1 ? 'es' : ''}`;
    else return `Há    ${anos} ano${anos !== 1 ? 's' : ''}`;
  } catch (error) {
    console.error("Erro ao formatar data:", error);
    return 'Data inválida';
  }
}


// ===================
// CARREGAR POSTS NO FEED
// ===================
// ...existing code...

// Função para verificar se o bubble ainda é válido (menos de 24h)
function bubbleEstaValido(createTimestamp) {
  const agora = new Date();
  let dataCriacao;
  
  if (typeof createTimestamp === 'object' && createTimestamp.seconds) {
    dataCriacao = new Date(createTimestamp.seconds * 1000);
  } else {
    dataCriacao = new Date(createTimestamp);
  }
  
  const diferencaHoras = (agora - dataCriacao) / (1000 * 60 * 60);
  return diferencaHoras < 24;
}

// Função para carregar bubbles
async function carregarBubbles() {
  try {
    const bubblesQuery = query(
      collection(db, 'bubbles'),
      orderBy('create', 'desc'),
      limit(50) // Carrega os 50 mais recentes
    );
    
    const bubblesSnapshot = await getDocs(bubblesQuery);
    const bubblesValidos = [];
    
    for (const bubbleDoc of bubblesSnapshot.docs) {
      const bubbleData = bubbleDoc.data();
      
      // Verifica se o bubble ainda é válido (menos de 24h)
      if (bubbleEstaValido(bubbleData.create)) {
        bubblesValidos.push({
          ...bubbleData,
          bubbleid: bubbleDoc.id,
          tipo: 'bubble'
        });
      } else {
        // Opcional: deletar bubbles expirados
        // await deleteDoc(doc(db, 'bubbles', bubbleDoc.id));
      }
    }
    
    return bubblesValidos;
  } catch (error) {
    console.error("Erro ao carregar bubbles:", error);
    return [];
  }
}

// Função para renderizar um bubble no feed
function renderizarBubble(bubbleData, feed) {
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble-container';
  bubbleEl.innerHTML = `
    <div class="bubble-header">
      <div class="user-info-bubble">
        <img src="./src/icon/default.jpg" alt="Avatar do usuário" class="avatar"
             onerror="this.src='./src/icon/default.jpg'" />
        <div class="user-meta-bubble">
          <strong class="user-name-link" data-username="${bubbleData.creatorid}">Carregando...</strong>
          <small class="bullet">•</small>
          <small class="post-date-bubble">${formatarDataRelativa(bubbleData.create)}</small>
        </div>
      </div>
    </div>
    <div class="bubble-content">
      <div class="bubble-text">
        <p>${formatarHashtags(bubbleData.content || 'Conteúdo não disponível')}</p>
      </div>
      <div class="more-bubble">
        ${bubbleData.musicUrl && bubbleData.musicUrl.trim() !== "" ? `
          <div class="player-bubble">
            <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 512">
              <path fill-rule="nonzero" d="M255.99 0c70.68 0 134.7 28.66 181.02 74.98C483.33 121.3 512 185.31 512 256c0 70.68-28.67 134.69-74.99 181.01C390.69 483.33 326.67 512 255.99 512S121.3 483.33 74.98 437.01C28.66 390.69 0 326.68 0 256c0-70.67 28.66-134.7 74.98-181.02C121.3 28.66 185.31 0 255.99 0zm77.4 269.81c13.75-8.88 13.7-18.77 0-26.63l-110.27-76.77c-11.19-7.04-22.89-2.9-22.58 11.72l.44 154.47c.96 15.86 10.02 20.21 23.37 12.87l109.04-75.66zm79.35-170.56c-40.1-40.1-95.54-64.92-156.75-64.92-61.21 0-116.63 24.82-156.74 64.92-40.1 40.11-64.92 95.54-64.92 156.75 0 61.22 24.82 116.64 64.92 156.74 40.11 40.11 95.53 64.93 156.74 64.93 61.21 0 116.65-24.82 156.75-64.93 40.11-40.1 64.93-95.52 64.93-156.74 0-61.22-24.82-116.64-64.93-156.75z"/>
            </svg>
            <p class="music-name">Música</p>
          </div>
        ` : ''}
        <div class="interaction">
          <button class="like-bubble" data-bubble-id="${bubbleData.bubbleid}" data-creator-id="${bubbleData.creatorid}">
            <i class="far fa-heart"></i>
            <span class="like-count">0</span>
          </button>
        </div>
      </div>
    </div>
  `;
  
  feed.appendChild(bubbleEl);
  
  // Buscar dados do usuário
  buscarDadosUsuarioPorUid(bubbleData.creatorid).then(userData => {
    if (userData) {
      const avatar = bubbleEl.querySelector('.avatar');
      const nome = bubbleEl.querySelector('.user-name-link');
      
      if (avatar) avatar.src = userData.userphoto || './src/icon/default.jpg';
      if (nome) {
        nome.textContent = userData.displayname || userData.username || bubbleData.creatorid;
        if (userData.verified) {
          nome.innerHTML = `${nome.textContent} <i class="fas fa-check-circle" style="margin-left: 4px; font-size: 0.9em; color: #4A90E2;"></i>`;
        }
      }
    }
  });
  
  // Configurar botão de like
  const btnLike = bubbleEl.querySelector('.like-bubble');
  const usuarioLogado = auth.currentUser;
  
  if (btnLike && usuarioLogado) {
    // Verificar se o usuário já curtiu
    const likerRef = doc(db, `bubbles/${bubbleData.bubbleid}/likers/${usuarioLogado.uid}`);
    getDoc(likerRef).then(likerSnap => {
      if (likerSnap.exists() && likerSnap.data().like === true) {
        btnLike.classList.add('liked');
        btnLike.querySelector('i').className = 'fas fa-heart';
      }
    });
    
    // Contar likes
    contarLikesBubble(bubbleData.bubbleid).then(totalLikes => {
      const span = btnLike.querySelector('.like-count');
      if (span) span.textContent = totalLikes;
    });
    
    // Adicionar evento de clique
    btnLike.addEventListener('click', async () => {
      await toggleLikeBubble(bubbleData.bubbleid, btnLike);
    });
  }
}

// Função para contar likes de um bubble
async function contarLikesBubble(bubbleId) {
  try {
    const likersQuery = query(
      collection(db, `bubbles/${bubbleId}/likers`),
      where('like', '==', true)
    );
    const snapshot = await getDocs(likersQuery);
    return snapshot.size;
  } catch (error) {
    console.error("Erro ao contar likes do bubble:", error);
    return 0;
  }
}

// Função para dar/remover like em um bubble
async function toggleLikeBubble(bubbleId, btnElement) {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    criarPopup('Erro', 'Você precisa estar logado para curtir.', 'error');
    return;
  }
  
  try {
    const likerRef = doc(db, `bubbles/${bubbleId}/likers/${usuarioLogado.uid}`);
    const likerSnap = await getDoc(likerRef);
    
    if (likerSnap.exists() && likerSnap.data().like === true) {
      // Remover like
      await deleteDoc(likerRef);
      btnElement.classList.remove('liked');
      btnElement.querySelector('i').className = 'far fa-heart';
    } else {
      // Adicionar like
      await setDoc(likerRef, {
        like: true,
        likein: serverTimestamp(),
        uid: usuarioLogado.uid
      });
      btnElement.classList.add('liked');
      btnElement.querySelector('i').className = 'fas fa-heart';
    }
    
    // Atualizar contador
    const totalLikes = await contarLikesBubble(bubbleId);
    const span = btnElement.querySelector('.like-count');
    if (span) span.textContent = totalLikes;
    
  } catch (error) {
    console.error("Erro ao curtir bubble:", error);
    criarPopup('Erro', 'Não foi possível curtir este bubble.', 'error');
  }
}

function renderPost(postData, feed) {
  // OCULTA DO FEED NORMAL SE visible: false
  if (postData.visible === false) {
    const avisoEl = document.createElement('div');
    avisoEl.className = 'post-card post-oculto-aviso';
    avisoEl.innerHTML = `
      <div class="post-oculto-msg">
        <p>Este conteúdo foi denunciado por muitos usuários.<br>Você ainda quer ver?</p>
        <button class="btn-ver-post" data-id="${postData.postid}">Ver assim mesmo</button>
      </div>
    `;
    feed.appendChild(avisoEl);
    return;
  }

  const postEl = document.createElement('div');
  postEl.className = 'post-card';
  postEl.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="./src/icon/default.jpg" alt="Avatar do usuário" class="avatar"
             onerror="this.src='./src/icon/default.jpg'" />
        <div class="user-meta">
          <strong class="user-name-link" data-username="${postData.creatorid}">Carregando...</strong>
          <small class="post-username"></small>
          <small class="post-date-mobile">${formatarDataRelativa(postData.create)}</small>
        </div>
      </div>
      <div class="left-space-options">
        <div class="more-options">
          <button class="more-options-button">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
        <div class="more-menu" style="display:none">
          <button class="btn-delete-post" data-id="${postData.postid}" data-owner="${postData.creatorid}">
            Apagar post
          </button>
        </div>
      </div>
    </div>
    <div class="post-content">
      <div class="post-text">${formatarHashtags(postData.content || 'Conteúdo não disponível')}</div>
      ${
        (postData.img && postData.img.trim() !== "")
          ? `
            <div class="post-image">
              <img src="${postData.img}" loading="lazy" onclick="abrirModalImagem('${postData.img}')">
            </div>
          `
          : (postData.urlVideo && postData.urlVideo.trim() !== "")
          ? `
            <div class="post-video">
              <video src="${postData.urlVideo}"
                     autoplay
                     muted
                     playsinline
                     controls
                     loop></video>
            </div>
          `
          : ''
      }
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="btn-like" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 456.549">
              <path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/>
            </svg> <span>${postData.likes || 0}</span>
          </button>
          <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.97 122.88"><title>instagram-comment</title><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/></svg> <p>Comentar</p>
            <span>${postData.comentarios || 0}</span>
          </button>
          <button class="btn-share" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.88 108.3"><title>instagram-share</title><path d="M96.14,12.47l-76.71-1.1,28.3,27.85L96.14,12.47ZM53.27,49l9.88,39.17L102.1,22,53.27,49ZM117,1.6a5.59,5.59,0,0,1,4.9,8.75L66.06,105.21a5.6,5.6,0,0,1-10.44-1.15L41.74,49,1.67,9.57A5.59,5.59,0,0,1,5.65,0L117,1.6Z"/></svg>
            <p>Compartilhar</p>
          </button>
          <button class="btn-report" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <i class="fas fa-flag"></i> <p>Denunciar</p>
          </button>
        </div>
        <div class="post-actions-rigth">
          <button class="btn-save" data-post-id="${postData.postid}" data-post-owner="${postData.creatorid}">
            <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 459 511.87"><path fill-rule="nonzero" d="M32.256 0h394.488c8.895 0 16.963 3.629 22.795 9.462C455.371 15.294 459 23.394 459 32.256v455.929c0 13.074-10.611 23.685-23.686 23.685-7.022 0-13.341-3.07-17.683-7.93L230.124 330.422 39.692 505.576c-9.599 8.838-24.56 8.214-33.398-1.385a23.513 23.513 0 01-6.237-16.006L0 32.256C0 23.459 3.629 15.391 9.461 9.55l.089-.088C15.415 3.621 23.467 0 32.256 0zm379.373 47.371H47.371v386.914l166.746-153.364c8.992-8.198 22.933-8.319 32.013.089l165.499 153.146V47.371z"/></svg>
            <p>Salvar</p>
          </button>
        </div>
      </div>
      <div class="post-footer-infos">
        <p class="post-liked-by"><strong class="liked-by-username"></strong></p>
        <small class="post-date-desktop">${formatarDataRelativa(postData.create)}</small>
      </div>
      <div class="comments-section" style="display: none;">
        <div class="comment-form">
          <input type="text" class="comment-input" placeholder="Escreva um comentário..."
                 data-username="${postData.creatorid}" data-post-id="${postData.postid}">
          <button class="comment-submit" data-username="${postData.creatorid}" data-post-id="${postData.postid}">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
        <div class="comments-area">
          <div class="comments-list"></div>
        </div>
      </div>
    </div>
  `;
  feed.appendChild(postEl);

  const usuarioLogado = auth.currentUser;

  if (usuarioLogado) {
    gerarTextoCurtidoPor(postData.postid, usuarioLogado.uid).then(info => {
      const footer = postEl.querySelector(".post-liked-by");

      if (!footer) return;

      if (info.total === 0) {
        footer.style.display = "none";
      } else {
        footer.style.display = "block";

        footer.innerHTML =
          `Curtido por <strong>${info.username}</strong>` +
          (info.total > 1 ? ` e outras ${info.total - 1} pessoas` : "");
      }
    });
  }

  // Configura botão de salvar
  const btnSave = postEl.querySelector('.btn-save');
  if (btnSave) {
    // Verifica se já está salvo
    verificarSeEstaSalvo(postData.postid).then(estaSalvo => {
      if (estaSalvo) {
        btnSave.classList.add('saved');
        btnSave.querySelector('i').className = 'fas fa-bookmark';
      }
    });

    // Adiciona evento de clique
    btnSave.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleSalvarPost(postData.postid, postData.creatorid, btnSave);
    });
    configurarAutoPauseVideos();
    configurarLimiteRepeticoes();
  }

  // Atualiza nome e foto do usuário assim que possível (não trava o loading)
  buscarDadosUsuarioPorUid(postData.creatorid).then(userData => {
    if (userData) {
      const avatar = postEl.querySelector('.avatar');
      const nome = postEl.querySelector('.user-name-link');
      const username = postEl.querySelector('.post-username');
      if (avatar) avatar.src = userData.userphoto || './src/icon/default.jpg';
      if (nome) {
        nome.textContent = userData.displayname || userData.username || postData.creatorid;
        // Adiciona ícone de verificado se o usuário for verificado
        if (userData.verified) {
          nome.innerHTML = `${nome.textContent} <i class="fas fa-check-circle" style="margin-left: 4px; font-size: 0.9em; color: #4A90E2;"></i>`;
        }
      }
      if (username) username.textContent = userData.username ? `@${userData.username}` : '';
    }
  });

  const btnLike = postEl.querySelector('.btn-like');
  const btnComment = postEl.querySelector('.btn-comment');
  if (btnLike && usuarioLogado) {
    const likerRef = doc(db, `posts/${postData.postid}/likers/${usuarioLogado.uid}`);
    getDoc(likerRef).then(likerSnap => {
      if (likerSnap.exists() && likerSnap.data().like === true) {
        btnLike.classList.add('liked');
      } else {
        btnLike.classList.remove('liked');
      }
    });
  }

  // Atualiza contadores apenas se os botões existirem (evita erro se estrutura mudar)
  contarLikes(postData.postid).then(totalLikes => {
    if (btnLike) {
      const span = btnLike.querySelector('span');
      if (span) span.textContent = totalLikes;
    }
  }).catch(() => {});

  contarComentarios(postData.postid).then(totalComentarios => {
    if (btnComment) {
      const span = btnComment.querySelector('span');
      if (span) span.textContent = totalComentarios;
    }
  }).catch(() => {});
}

async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Carregando...";
  }

  try {
    // Remove existing bubbles to avoid duplicates
    allItems = allItems.filter(item => item.tipo !== 'bubble');

    const bubbles = await carregarBubbles();
    bubbles.forEach(bubble => {
      allItems.push(bubble);
    });

    // Busca lote de posts ordenados por data (mais recentes primeiro)
    let postsQuery = query(
      collection(db, 'posts'),
      orderBy('create', 'desc'),
      limit(POSTS_LIMIT)
    );
    if (lastPostSnapshot) {
      postsQuery = query(
        collection(db, 'posts'),
        orderBy('create', 'desc'),
        startAfter(lastPostSnapshot),
        limit(POSTS_LIMIT)
      );
    }
    const postsSnapshot = await getDocs(postsQuery);

    if (postsSnapshot.empty) {
      hasMorePosts = false;
      if (loadMoreBtn) {
        loadMoreBtn.textContent = "Não há mais posts";
        loadMoreBtn.disabled = true;
      }
      loading = false;
      return;
    }

    lastPostSnapshot = postsSnapshot.docs[postsSnapshot.docs.length - 1];

    // Coleta todos os posts do snapshot
    const postsParaAdicionar = [];
    for (const postDoc of postsSnapshot.docs) {
      const postData = postDoc.data();
      postsParaAdicionar.push(postData);
    }

    // Ordena manualmente por segurança (caso algum create esteja inconsistente)
    postsParaAdicionar.sort((a, b) => {
      let dataA = a.create;
      let dataB = b.create;
      if (typeof dataA === 'object' && dataA.seconds) dataA = dataA.seconds;
      else dataA = new Date(dataA).getTime() / 1000;
      if (typeof dataB === 'object' && dataB.seconds) dataB = dataB.seconds;
      else dataB = new Date(dataB).getTime() / 1000;
      return dataB - dataA;
    });

    postsParaAdicionar.forEach(post => {
      allItems.push({ ...post, tipo: 'post' });
    });

    // Sort allItems by create desc
    allItems.sort((a, b) => {
      let dataA = a.create;
      let dataB = b.create;
      if (typeof dataA === 'object' && dataA.seconds) dataA = dataA.seconds;
      else dataA = new Date(dataA).getTime() / 1000;
      if (typeof dataB === 'object' && dataB.seconds) dataB = dataB.seconds;
      else dataB = new Date(dataB).getTime() / 1000;
      return dataB - dataA;
    });

    // Clear feed and render all
    feed.innerHTML = '';
    for (const item of allItems) {
      if (item.tipo === 'bubble') {
        renderizarBubble(item, feed);
      } else {
        renderPost(item, feed);
      }
    }

    if (postsSnapshot.size < POSTS_LIMIT) {
      hasMorePosts = false;
      if (loadMoreBtn) {
        loadMoreBtn.textContent = "Não há mais posts";
        loadMoreBtn.disabled = true;
      }
    } else {
      if (loadMoreBtn) {
        loadMoreBtn.textContent = "Carregar mais";
        loadMoreBtn.disabled = false;
      }
    }
  } catch (error) {
    console.error("Erro ao carregar posts:", error);
    if (loadMoreBtn) {
      loadMoreBtn.textContent = "Erro ao carregar";
    }
    criarPopup('Erro', 'Não foi possível carregar mais posts.', 'error');
  }
  loading = false;
}





// --- Variáveis de Controlo do ActivityPub (AP) ---
let lastMastodonId = null;
let loadingMastodon = false;

// Seleção de Elementos (Certifica-te que estes IDs existem no HTML)
const btnFirebase = document.getElementById('p1');
const btnAP = document.getElementById('p2');
const divFirebase = document.getElementById('feed');
const divMastodon = document.getElementById('feed2');

// Configuração do Algoritmo "Global Jovem"
const INSTANCIAS_ALVO = ['mastodon.social', 'mstdn.jp', 'mastodon.org.uk', 'mstdn.ca'];
const IDIOMAS_BLOQUEADOS = ['ar', 'es'];
const TERMOS_JOVENS = ['gaming', 'tech', 'anime', 'music', 'streaming', 'ai', 'art', 'fashion', 'cod', 'kpop', 'meme'];

// --- Alternância de Abas ---
function alternarAbas(ativa) {
    if (ativa === 'ap') {
        divFirebase.style.display = 'none';
        divMastodon.style.display = 'block';
        btnAP.classList.add('active');
        btnFirebase.classList.remove('active');
        if (divMastodon.innerHTML.trim() === "") carregarFeedMastodon();
    } else {
        divMastodon.style.display = 'none';
        divFirebase.style.display = 'block';
        btnFirebase.classList.add('active');
        btnAP.classList.remove('active');
    }
}

if(btnFirebase && btnAP) {
    btnFirebase.addEventListener('click', () => alternarAbas('firebase'));
    btnAP.addEventListener('click', () => alternarAbas('ap'));
}

// --- Algoritmo de Curadoria AP ---
async function carregarFeedMastodon(isNextPage = false) {
    if (loadingMastodon) return;
    loadingMastodon = true;

    const container = document.getElementById('feed2');
    
    if (!isNextPage) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:#888;"><i class="fas fa-sync fa-spin"></i> A curar feed internacional...</div>';
        lastMastodonId = null;
    }

    try {
        // Seleciona uma instância da lista para diversificar
        const instancia = INSTANCIAS_ALVO[Math.floor(Math.random() * INSTANCIAS_ALVO.length)];
        let url = `https://${instancia}/api/v1/timelines/public?limit=40`;
        if (isNextPage && lastMastodonId) url += `&max_id=${lastMastodonId}`;

        const response = await fetch(url);
        const posts = await response.json();

        if (posts.length > 0) {
            if (!isNextPage) container.innerHTML = '';

            posts.forEach(post => {
                // 1. FILTROS RÍGIDOS (Bots e Idiomas Bloqueados)
                if (post.account.bot) return;
                if (IDIOMAS_BLOQUEADOS.includes(post.language)) return;

                // 2. FILTRO DE CONTEÚDO (Remove caracteres Árabes ou Espanhóis via Regex)
                const regexBloqueio = /[\u0600-\u06FF]|¿|¡/i;
                if (regexBloqueio.test(post.content)) return;

                // 3. LOGICA DO ALGORITMO JOVEM/ALTA
                const texto = post.content.toLowerCase();
                const eJovem = TERMOS_JOVENS.some(t => texto.includes(t));
                const temMedia = post.media_attachments.length > 0;
                
                // Só mostra se for conteúdo "Jovem", se tiver media, ou se for muito popular
                if (!eJovem && !temMedia && post.reblogs_count < 3) return;

                const card = document.createElement('div');
                card.className = 'post-card';

                // Processamento de Media
                // --- No loop posts.forEach dentro de carregarFeedMastodon ---

let mediaHtml = '';
if (temMedia) {
    // Usamos a classe 'post-image' que você estilizou
    mediaHtml = '<div class="post-image">'; 
    
    post.media_attachments.forEach(media => {
        if (media.type === 'image') {
            // Adicionamos a tag img que o seu CSS vai estilizar
            mediaHtml += `
                <img src="${media.preview_url || media.url}" 
                     loading="lazy" 
                     alt="Post media">`;
        } else if (media.type === 'video' || media.type === 'gifv') {
            // Para vídeos, mantemos a lógica, mas dentro do container estilizado
            mediaHtml += `
                <video controls playsinline loop muted 
                       style="max-width: 100%; max-height: 500px; border-radius: 8px;">
                    <source src="${media.url}" type="video/mp4">
                </video>`;
        }
    });
    mediaHtml += '</div>';
}

                card.innerHTML = `
                    <div class="post-header" style="display:flex; align-items:center; gap:12px;">
                        <img src="${post.account.avatar}" class="avatar" style="width:45px; height:45px; border-radius:50%;" onerror="this.src='./src/icon/default.jpg'">
                        <div class="user-meta">
                            <div style="display:flex; align-items:center; gap:5px;">
                                <strong style="color:#fff;">${post.account.display_name || post.account.username}</strong>
                                <span style="font-size:9px; background:#1d9bf0; color:white; padding:1px 5px; border-radius:3px;">${instancia.toUpperCase()}</span>
                            </div>
                            <small style="color:#71767b;">@${post.account.username} • Global Feed</small>
                        </div>
                    </div>
                    <div class="post-content" style="margin-top:12px;">
                        <div class="post-text" style="color:#e7e9ea; line-height:1.5; font-size:15px;">${post.content}</div>
                        ${mediaHtml}
                    </div>
                    <div class="post-footer" style="margin-top:15px; display:flex; justify-content:space-between; color:#71767b; max-width:400px;">
                        <span><i class="far fa-comment"></i> ${post.replies_count}</span>
                        <span><i class="fas fa-retweet"></i> ${post.reblogs_count}</span>
                        <span><i class="far fa-heart"></i> ${post.favourites_count}</span>
                    </div>
                `;
                container.appendChild(card);
            });

            lastMastodonId = posts[posts.length - 1].id;
            
            // Ativa o Auto-Pause que já tens no feed.js
            if (typeof configurarAutoPauseVideos === 'function') configurarAutoPauseVideos();
        }
    } catch (error) {
        console.error("Erro na curadoria:", error);
    } finally {
        loadingMastodon = false;
    }
}

// Integração com o teu listener de Scroll existente
window.addEventListener("scroll", () => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 400) {
        if (divMastodon.style.display === 'block' && !loadingMastodon) {
            carregarFeedMastodon(true);
        }
    }
});
// ...existing code...
// ===================
// ENVIAR POST - VERSÃO OTIMIZADA
// ===================
async function sendPost() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    criarPopup('Erro', 'Você precisa estar logado.', 'warning');
    return;
  }
  
  const texto = postInput.value.trim();
  if (!texto) {
    criarPopup('Campo Vazio', 'Digite algo para postar!', 'warning');
    return;
  }
  
  const linkCheck = detectarLinksMaliciosos(texto);
  if (linkCheck.malicioso) {
    criarPopup('Link Bloqueado', `O link "${linkCheck.url}" foi identificado como potencialmente malicioso.`, 'warning');
    return;
  }
  
  tocarSomEnvio();
  criarAnimacaoAviaoPapel();
  
  const loadingInfo = mostrarLoading('Preparando post...');
  
  try {
    const postId = gerarIdUnico('post');
    let urlImagem = '';
    let deleteUrlImagem = '';
    
    // Verifica se há arquivo de imagem para upload
    const fileInput = document.querySelector('#image-file-input');
    
    if (fileInput && fileInput.files.length > 0) {
      atualizarTextoLoading('Fazendo upload da imagem...');
      
      const uploadResult = await uploadImagemPost(fileInput.files[0], usuarioLogado.uid);
      
      if (!uploadResult.success) {
        clearInterval(loadingInfo.interval);
        esconderLoading();
        criarPopup('Erro no Upload', uploadResult.error, 'error');
        return;
      }
      
      urlImagem = uploadResult.url;
      deleteUrlImagem = uploadResult.deleteUrl;
      
      console.log('✅ Upload realizado com sucesso!');
      console.log('URL da imagem:', urlImagem);
    }
    
    const videoInput = document.querySelector('.video-url-input');
    let urlVideo = '';
    if (videoInput) {
      urlVideo = videoInput.value.trim();
    }
    
    atualizarTextoLoading('Salvando post...');
    
    const postData = {
      content: texto,
      img: urlImagem,
      imgDeleteUrl: deleteUrlImagem,
      urlVideo: urlVideo || '',
      likes: 0,
      saves: 0,
      comentarios: 0,
      postid: postId,
      creatorid: usuarioLogado.uid,
      reports: 0,
      visible: true,
      create: serverTimestamp()
    };
    
    const userPostRef = doc(db, 'users', usuarioLogado.uid, 'posts', postId);
    await setDoc(userPostRef, postData);
    
    const globalPostRef = doc(db, 'posts', postId);
    await setDoc(globalPostRef, postData);
    
    postInput.value = '';
    
    if (fileInput) {
      fileInput.value = '';
      const uploadLabel = document.querySelector('.upload-label');
      const imagePreview = document.querySelector('.image-preview');
      if (uploadLabel) uploadLabel.style.display = 'flex';
      if (imagePreview) imagePreview.style.display = 'none';
    }
    
    if (videoInput) {
      videoInput.value = '';
    }
    
    feed.innerHTML = '';
    allPosts = [];
    currentPage = 0;
    hasMorePosts = true;
    loading = false;
    lastPostSnapshot = null;
    
    await loadPosts();
    
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Sucesso!', 'Post enviado com sucesso!', 'success');
    
  } catch (error) {
    console.error("Erro ao enviar post:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar post: ' + error.message, 'error');
  }
}



async function contarComentarios(postId) {
  // Os comentários são salvos na sub-coleção 'coments' (sem 'r') em outras partes do código
  const comentariosRef = collection(db, 'posts', postId, 'coments');
  const snapshot = await getDocs(comentariosRef);
  return snapshot.size;
}


// ===================
// CURTIR POST (posts/{postid})
// ===================
// Função para alternar entre like e deslike

async function contarLikes(postId) {
  const likersRef = collection(db, 'posts', postId, 'likers');
  const q = query(likersRef, where('like', '==', true));
  const snapshot = await getDocs(q);
  return snapshot.size;
}

async function toggleLikePost(uid, postId, element) {
  const likerRef = doc(db, `posts/${postId}/likers/${uid}`);

  try {
    const likerSnap = await getDoc(likerRef);
    const spanCurtidas = element.querySelector("span");
    let curtidasAtuais = parseInt(spanCurtidas.textContent) || 0;

    if (likerSnap.exists() && likerSnap.data().like === true) {
      // DESCURTIR
      await updateDoc(likerRef, {
        like: false,
        timestamp: Date.now()
      });

      element.classList.remove("liked");
      spanCurtidas.textContent = Math.max(0, curtidasAtuais - 1);
    } else {
      // CURTIR
      if (likerSnap.exists()) {
        await updateDoc(likerRef, {
          like: true,
          timestamp: Date.now()
        });
      } else {
        await setDoc(likerRef, {
          uid,
          like: true,
          timestamp: Date.now()
        });
      }

      element.classList.add("liked");
      spanCurtidas.textContent = curtidasAtuais + 1;
    }

    // Atualiza "curtido por"
    atualizarCurtidoPorDepoisDoLike(element, postId);

  } catch (error) {
    console.error("Erro ao curtir/descurtir:", error);
    criarPopup("Erro", "Não foi possível curtir o post.", "error");
  }
}


feed.addEventListener('click', async (e) => {
  const btnLike = e.target.closest('.btn-like');
  if (!btnLike) return;

  const uid = auth.currentUser?.uid;
  const postId = btnLike.dataset.id;

  if (!uid || !postId) {
    criarPopup('Erro', 'Você precisa estar logado para curtir posts.', 'warning');
    return;
  }

  await toggleLikePost(uid, postId, btnLike);
});

async function atualizarCurtidoPorDepoisDoLike(btn, postId) {
  const usuarioLogado = auth.currentUser;
  const footer = btn.closest(".post-card").querySelector(".post-liked-by");

  if (!footer || !usuarioLogado) return;

  const info = await gerarTextoCurtidoPor(postId, usuarioLogado.uid);

  if (info.total === 0) {
    footer.style.display = "none";
    return;
  }

  footer.style.display = "block";

  footer.innerHTML =
    `Curtido por <strong>${info.username}</strong>` +
    (info.total > 1 ? ` e outras ${info.total - 1} pessoas` : "");
}



async function gerarTextoCurtidoPor(postId, usuarioLogadoUid) {
  const likersRef = collection(db, `posts/${postId}/likers`);
  const likersSnap = await getDocs(likersRef);

  let likersTotal = [];

  likersSnap.forEach(doc => {
    const data = doc.data();
    if (data.like === true) {
      likersTotal.push({
        uid: doc.id,
        timestamp: data.timestamp || 0
      });
    }
  });

  const total = likersTotal.length;

  // 👉 CASO 1: Só você curtiu
  const soVoceCurtiu = (total === 1 && likersTotal[0].uid === usuarioLogadoUid);

  if (soVoceCurtiu) {
    return {
      username: "você",
      total
    };
  }

  // 👉 CASO 2: Tem mais curtidas além da sua
  // Remove você para a exibição
  const likersExibicao = likersTotal.filter(l => l.uid !== usuarioLogadoUid);

  if (likersExibicao.length === 0) {
    // Só você curtiu — mas esse caso já tratado acima
    return { username: "você", total };
  }

  // Ordena por mais recente
  likersExibicao.sort((a, b) => b.timestamp - a.timestamp);

  // Buscar amigos
  const amigosSnap = await getDocs(collection(db, `users/${usuarioLogadoUid}/friends`));
  const amigosUid = amigosSnap.docs.map(d => d.id);

  // Filtrar amigos (sem você)
  const amigosQueCurtiram = likersExibicao.filter(l => amigosUid.includes(l.uid));

  let uidEscolhido;

  if (amigosQueCurtiram.length > 0) {
    // amigo mais recente
    uidEscolhido = amigosQueCurtiram[0].uid;
  } else {
    // qualquer pessoa mais recente
    uidEscolhido = likersExibicao[0].uid;
  }

  // Busca o usuário escolhido
  const userData = await buscarDadosUsuarioPorUid(uidEscolhido);
  const username =
    userData?.username ||
    userData?.displayname ||
    "usuário";

  return { username, total };
}



// ===================
// OBTER FOTO DE PERFIL DO USUÁRIO
// ===================
function obterFotoPerfil(userData, usuarioLogado) {
  const possiveisFotos = [
    userData?.userphoto,
    userData?.foto,
    usuarioLogado?.userphoto,
    usuarioLogado?.foto
  ];
  for (const foto of possiveisFotos) {
    if (foto && typeof foto === 'string') {
      try {
        new URL(foto);
        return foto;
      } catch {
        continue;
      }
    }
  }
  return './src/icon/default.jpg';
}


// ==============================
// SISTEMA DE CACHE GLOBAL
// ==============================

const CACHE_USER_TIME = 1000 * 60 * 10; // 10 minutos

function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw);

    // expirou
    if (Date.now() - data.time > CACHE_USER_TIME) {
      localStorage.removeItem(key);
      return null;
    }

    return data.value;
  } catch {
    return null;
  }
}

function setCache(key, value) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        time: Date.now(),
        value
      })
    );
  } catch {}
}



// ==============================
// CACHE DE USUÁRIOS
// ==============================
async function buscarUsuarioCached(uid) {
  const key = `user_cache_${uid}`;

  const cache = getCache(key);
  if (cache) return cache;

  const dados = await buscarDadosUsuarioPorUid(uid);

  if (dados) setCache(key, dados);

  return dados;
}


// ==============================
// NEVE ❄️ (SIMPLES)
// ==============================
let neveAtiva = false;

function iniciarNeve() {
  if (neveAtiva) return;
  neveAtiva = true;

  let container = document.getElementById('snow-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'snow-container';
    document.body.appendChild(container);

    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '9999999999';
  }

  if (!document.getElementById('snow-style')) {
    const style = document.createElement('style');
    style.id = 'snow-style';
    style.innerHTML = `
      .snowflake {
        position: absolute;
        top: -20px;
        color: white;
        opacity: 0.8;
        animation-name: snow-fall, snow-sway;
        animation-timing-function: linear, ease-in-out;
        animation-iteration-count: infinite, infinite;
      }

      @keyframes snow-fall {
        to {
          transform: translateY(110vh);
        }
      }

      @keyframes snow-sway {
        0%   { margin-left: 0px; }
        50%  { margin-left: 30px; }
        100% { margin-left: 0px; }
      }
    `;
    document.head.appendChild(style);
  }

  setInterval(() => {
    const floco = document.createElement('div');
    floco.className = 'snowflake';
    floco.textContent = '❄';

    const size = 8 + Math.random() * 14;
    const fallDuration = 10 + Math.random() * 8; // queda lenta
    const swayDuration = 4 + Math.random() * 6;   // balanço suave

    floco.style.left = Math.random() * 100 + 'vw';
    floco.style.fontSize = size + 'px';
    floco.style.animationDuration = `${fallDuration}s, ${swayDuration}s`;

    container.appendChild(floco);

    setTimeout(() => floco.remove(), (fallDuration + 2) * 1000);
  }, 650);
}


// ==============================
// GREETING COM CACHE + NATAL
// ==============================
async function atualizarGreeting() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;

  const loadingInfo = mostrarLoading('Carregando dados do usuário...');

  try {
    const userData = await buscarUsuarioCached(usuarioLogado.uid);

    // Saudação normal
    const hora = new Date().getHours();
    let saudacao;

    if (hora >= 5 && hora < 12) saudacao = "Bom dia";
    else if (hora >= 12 && hora < 18) saudacao = "Boa tarde";
    else saudacao = "Boa noite";

    // 🎄 NATAL SIMPLES
    const agora = new Date();
    const mes = agora.getMonth(); // 0 = jan
    const dia = agora.getDate();

    const ehNatal = mes === 11 && dia >= 23 && dia <= 29;

    if (ehNatal) {
      // greeting especial às vezes
      if (Math.random() <= 0.3) {
        const natalGreetings = [
          "Feliz Natal ",
          "Ho ho ho ",
          "Boas festas "
        ];
        saudacao = natalGreetings[Math.floor(Math.random() * natalGreetings.length)];
      }

      // neve sempre no natal
      iniciarNeve();
    }

    // Nome
    const nome =
      userData?.displayname ||
      userData?.nome ||
      usuarioLogado.displayName ||
      usuarioLogado.displayname ||
      usuarioLogado.nome ||
      usuarioLogado.email;

    // DOM
    const greetingElement = document.getElementById('greeting');
    const usernameElement = document.getElementById('username');

    if (greetingElement) greetingElement.textContent = saudacao;
    if (usernameElement) usernameElement.textContent = nome;

    // Foto
    const urlFotoPerfil = obterFotoPerfil(userData, usuarioLogado);

    const fotoPerfilWelcome =
      document.querySelector('.user-welcome img') ||
      document.querySelector('.welcome-box img') ||
      document.querySelector('section.welcome-box .user-welcome img');

    if (fotoPerfilWelcome) {
      fotoPerfilWelcome.src = urlFotoPerfil;
      fotoPerfilWelcome.onerror = function () {
        this.src = './src/icon/default.jpg';
      };
    }

    clearInterval(loadingInfo.interval);
    esconderLoading();

  } catch (error) {
    console.error("Erro ao atualizar greeting:", error);

    clearInterval(loadingInfo.interval);
    esconderLoading();
  }
}


// ===================
// CONFIGURAR LINKS
// ===================
function configurarLinks() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const page = isMobile ? 'pfmobile.html' : 'PF.html';
  const urlPerfil = `${page}?userid=${encodeURIComponent(usuarioLogado.uid)}`;
  const linkSidebar = document.getElementById('linkPerfilSidebar');
  const linkMobile = document.getElementById('linkPerfilMobile');
  if (linkSidebar) linkSidebar.href = urlPerfil;
  if (linkMobile) linkMobile.href = urlPerfil;
  const btnsSair = document.querySelectorAll('#btnSair');
  btnsSair.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      mostrarPopupConfirmacao(
        'Logout',
        'Tem certeza que deseja sair?',
        () => {
          auth.signOut().then(() => {
            window.location.href = 'index.html';
          });
        }
      );
    });
  });
}

// ===================
// CRIAR INPUT DE URL DE IMAGEM (seleção direta)
// ===================
async function comprimirImagem(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            }));
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = reject;
    };
    
    reader.onerror = reject;
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

async function uploadImagemPost(file, userId) {
  try {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Arquivo inválido. Apenas imagens são permitidas.');
    }

    const maxSize = 5 * 1024 * 1024;
    let fileToUpload = file;
    
    if (file.size > maxSize) {
      console.log('Comprimindo imagem...');
      fileToUpload = await comprimirImagem(file, 1920, 0.7);
    }

    const base64 = await fileToBase64(fileToUpload);
    const base64Data = base64.split(',')[1];
    
    const formData = new FormData();
    formData.append('image', base64Data);
    formData.append('name', `post_${userId}_${Date.now()}`);
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Erro na requisição ao ImgBB');
    }
    
    const data = await response.json();
    
    if (data.success) {
      return {
        success: true,
        url: data.data.url,
        deleteUrl: data.data.delete_url,
        thumb: data.data.thumb.url,
        display: data.data.display_url
      };
    } else {
      throw new Error(data.error?.message || 'Erro ao fazer upload');
    }
    
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

function mostrarPreview(file) {
  const postArea = document.querySelector('.post-area');
  if (!postArea) return;
  
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    criarPopup(
      'Imagem muito grande', 
      'A imagem será comprimida automaticamente ao enviar.', 
      'info'
    );
  }
  
  // Remove preview anterior se existir
  let imagePreview = postArea.nextElementSibling;
  if (imagePreview && imagePreview.classList.contains('image-preview-container')) {
    imagePreview.remove();
  }
  
  // Cria novo preview
  imagePreview = document.createElement('div');
  imagePreview.className = 'image-preview-container';
  imagePreview.innerHTML = `
    <div class="image-preview-content">
      <img src="" alt="Preview">
      <button class="remove-image-btn" type="button">
        <i class="fas fa-times"></i>
      </button>
    </div>
  `;
  
  postArea.parentNode.insertBefore(imagePreview, postArea.nextSibling);
  
  const previewImg = imagePreview.querySelector('img');
  const removeBtn = imagePreview.querySelector('.remove-image-btn');
  
  const reader = new FileReader();
  reader.onload = (e) => {
    previewImg.src = e.target.result;
    setTimeout(() => imagePreview.classList.add('aberta'), 10);
  };
  reader.readAsDataURL(file);
  
  // Botão de remover
  removeBtn.addEventListener('click', () => {
    const fileInput = document.getElementById('image-file-input');
    if (fileInput) fileInput.value = '';
    imagePreview.classList.remove('aberta');
    setTimeout(() => imagePreview.remove(), 300);
  });
}

function criarInputImagem() {
  const postArea = document.querySelector('.post-area');
  const fileBtn = document.querySelector('.file-button');
  
  if (!postArea || !fileBtn) return;

  // Cria input file oculto
  let fileInput = document.getElementById('image-file-input');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'image-file-input';
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
    
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        mostrarPreview(file);
      } else if (file) {
        criarPopup('Arquivo Inválido', 'Por favor, envie apenas imagens.', 'warning');
      }
    });
  }
  
  // Ao clicar no botão, abre diretamente o seletor de arquivos
  fileBtn.addEventListener('click', () => {
    fileInput.click();
  });
}

function criarInputVideo() {
  const postArea = document.querySelector('.post-area');
  const fileBtn = document.querySelector('.file-button');

  if (!postArea || !fileBtn) return;

  fileBtn.addEventListener('click', () => {
    let videoInputContainer = document.querySelector('.video-input-container');

    if (!videoInputContainer) {
      videoInputContainer = document.createElement('div');
      videoInputContainer.className = 'video-input-container';
      videoInputContainer.innerHTML = `
        <input type="url" class="video-url-input" placeholder="Cole a URL do vídeo (opcional)">
      `;
      postArea.parentNode.insertBefore(videoInputContainer, postArea.nextSibling.nextSibling);
    } else {
      videoInputContainer.classList.toggle('aberta');
    }
  });
}



// ===================
// DETECÇÃO MOBILE
// ===================
function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ===================
// MODAL DE COMENTÁRIOS MOBILE COM DRAG E CLICK FORA
// ===================
async function abrirModalComentariosMobile(postId, creatorId) {
  const modalExistente = document.querySelector('.mobile-comments-modal');
  if (modalExistente) modalExistente.remove();

  const modal = document.createElement('div');
  modal.className = 'mobile-comments-modal';
  modal.innerHTML = `
    <div class="mobile-comments-content">
      <div class="modal-comments-header">
        <div class="modal-grab"></div>
        <div class="modal-info">
          <h3>Comentários</h3>
        </div>
      </div>
      <div class="modal-comments-list-container">
        <div class="comments-list-mobile" data-post-id="${postId}"></div>
      </div>
      <div class="mobile-comment-form-container">
        <div class="comment-form">
          <input type="text" class="comment-input-mobile" placeholder="Escreva um comentário..."
                 data-username="${creatorId}" data-post-id="${postId}">
          <button class="comment-submit-mobile" data-username="${creatorId}" data-post-id="${postId}">
            <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 404 511.5"><path fill-rule="nonzero" d="m219.24 72.97.54 438.53h-34.95l-.55-442.88L25.77 241.96 0 218.39 199.73 0 404 222.89l-25.77 23.58z"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  // BLOQUEIA O SCROLL DA PÁGINA
  const scrollY = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.top = `-${scrollY}px`;
  
  // Força o reflow antes de adicionar a classe active
  modal.offsetHeight;
  
  // Exibe o modal com animação
  requestAnimationFrame(() => {
    modal.classList.add('active');
  });

  // FECHAR AO CLICAR FORA DO CONTEÚDO
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      fecharModalComentariosMobile();
    }
  });

  // DRAG TO CLOSE
  const modalContent = modal.querySelector('.mobile-comments-content');
  const modalGrab = modal.querySelector('.modal-grab');
  const header = modal.querySelector('.modal-comments-header');
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  const handleTouchStart = (e) => {
    startY = e.touches[0].clientY;
    isDragging = true;
    modalContent.style.transition = 'none';
  };

  const handleTouchMove = (e) => {
    if (!isDragging) return;
    
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    
    // Só permite arrastar para baixo
    if (deltaY > 0) {
      modalContent.style.transform = `translateY(${deltaY}px)`;
      
      // Adiciona opacidade conforme arrasta
      const opacity = Math.max(0, 1 - (deltaY / 300));
      modal.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.5})`;
    }
  };

  const handleTouchEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const deltaY = currentY - startY;
    modalContent.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    
    // Se arrastou mais de 150px, fecha o modal
    if (deltaY > 150) {
      fecharModalComentariosMobile();
    } else {
      // Volta para a posição original
      modalContent.style.transform = 'translateY(0)';
      modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    }
  };

  // Adiciona listeners
  modalGrab.addEventListener('touchstart', handleTouchStart);
  modalGrab.addEventListener('touchmove', handleTouchMove);
  modalGrab.addEventListener('touchend', handleTouchEnd);
  
  header.addEventListener('touchstart', handleTouchStart);
  header.addEventListener('touchmove', handleTouchMove);
  header.addEventListener('touchend', handleTouchEnd);

  // Carrega os comentários
  const commentsList = modal.querySelector('.comments-list-mobile');
  await renderizarComentarios(creatorId, postId, commentsList);
  
  // Listener para o botão de envio
  modal.querySelector('.comment-submit-mobile').addEventListener('click', async (e) => {
    e.preventDefault();
    const input = modal.querySelector('.comment-input-mobile');
    const conteudo = input.value.trim();
    if (conteudo) {
      const sucesso = await adicionarComentario(creatorId, postId, conteudo);
      if (sucesso) {
        input.value = '';
        await renderizarComentarios(creatorId, postId, commentsList);
      }
    } else {
      criarPopup('Campo Vazio', 'Digite um comentário antes de enviar!', 'warning');
    }
  });

  // Listener para Enter
  modal.querySelector('.comment-input-mobile').addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = e.target;
      const conteudo = input.value.trim();
      if (conteudo) {
        const sucesso = await adicionarComentario(creatorId, postId, conteudo);
        if (sucesso) {
          input.value = '';
          await renderizarComentarios(creatorId, postId, commentsList);
        }
      }
    }
  });
}

function fecharModalComentariosMobile() {
  const modal = document.querySelector('.mobile-comments-modal');
  if (modal) {
    const modalContent = modal.querySelector('.mobile-comments-content');
    modalContent.style.transition = 'transform 0.3s ease';
    modalContent.style.transform = 'translateY(100%)';
    modal.style.opacity = '0';
    
    setTimeout(() => {
      modal.remove();
      
      // RESTAURA O SCROLL DA PÁGINA
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }, 300);
  }
}

// Torna a função de fechar globalmente acessível
window.fecharModalComentariosMobile = fecharModalComentariosMobile;


// ===================
// EVENT LISTENERS - VERSÃO COMPLETA E CORRIGIDA
// ===================
function configurarEventListeners() {
  // Botão de enviar post
  if (postButton) {
    postButton.addEventListener('click', sendPost);
  }
  
  // Enter no input de post
  if (postInput) {
    postInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPost();
      }
    });
  }
  
  // Botão de carregar mais
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadPosts);
  }
  
  if (feed) {
    // ✅ ÚNICO LISTENER DE CLICK NO FEED
    feed.addEventListener('click', async (e) => {
      const btnLike = e.target.closest('.btn-like');
      const btnReport = e.target.closest('.btn-report');
      const btnComment = e.target.closest('.btn-comment');
      const userNameLink = e.target.closest('.user-name-link');
      const btnVer = e.target.closest('.btn-ver-post');
      const btnMore = e.target.closest(".more-options-button");
      const btnDelete = e.target.closest(".btn-delete-post");
      const commentSubmit = e.target.closest('.comment-submit');

      // CURTIR POST
      if (btnLike) {
        const uid = auth.currentUser?.uid;
        const postId = btnLike.dataset.id;
        if (uid && postId) {
          await toggleLikePost(uid, postId, btnLike);
        } else {
          criarPopup('Erro', 'Você precisa estar logado para curtir posts.', 'warning');
        }
      }

      // DENUNCIAR POST
      if (btnReport) {
        const postId = btnReport.dataset.id;
        const uid = btnReport.dataset.username;
        let targetOwnerUsername = "cache";
        try {
          const userData = await buscarDadosUsuarioPorUid(uid);
          targetOwnerUsername = userData?.username || userData?.displayname || "cache";
        } catch {}
        criarModalDenuncia({
          targetType: "post",
          targetId: postId,
          targetPath: `posts/${postId}`,
          targetOwnerId: uid,
          targetOwnerUsername
        });
      }

      // ABRIR COMENTÁRIOS
      if (btnComment) {
        const postId = btnComment.dataset.id;
        const uid = btnComment.dataset.username;
        const isMobile = isMobileDevice();

        if (isMobile) {
          // Mobile: abre modal
          abrirModalComentariosMobile(postId, uid);
        } else {
          // Desktop: toggle seção
          const commentsSection = btnComment.closest('.post-card').querySelector('.comments-section');
          if (commentsSection.style.display === 'none' || commentsSection.style.display === '') {
            commentsSection.style.display = 'block';
            const commentsList = commentsSection.querySelector('.comments-list');
            await renderizarComentarios(uid, postId, commentsList);
          } else {
            commentsSection.style.display = 'none';
          }
        }
      }

      // 👁️ VER POST DENUNCIADO
      if (btnVer) {
        const postId = btnVer.dataset.id;
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);
        
        if (postSnap.exists()) {
          const postData = postSnap.data();
          const avisoEl = btnVer.closest('.post-card');
          
          if (avisoEl) {
            avisoEl.innerHTML = `
              <div class="post-header">
                <div class="user-info">
                  <img src="./src/icon/default.jpg" alt="Avatar do usuário" class="avatar"
                       onerror="this.src='./src/icon/default.jpg'" />
                  <div class="user-meta">
                    <strong class="user-name-link" data-username="${postData.creatorid}">Carregando...</strong>
                    <small class="post-username"></small>
                  </div>
                </div>
                <div class="more-options">
                  <button class="more-options-button">
                    <i class="fas fa-ellipsis-h"></i>
                  </button>
                </div>
              </div>
              <div class="post-text">${formatarHashtags(postData.content || 'Conteúdo não disponível')}</div>
              ${postData.img ? `
                <div class="post-image">
                  <img src="${postData.img}" loading="lazy" onclick="abrirModalImagem('${postData.img}')">
                </div>
              ` : postData.urlVideo ? `
                <div class="post-video">
                  <video src="${postData.urlVideo}" autoplay muted playsinline loop></video>
                </div>
              ` : ''}
              <div class="post-actions">
                <button class="btn-like" data-username="${postData.creatorid}" data-id="${postData.postid}">
                  <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 456.549">
                    <path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/>
                  </svg> <span>${postData.likes || 0}</span>
                </button>
                <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
                  <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.97 122.88"><title>instagram-comment</title><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/></svg>
                  Comentar
                </button>
                <button class="btn-report" data-username="${postData.creatorid}" data-id="${postData.postid}">
                  <i class="fas fa-flag"></i> Denunciar
                </button>
              </div>
              <div class="post-date">${formatarDataRelativa(postData.create)}</div>
              <div class="comments-section" style="display: none;">
                <div class="comment-form">
                  <input type="text" class="comment-input" placeholder="Escreva um comentário..."
                         data-username="${postData.creatorid}" data-post-id="${postData.postid}">
                  <button class="comment-submit" data-username="${postData.creatorid}" data-post-id="${postData.postid}">
                    <i class="fas fa-paper-plane"></i>
                  </button>
                </div>
                <div class="comments-area">
                  <div class="comments-list"></div>
                </div>
              </div>
            `;
            avisoEl.classList.remove('post-oculto-aviso');
            
            // Atualiza dados do usuário
            buscarDadosUsuarioPorUid(postData.creatorid).then(userData => {
              if (userData) {
                const avatar = avisoEl.querySelector('.avatar');
                const nome = avisoEl.querySelector('.user-name-link');
                const username = avisoEl.querySelector('.post-username');
                if (avatar) avatar.src = userData.userphoto || './src/icon/default.jpg';
                if (nome) {
                  nome.textContent = userData.displayname || userData.username || postData.creatorid;
                  if (userData.verified) {
                    nome.innerHTML = `${nome.textContent} <i class="fas fa-check-circle" style="margin-left: 4px; font-size: 0.9em; color: #4A90E2;"></i>`;
                  }
                }
                if (username) username.textContent = userData.username ? `@${userData.username}` : '';
              }
            });
          }
        }
      }

      // 👤 LINK PARA PERFIL
const userInfo = e.target.closest('.user-info');
      if (userInfo && !e.target.closest('.more-options-button')) {
        const userNameLink = userInfo.querySelector('.user-name-link');
        if (userNameLink) {
          const uid = userNameLink.dataset.username;
          if (uid) {
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            const page = isMobile ? 'pfmobile.html' : 'PF.html';
            window.location.href = `${page}?userid=${encodeURIComponent(uid)}`;
          }
        }
        return;
      }

      // ⋮ MENU 3 PONTINHOS
      if (btnMore) {
        const menu = btnMore.closest(".post-header").querySelector(".more-menu");
        menu.style.display = menu.style.display === "none" ? "block" : "none";
      }

      // 🗑️ DELETAR POST
      if (btnDelete) {
        const postId = btnDelete.dataset.id;
        const ownerId = btnDelete.dataset.owner;
        const usuarioLogado = auth.currentUser;

        if (!usuarioLogado) {
          criarPopup("Erro", "Você precisa estar logado.", "error");
          return;
        }

        if (usuarioLogado.uid !== ownerId) {
          criarPopup("Erro", "Você não pode excluir este post.", "warning");
          return;
        }

        mostrarPopupConfirmacao(
          "Apagar Post",
          "Tem certeza que deseja deletar este post?",
          async () => {
            try {
              await deleteDoc(doc(db, "posts", postId));
              await deleteDoc(doc(db, "users", ownerId, "posts", postId));
              const postElement = btnDelete.closest(".post-card");
              postElement.remove();
              criarPopup("Sucesso", "Post apagado.", "success");
            } catch (err) {
              console.error(err);
              criarPopup("Erro", "Não foi possível apagar o post.", "error");
            }
          }
        );
      }

      // ✉️ ENVIAR COMENTÁRIO (DESKTOP APENAS)
      if (commentSubmit && !isMobileDevice()) {
        const uid = commentSubmit.dataset.username;
        const postId = commentSubmit.dataset.postId;
        const commentInput = document.querySelector(`input[data-username="${uid}"][data-post-id="${postId}"]`);
        
        if (commentInput && commentInput.value.trim()) {
          const sucesso = await adicionarComentario(uid, postId, commentInput.value.trim());
          if (sucesso) {
            commentInput.value = '';
            const commentsList = commentSubmit.closest('.comments-section').querySelector('.comments-list');
            await renderizarComentarios(uid, postId, commentsList);
          }
        } else {
          criarPopup('Campo Vazio', 'Digite um comentário antes de enviar!', 'warning');
        }
      }
    });

    // ✅ ÚNICO LISTENER DE KEYPRESS NO FEED (DESKTOP)
    feed.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('comment-input') && !isMobileDevice()) {
        e.preventDefault();
        const uid = e.target.dataset.username;
        const postId = e.target.dataset.postId;
        
        if (e.target.value.trim()) {
          const sucesso = await adicionarComentario(uid, postId, e.target.value.trim());
          if (sucesso) {
            e.target.value = '';
            const commentsList = e.target.closest('.comments-section').querySelector('.comments-list');
            await renderizarComentarios(uid, postId, commentsList);
          }
        }
      }
    });
  }
}

// ===================
// LISTENER PARA NOMES DE USUÁRIOS NOS COMENTÁRIOS
// ===================
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('comentario-nome')) {
    const uid = e.target.dataset.username;
    if (uid) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const page = isMobile ? 'pfmobile.html' : 'PF.html';
      window.location.href = `${page}?userid=${encodeURIComponent(uid)}`;
    }
  }
});

// ===================
// LISTENER PARA VÍDEOS (PLAY/PAUSE AO CLICAR)
// ===================
document.addEventListener("click", (e) => {
  const video = e.target.closest("video");
  if (video) {
    if (video.paused) video.play();
    else video.pause();
  }
});


// ===================
// ATUALIZAR MARQUEE
// ===================
async function atualizarMarquee() {
  try {
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
  } catch (error) {
    console.error("Erro ao buscar último usuário:", error);
    const marquee = document.querySelector(".marquee");
    if (marquee) marquee.textContent = "Conectando...";
  }
}

// ===================
// ATUALIZAR DATAS AUTOMATICAMENTE
// ===================
function atualizarDatasAutomaticamente() {
  setInterval(() => {
    const datasPost = document.querySelectorAll('.post-date');
    datasPost.forEach(dateElement => {
      const postCard = dateElement.closest('.post-card');
      if (postCard) {
        const postIndex = Array.from(feed.children).indexOf(postCard);
        if (postIndex >= 0 && postIndex < allPosts.length) {
          const post = allPosts[postIndex];
          if (post && post.create) {
            dateElement.textContent = formatarDataRelativa(post.create);
          }
        }
      }
    });
    const datasComentario = document.querySelectorAll('.comentario-data');
    datasComentario.forEach(dateElement => {
      // Lógica similar para comentários se necessário
    });
  }, 60000);
}



// ===================
// ADICIONAR ESTILOS CSS NECESSÁRIOS
// ===================
function adicionarEstilosCSS() {
  if (document.querySelector('#enhanced-feed-styles')) return;
  const style = document.createElement('style');
  style.id = 'enhanced-feed-styles';
  style.textContent = `/* Estilos para hashtags */


    /* Estilos para imagens nos posts */
    .post-image {
      margin: 12px 0;
      border-radius: 8px;
      overflow: hidden;
      max-height: 400px;
    }

    .post-image img {
      width: 100%;
      height: auto;
      display: block;
    }

    .comments-section {
      margin-top: 10px;
      padding-top: 10px;
    }

  

    /* Responsivo para comentários */
    @media (max-width: 768px) {
      .comentario-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .comentario-meta {
        flex-direction: row;
        gap: 8px;
      }
    }
          /* Estilos para imagens nos posts */
    .post-image {
      margin: 12px 0;
      border-radius: 8px;
      overflow: hidden;
      max-height: 400px;
    }

    .post-image img {
      width: 100%;
      height: auto;
      display: block;
    }

    .comments-section {
      margin-top: 10px;
      padding-top: 10px;
    }

    /* Estilos para seção de comentários */
    .comments-area {
  max-height: 300px; /* Altura máxima da área de comentários */
  overflow-y: auto; /* Adiciona barra de rolagem vertical */
  padding: 10px;
  border-radius: 8px;
}

.comments-area::-webkit-scrollbar {
  width: 8px; /* Largura da barra de rolagem */
}

.comments-area::-webkit-scrollbar-thumb {
  background: #4A90E2; /* Cor da barra de rolagem */
  border-radius: 4px;
}

.comments-area::-webkit-scrollbar-thumb:hover {
  background: #0056b3; /* Cor ao passar o mouse */
}

.comments-area::-webkit-scrollbar-track {
  background: transparent; /* Cor do fundo da barra de rolagem */
}

    .comment-form {
      display: flex;
      gap: 10px;
      margin-bottom: 15px;
      border: 1px solid #ddd;
      border-radius: 20px;
      background: #474747; /* Quase preto, mas não absoluto */
    border: 1px solid #363636; /* Cinza quase preto pra separar do fundo */
    box-shadow: inset 0 8px 8px -7px rgba(0, 0, 0, 0.644); /* Sombra interna clara no modo dark */
    }

    .comment-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid #ddd;
      border-radius: 20px;
      font-size: 14px;
      border:none;
      background-color: transparent;
    }

    .comment-input:focus-within {
      border-color: #4A90E2;
      border: 1px solid #4A90E2;
      outline: none;
      border: none; /* garante que não crie outra borda */
    }
    
    .comment-form:focus-within {
      border-color: #4A90E2;
      box-shadow: 0 0 10px rgba(74, 144, 226, 0.6);
    }


    .comment-submit {
      background: #4A90E2;
      color: white;
      border: none;
      border-top-right-radius: 20px;
      border-bottom-right-radius: 20px;
      width: 36px;
      height: 36px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding-left:5px;
      padding-right: 5px;
    }

    .comment-submit:hover {
      background: #0056b3;
    }

    /* Estilos para comentários */
    .comentario-item {
      margin-bottom: 12px;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #141414a1;
      backdrop-filter: blur(8px);
    }

    .comentario-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .comentario-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
    }

    .comentario-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .comentario-nome {
      font-size: 13px;
      cursor: pointer;
    }

    .comentario-nome:hover {
      color: #4A90E2;
    }

    .comentario-usuario,
    .comentario-data {
      font-size: 11px;
      color: #666;
    }

    .comentario-conteudo {
      font-size: 14px;
      line-height: 1.4;
    }

    .no-comments,
    .error-comments {
      text-align: center;
      color: #666;
      font-style: italic;
      padding: 15px;
    }

    /* Estilos para nomes clicáveis */
    .user-name-link {
      cursor: pointer;
    }

    .user-name-link:hover {
      color: #4A90E2;
    }

    /* Loading melhorado */
    .loading-bar {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 4px;
      background: rgba(0, 123, 255, 0.1);
      z-index: 9999;
      opacity: 0;
      transition: opacity 0.3s ease;
    }

    .loading-bar.active {
      opacity: 1;
    }

    .loading-progress {
      height: 100%;
      background: linear-gradient(90deg, #007bff, #0056b3);
      width: 0%;
      transition: width 0.3s ease;
    }

    .loading-text {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 12px;
      z-index: 10000;
      displey:none;
    }

    .post-actions {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-top: 15px;
  border: none;
  max-width: 400px;
  margin: 0 auto;
}

    /* Responsivo para comentários */
    @media (max-width: 768px) {
      .comentario-header {
        flex-direction: column;
        align-items: flex-start;
      }
      
      .comentario-meta {
        flex-direction: row;
        gap: 8px;
      }
    }

==================================== */
  
  .image-input-container {
    margin-top: 10px;
    opacity: 0;
    max-height: 0;
    overflow: hidden;
    transition: all 0.3s ease;
  }
  
  .image-input-container.aberta {
    opacity: 1;
    max-height: 400px;
  }
  
  .upload-area {
    border: 2px dashed #4A90E2;
    border-radius: 12px;
    padding: 20px;
    background: rgba(74, 144, 226, 0.05);
    transition: all 0.3s ease;
  }
  
  .upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    padding: 30px;
    transition: all 0.3s ease;
  }
  
  .upload-label:hover {
    background: rgba(74, 144, 226, 0.1);
    border-radius: 8px;
  }
  
  .upload-label.dragover {
    background: rgba(74, 144, 226, 0.2);
    border-color: #0056b3;
    transform: scale(1.02);
  }
  
  .upload-label i {
    font-size: 48px;
    color: #4A90E2;
  }
  
  .upload-label span {
    font-size: 16px;
    font-weight: 500;
    color: #fff;
  }
  
  .upload-label small {
    font-size: 12px;
    color: #999;
  }
  
  .image-preview {
    position: relative;
    text-align: center;
    hei
  }
  
  .image-preview img {
    max-width: 100%;
    max-height: 300px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }
  
  .remove-image-btn {
    margin-top: 15px;
    padding: 10px 20px;
    background: #e74c3c;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    margin-right: auto;
  }
  
  .remove-image-btn:hover {
    background: #c0392b;
    transform: scale(1.05);
  }
  
  @media (max-width: 768px) {
    .upload-label {
      padding: 20px;
    }
    
    .upload-label i {
      font-size: 36px;
    }
    
    .upload-label span {
      font-size: 14px;
    }
  }
  `;
  document.head.appendChild(style);
  style.textContent += `

  `;
// ... o restante da sua função adicionarEstilosCSS() ...
}

// ===================
// SISTEMA DE TIPOS DE POST
// ===================
let currentPostType = 'post';
let postImageFile = null;
let storyImageFile = null;

function inicializarSistemaTipoPost() {
  const tabs = document.querySelectorAll('.post-type-tab');
  const contentTypes = document.querySelectorAll('.post-content-type');
  const sendBtn = document.querySelector('.send-post-btn');

  // Troca de tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.type;
      
      // Atualiza tabs
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      // Atualiza conteúdo
      contentTypes.forEach(ct => ct.classList.remove('active'));
      document.querySelector(`.post-content-type[data-type="${type}"]`).classList.add('active');
      
      currentPostType = type;
      
      // Limpa inputs
      limparInputsPost();
    });
  });

  // Contador de caracteres
  document.querySelectorAll('.np-text-input').forEach(textarea => {
    textarea.addEventListener('input', (e) => {
      const counter = e.target.parentElement.querySelector('.char-counter');
      if (counter) {
        const max = parseInt(textarea.getAttribute('maxlength'));
        const current = e.target.value.length;
        counter.textContent = `${current}/${max}`;
        
        if (current >= max * 0.9) {
          counter.classList.add('limit');
        } else {
          counter.classList.remove('limit');
        }
      }
    });
  });

  // Upload de imagem POST
  const postFileArea = document.getElementById('post-file-input');
  if (postFileArea) {
    postFileArea.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => handlePostImageUpload(e.target.files[0]);
      input.click();
    });
  }

  // Upload de imagem STORY
  const storyFileArea = document.getElementById('story-file-input');
  if (storyFileArea) {
    storyFileArea.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => handleStoryImageUpload(e.target.files[0]);
      input.click();
    });
  }

  // Remover imagem POST
  document.querySelector('.remove-image-post')?.addEventListener('click', () => {
    postImageFile = null;
    document.querySelector('.image-preview-post').style.display = 'none';
  });

  // Remover imagem STORY
  document.querySelector('.remove-image-story')?.addEventListener('click', () => {
    storyImageFile = null;
    document.querySelector('.image-preview-story').style.display = 'none';
  });

  // Botão de enviar
  sendBtn.addEventListener('click', enviarPublicacao);
}

function handlePostImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    criarPopup('Erro', 'Apenas imagens são permitidas', 'error');
    return;
  }

  postImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.querySelector('.image-preview-post');
    preview.querySelector('img').src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function handleStoryImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
    criarPopup('Erro', 'Apenas imagens são permitidas', 'error');
    return;
  }

  storyImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.querySelector('.image-preview-story');
    preview.querySelector('img').src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function limparInputsPost() {
  document.querySelectorAll('.np-text-input').forEach(input => {
    input.value = '';
    const counter = input.parentElement.querySelector('.char-counter');
    if (counter) {
      const max = input.getAttribute('maxlength');
      counter.textContent = `0/${max}`;
      counter.classList.remove('limit');
    }
  });
  
  postImageFile = null;
  storyImageFile = null;
  document.querySelector('.image-preview-post').style.display = 'none';
  document.querySelector('.image-preview-story').style.display = 'none';
}

async function enviarPublicacao() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    criarPopup('Erro', 'Você precisa estar logado.', 'warning');
    return;
  }

  const activeContent = document.querySelector('.post-content-type.active');
  const textarea = activeContent.querySelector('.np-text-input');
  const texto = textarea ? textarea.value.trim() : '';

  if (currentPostType === 'post') {
    await enviarPost(usuarioLogado, texto, postImageFile);
  } else if (currentPostType === 'bubble') {
    await enviarBubble(usuarioLogado, texto);
  } else if (currentPostType === 'story') {
    await enviarStory(usuarioLogado, storyImageFile);
  }
}

async function enviarPost(user, texto, imageFile) {
  if (!texto && !imageFile) {
    criarPopup('Campo Vazio', 'Adicione texto ou imagem!', 'warning');
    return;
  }

  tocarSomEnvio();
  criarAnimacaoAviaoPapel();
  const loadingInfo = mostrarLoading('Enviando post...');

  try {
    const postId = gerarIdUnico('post');
    let urlImagem = '';
    let deleteUrlImagem = '';

    if (imageFile) {
      atualizarTextoLoading('Fazendo upload da imagem...');
      const uploadResult = await uploadImagemPost(imageFile, user.uid);
      
      if (!uploadResult.success) {
        clearInterval(loadingInfo.interval);
        esconderLoading();
        criarPopup('Erro no Upload', uploadResult.error, 'error');
        return;
      }
      
      urlImagem = uploadResult.url;
      deleteUrlImagem = uploadResult.deleteUrl;
    }

    atualizarTextoLoading('Salvando post...');

    const postData = {
      content: texto,
      img: urlImagem,
      imgDeleteUrl: deleteUrlImagem,
      urlVideo: '',
      likes: 0,
      saves: 0,
      comentarios: 0,
      postid: postId,
      creatorid: user.uid,
      reports: 0,
      visible: true,
      create: serverTimestamp()
    };

    await setDoc(doc(db, 'users', user.uid, 'posts', postId), postData);
    await setDoc(doc(db, 'posts', postId), postData);

    limparInputsPost();
    document.getElementById('closeLayerBtn').click();
    
    feed.innerHTML = '';
    lastPostSnapshot = null;
    hasMorePosts = true;
    loading = false;
    await loadPosts();

    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Sucesso!', 'Post enviado com sucesso!', 'success');

  } catch (error) {
    console.error("Erro ao enviar post:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar post: ' + error.message, 'error');
  }
}

async function enviarBubble(user, texto) {
  if (!texto) {
    criarPopup('Campo Vazio', 'Escreva algo para o bubble!', 'warning');
    return;
  }

  tocarSomEnvio();
  const loadingInfo = mostrarLoading('Enviando bubble...');

  try {
    const bubbleId = gerarIdUnico('bubble');

    const bubbleData = {
      content: texto,
      bubbleid: bubbleId,
      creatorid: user.uid,
      create: serverTimestamp(),
      musicUrl: ''
    };

    await setDoc(doc(db, 'bubbles', bubbleId), bubbleData);

    limparInputsPost();
    document.getElementById('closeLayerBtn').click();

    feed.innerHTML = '';
    lastPostSnapshot = null;
    hasMorePosts = true;
    loading = false;
    await loadPosts();

    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Sucesso!', 'Bubble publicado!', 'success');

  } catch (error) {
    console.error("Erro ao enviar bubble:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar bubble: ' + error.message, 'error');
  }
}

async function enviarStory(user, imageFile) {
  if (!imageFile) {
    criarPopup('Imagem Obrigatória', 'Stories precisam de uma imagem!', 'warning');
    return;
  }

  tocarSomEnvio();
  const loadingInfo = mostrarLoading('Enviando story...');

  try {
    atualizarTextoLoading('Fazendo upload da imagem...');
    const uploadResult = await uploadImagemPost(imageFile, user.uid);
    
    if (!uploadResult.success) {
      clearInterval(loadingInfo.interval);
      esconderLoading();
      criarPopup('Erro no Upload', uploadResult.error, 'error');
      return;
    }

    const storyId = gerarIdUnico('story');

    const storyData = {
      storyid: storyId,
      creatorId: user.uid,
      img: uploadResult.url,
      create: serverTimestamp()
    };

    await setDoc(doc(db, 'storys', storyId), storyData);

    limparInputsPost();
    document.getElementById('closeLayerBtn').click();

    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Sucesso!', 'Story publicado!', 'success');

  } catch (error) {
    console.error("Erro ao enviar story:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar story: ' + error.message, 'error');
  }
}

// ===================
// INICIALIZAÇÃO
// ===================

window.addEventListener("DOMContentLoaded", async () => {
  const user = await verificarLogin();
  if (!user) return;
  adicionarEstilosCSS();
  criarInputImagem();
  criarInputVideo();
  await atualizarGreeting();
  configurarLinks();
  inicializarSistemaTipoPost();
  configurarEventListeners();
  configurarScrollInfinito();
  await atualizarMarquee();
  await loadPosts();
  atualizarDatasAutomaticamente();
  console.log("Feed aprimorado inicializado com sucesso!");
});

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('comentario-nome')) {
    const uid = e.target.dataset.username;
    if (uid) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const page = isMobile ? 'pfmobile.html' : 'PF.html';
      window.location.href = `${page}?userid=${encodeURIComponent(uid)}`;
    }
  }
});

/*document.addEventListener('DOMContentLoaded', function() {
  const searchBtn = document.querySelector('.search-mobile-btn');
  const searchContainer = document.getElementById('mobile-search-container');
  let searchInput = null;

  function showSearchInput() {
    if (!searchInput) {
      searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.placeholder = 'Buscar...';
      searchInput.className = 'search-box-mobile';
      searchInput.autocomplete = 'off';
      searchContainer.appendChild(searchInput);
    }
    searchContainer.classList.add('active');
    searchInput.focus();
  }

  function hideSearchInput() {
    searchContainer.classList.remove('active');
    if (searchInput) searchInput.blur();
  }

  // Alterna ao clicar no botão
  searchBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (searchContainer.classList.contains('active')) {
      hideSearchInput();
    } else {
      showSearchInput();
    }
  });

  // Esconde ao rolar a página
  let lastScroll = window.scrollY;
  window.addEventListener('scroll', function() {
    if (searchContainer.classList.contains('active') && Math.abs(window.scrollY - lastScroll) > 40) {
      hideSearchInput();
    }
    lastScroll = window.scrollY;
  });

  // Esconde ao clicar fora do input e do botão
  document.addEventListener('click', function(e) {
    if (
      searchContainer.classList.contains('active') &&
      !searchContainer.contains(e.target) &&
      !searchBtn.contains(e.target)
    ) {
      hideSearchInput();
    }
  });
  
});*/


window.abrirModalImagem = function(imagemUrl) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="fecharModal()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <button class="modal-close" onclick="fecharModal()">
          <i class="fas fa-times"></i>
        </button>
        <img src="${imagemUrl}" alt="Imagem ampliada" class="modal-image">
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
};
window.fecharModal = function() {
  const modal = document.querySelector('.image-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
};

document.addEventListener("click", (e) => {
  const video = e.target.closest("video");
  if (video) {
    if (video.paused) video.play();
    else video.pause();
  }
});


function configurarAutoPauseVideos() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const video = entry.target;

      if (entry.isIntersecting) {
        // Entrou na tela → toca
        if (video.paused) video.play();
      } else {
        // Saiu da tela → pausa
        if (!video.paused) video.pause();
      }
    });
  }, { threshold: 0.4 }); 
  // threshold 0.4 = precisa 40% do vídeo aparecer para tocar

  // Pegar todos os vídeos do feed
  const videos = document.querySelectorAll('.post-video video');
  videos.forEach(video => observer.observe(video));
}


function configurarLimiteRepeticoes() {
  const videos = document.querySelectorAll('.post-video video');

  videos.forEach(video => {
    let contagem = 0;

    // remover loop automático
    video.loop = false;

    video.addEventListener("ended", () => {
      contagem++;

      if (contagem < 2) {
        video.play(); // toca de novo
      } else {
        video.pause(); // pausa após 2 loops
      }
    });
  });
}


const scrollContainer = document.scrollingElement || document.documentElement;

scrollContainer.addEventListener("scroll", () => {
  const scrollTop = scrollContainer.scrollTop;
  const visibleHeight = scrollContainer.clientHeight;
  const pageHeight = scrollContainer.scrollHeight;

  if (scrollTop + visibleHeight >= pageHeight - 400 && !loading) {
    loading = true;
    loadMorePosts();
  }
});
