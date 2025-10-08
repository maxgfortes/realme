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
  where
  
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


import {
  query,
  orderBy,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let lastPostSnapshot = null; 

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

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

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
// VALIDAR URL DE IMAGEM
// ===================
async function validarUrlImagem(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    new URL(url);
    const extensoesImagem = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
    const urlLower = url.toLowerCase();
    if (extensoesImagem.some(ext => urlLower.includes(ext))) {
      return true;
    }
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      return contentType && contentType.startsWith('image/');
    } catch {
      return true;
    }
  } catch {
    return false;
  }
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
      displayname: userData.displayname || ''
    };
  } catch (error) {
    console.error("Erro ao buscar dados do usuário:", error);
    return null;
  }
}


// ===================
// SCROLL INFINITO
// ===================
function configurarScrollInfinito() {
  let isScrolling = false;
  window.addEventListener('scroll', async () => {
    if (isScrolling || loading || !hasMorePosts) return;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    if (scrollTop + windowHeight >= documentHeight - 200) {
      isScrolling = true;
      await loadPosts();
      isScrolling = false;
    }
  });
}

// ===================
// CARREGAR POSTS DO FEED (posts/{postid}) - VERSÃO CORRIGIDA
// ===================
async function carregarTodosOsPosts() {
  const loadingInfo = mostrarLoading('Buscando posts...');
  try {
    const postsRef = collection(db, 'posts');
    const postsSnapshot = await getDocs(postsRef);
    const todosOsPosts = [];
    
    for (const postDoc of postsSnapshot.docs) {
      const postData = postDoc.data();
      const userData = await buscarDadosUsuarioPorUid(postData.creatorid);
      todosOsPosts.push({
        id: postDoc.id,
        userData: userData,
        ...postData
      });
    }
    
    // ORDENAÇÃO CORRIGIDA - Posts mais recentes primeiro
    todosOsPosts.sort((a, b) => {
      if (!a.create || !b.create) return 0;
      
      // Tratamento para diferentes tipos de timestamp
      let dataA, dataB;
      
      // Se for timestamp do Firestore (objeto com seconds)
      if (typeof a.create === 'object' && a.create.seconds) {
        dataA = new Date(a.create.seconds * 1000);
      } else {
        dataA = new Date(a.create);
      }
      
      if (typeof b.create === 'object' && b.create.seconds) {
        dataB = new Date(b.create.seconds * 1000);
      } else {
        dataB = new Date(b.create);
      }
      
      // Ordena do mais recente (dataB) para o mais antigo (dataA)
      return dataB.getTime() - dataA.getTime();
    });
    
    clearInterval(loadingInfo.interval);
    esconderLoading();
    return todosOsPosts;
  } catch (error) {
    console.error("Erro ao carregar posts:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Não foi possível carregar os posts. Tente novamente.', 'error');
    return [];
  }
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
        const comentarioEl = document.createElement('div');
        comentarioEl.className = 'comentario-item';
        comentarioEl.innerHTML = `
          <div class="comentario-header">
            <img src="${fotoUsuario}" alt="Avatar" class="comentario-avatar"
                 onerror="this.src='./src/icon/default.jpg'" />
            <div class="comentario-meta">
              <strong class="comentario-nome" data-username="${comentario.senderid}">${nomeParaExibir}</strong>
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

async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;
  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Carregando...";
  }

  try {
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

    for (const postData of postsParaAdicionar) {
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
        continue;
      }

      // Renderiza o post normalmente
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
            </div>
          </div>
        </div>
        <div class="post-text">${formatarHashtags(postData.content || 'Conteúdo não disponível')}</div>
       ${postData.img ? `<div class="post-image"><img src="${postData.img}" alt="Imagem do post" loading="lazy" onerror="this.parentElement.style.display='none'" onclick="abrirModalImagem('${postData.img}')"/></div>` : ''}
        <div class="post-actions">
          <button class="btn-like" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <i class="fas fa-heart"></i> <span>${postData.likes || 0}</span>
          </button>
          <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <i class="fas fa-comment"></i> Comentar
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
      feed.appendChild(postEl);

      // Atualiza nome e foto do usuário assim que possível (não trava o loading)
      buscarDadosUsuarioPorUid(postData.creatorid).then(userData => {
        if (userData) {
          const avatar = postEl.querySelector('.avatar');
          const nome = postEl.querySelector('.user-name-link');
          const username = postEl.querySelector('.post-username');
          if (avatar) avatar.src = userData.userphoto || './src/icon/default.jpg';
          if (nome) nome.textContent = userData.displayname || userData.username || postData.creatorid;
          if (username) username.textContent = userData.username ? `@${userData.username}` : '';
        }
      });
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
// ...existing code...
// ===================
// ENVIAR POST - VERSÃO OTIMIZADA
// ===================
async function sendPost() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  
  const texto = postInput.value.trim();
  if (!texto) {
    criarPopup('Campo Vazio', 'Digite algo para postar!', 'warning');
    return;
  }
  
  const linkCheck = detectarLinksMaliciosos(texto);
  if (linkCheck.malicioso) {
    criarPopup('Link Bloqueado', `O link "${linkCheck.url}" foi identificado como potencialmente malicioso e nÃ£o pode ser postado.`, 'warning');
    return;
  }
  
  const imagemInput = document.querySelector('.image-url-input');
  let urlImagem = '';
  if (imagemInput) {
    urlImagem = imagemInput.value.trim();
    if (urlImagem && !(await validarUrlImagem(urlImagem))) {
      criarPopup('Imagem Inválida', 'A URL da imagem não é válida ou não aponta para uma imagem.', 'warning');
      return;
    }
  }
  
  tocarSomEnvio();
  criarAnimacaoAviaoPapel();
  
  const loadingInfo = mostrarLoading('Enviando post...');
  try {
    const postId = gerarIdUnico('post');
    const userData = await buscarDadosUsuarioPorUid(usuarioLogado.uid);
    
    if (!userData) {
      clearInterval(loadingInfo.interval);
      esconderLoading();
      criarPopup('Erro', 'Erro ao buscar dados do usuário', 'error');
      return;
    }
    
    const postData = {
      content: texto,
      img: urlImagem || '',
      likes: 0,
      saves: 0,
      postid: postId,
      creatorid: usuarioLogado.uid,
      reports: 0,
      create: serverTimestamp()
    };
    
    // Salvar em users/{userid}/posts/{postid}
    const userPostRef = doc(db, 'users', usuarioLogado.uid, 'posts', postId);
    await setDoc(userPostRef, postData);
    
    // Salvar em posts/{postid}
    const globalPostRef = doc(db, 'posts', postId);
    await setDoc(globalPostRef, postData);
    
    // Limpa os campos
    postInput.value = '';
    if (imagemInput) imagemInput.value = '';
    
    // Reseta as variáveis de controle e recarrega o feed
    feed.innerHTML = '';
    allPosts = [];
    currentPage = 0;
    hasMorePosts = true;
    loading = false; // IMPORTANTE: Reset da variável loading
    
    await loadPosts();
    
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Sucesso!', 'Post enviado com sucesso!', 'success');
    window.location.reload();
    
  } catch (error) {
    console.error("Erro ao enviar post:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar post, tente novamente.', 'error');
  }
}

// ===================
// CURTIR POST (posts/{postid})
// ===================
// Função para alternar entre like e deslike
async function toggleLikePost(uid, postId, element) {
  const postRef = doc(db, 'posts', postId);
  const likerRef = doc(db, `posts/${postId}/likers/${uid}`);

  try {
    // Verifica se o usuário já interagiu com o post
    const likerSnap = await getDoc(likerRef);

    if (likerSnap.exists()) {
      const likerData = likerSnap.data();

      if (likerData.like === true) {
        // Se o like está ativo, alterna para false (deslike/remover like)
        await updateDoc(likerRef, { like: false, likein: new Date() });
        await updateDoc(postRef, { likes: increment(-1) });

        // Atualiza o contador no frontend
        const spanCurtidas = element.querySelector('span');
        const curtidasAtuais = parseInt(spanCurtidas.textContent) || 0;
        spanCurtidas.textContent = curtidasAtuais - 1;
        element.style.color = ''; // Reseta a cor do botão
      } else {
        // Se o like está inativo, alterna para true (like)
        await updateDoc(likerRef, { like: true, likein: new Date() });
        await updateDoc(postRef, { likes: increment(1) });

        // Atualiza o contador no frontend
        const spanCurtidas = element.querySelector('span');
        const curtidasAtuais = parseInt(spanCurtidas.textContent) || 0;
        spanCurtidas.textContent = curtidasAtuais + 1;
        element.style.color = '#dc3545'; // Destaca o botão
      }
    } else {
      // Se o usuário nunca interagiu, cria o documento com like = true
      await setDoc(likerRef, {
        uid: uid,
        like: true,
        likein: new Date() // Timestamp do like
      });
      await updateDoc(postRef, { likes: increment(1) });

      // Atualiza o contador no frontend
      const spanCurtidas = element.querySelector('span');
      const curtidasAtuais = parseInt(spanCurtidas.textContent) || 0;
      spanCurtidas.textContent = curtidasAtuais + 1;
      element.style.color = '#dc3545'; // Destaca o botão
    }
  } catch (error) {
    console.error("Erro ao curtir/descurtir post:", error);
    criarPopup('Erro', 'Não foi possível curtir/descurtir o post. Tente novamente.', 'error');
  }
}

// Listener para capturar cliques nos botões de like
feed.addEventListener('click', async (e) => {
  const btnLike = e.target.closest('.btn-like');
  if (btnLike) {
    const uid = auth.currentUser?.uid; // ID do usuário logado
    const postId = btnLike.dataset.id; // ID do post
    if (uid && postId) {
      await toggleLikePost(uid, postId, btnLike);
    } else {
      criarPopup('Erro', 'Você precisa estar logado para curtir posts.', 'warning');
    }
  }
});



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

// ===================
// GREETING DINÂMICO COM FOTO DE PERFIL
// ===================
async function atualizarGreeting() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  const loadingInfo = mostrarLoading('Carregando dados do usuário...');
  try {
    const userData = await buscarDadosUsuarioPorUid(usuarioLogado.uid);
    const agora = new Date();
    const hora = agora.getHours();
    let saudacao;
    if (hora >= 5 && hora < 12) {
      saudacao = "Bom dia";
    } else if (hora >= 12 && hora < 18) {
      saudacao = "Boa tarde";
    } else {
      saudacao = "Boa noite";
    }
    const nome = userData?.displayname ||
      userData?.nome ||
      usuarioLogado.displayName ||
      usuarioLogado.displayname ||
      usuarioLogado.nome ||
      usuarioLogado.email;
    const greetingText = `${saudacao}`;
    const greetingElement = document.getElementById('greeting');
    if (greetingElement) {
      greetingElement.textContent = greetingText;
    }
    const usernameElement = document.getElementById('username');
    if (usernameElement) {
      usernameElement.textContent = nome;
    }
    const urlFotoPerfil = obterFotoPerfil(userData, usuarioLogado);
    const fotoPerfilWelcome = document.querySelector('.user-welcome img') ||
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
    const nome = usuarioLogado.displayName || usuarioLogado.displayname || usuarioLogado.nome || usuarioLogado.email;
    const greetingElement = document.getElementById('greeting');
    const usernameElement = document.getElementById('username');
    if (greetingElement) greetingElement.textContent = "Olá";
    if (usernameElement) usernameElement.textContent = nome;
    const urlFotoFallback = obterFotoPerfil(null, usuarioLogado);
    const fotoPerfilGreeting = document.querySelector('.greeting-profile-pic');
    if (fotoPerfilGreeting && urlFotoFallback !== './src/icon/default.jpg') {
      fotoPerfilGreeting.src = urlFotoFallback;
    }
  }
}

// ===================
// CONFIGURAR LINKS
// ===================
function configurarLinks() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  const urlPerfil = `PF.html?userid=${encodeURIComponent(usuarioLogado.uid)}`;
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
// CRIAR INPUT DE URL DE IMAGEM (fora da post-area)
// ===================
function criarInputImagem() {
  const postArea = document.querySelector('.post-area');
  const fileBtn = document.querySelector('.file-button');
  if (!postArea || !fileBtn) return;

fileBtn.addEventListener('click', () => {
  let imageInputContainer = postArea.nextElementSibling;
  if (!imageInputContainer || !imageInputContainer.classList.contains('image-input-container')) {
    imageInputContainer = document.createElement('div');
    imageInputContainer.className = 'image-input-container';
    imageInputContainer.innerHTML = `
      <input type="url" class="image-url-input" placeholder="Cole a URL da imagem aqui (opcional)">
    `;
    postArea.parentNode.insertBefore(imageInputContainer, postArea.nextSibling);
    // Adiciona a classe para animar ao abrir
    setTimeout(() => imageInputContainer.classList.add('aberta'), 10);
  } else {
    // Alterna a classe para animar abrir/fechar
    imageInputContainer.classList.toggle('aberta');
  }
});
}

// ===================
// EVENT LISTENERS
// ===================
function configurarEventListeners() {
  if (postButton) {
    postButton.addEventListener('click', sendPost);
  }
  if (postInput) {
    postInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendPost();
      }
    });
  }
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadPosts);
  }
  if (feed) {
    feed.addEventListener('click', async (e) => {
      const btnLike = e.target.closest('.btn-like');
      const btnReport = e.target.closest('.btn-report');
      const btnComment = e.target.closest('.btn-comment');
      const userNameLink = e.target.closest('.user-name-link');
      const commentSubmit = e.target.closest('.comment-submit');
      if (btnLike) {
        const uid = btnLike.dataset.username;
        const postId = btnLike.dataset.id;
        curtirPost(uid, postId, btnLike);
      }
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

const btnVer = e.target.closest('.btn-ver-post');
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
    </div>
    <div class="post-text">${formatarHashtags(postData.content || 'Conteúdo não disponível')}</div>
    ${postData.img ? `<div class="post-image"><img src="${postData.img}" alt="Imagem do post" loading="lazy" onerror="this.parentElement.style.display='none'" /></div>` : ''}
    <div class="post-actions">
      <button class="btn-like" data-username="${postData.creatorid}" data-id="${postData.postid}">
        <i class="fas fa-heart"></i> <span>${postData.likes || 0}</span>
      </button>
      <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
        <i class="fas fa-comment"></i> Comentar
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
  avisoEl.classList.remove('post-oculto-aviso'); // <-- Adicione esta linha
  // Atualiza nome e foto do usuário...

        // Atualiza nome e foto do usuário
        buscarDadosUsuarioPorUid(postData.creatorid).then(userData => {
          if (userData) {
            const avatar = avisoEl.querySelector('.avatar');
            const nome = avisoEl.querySelector('.user-name-link');
            const username = avisoEl.querySelector('.post-username');
            if (avatar) avatar.src = userData.userphoto || './src/icon/default.jpg';
            if (nome) nome.textContent = userData.displayname || userData.username || postData.creatorid;
            if (username) username.textContent = userData.username ? `@${userData.username}` : '';
          }
        });
      }
    }
  }
      if (btnComment) {
        const commentsSection = btnComment.closest('.post-card').querySelector('.comments-section');
        if (commentsSection.style.display === 'none') {
          commentsSection.style.display = 'block';
          btnComment.innerHTML = '<i class="fas fa-comment"></i> Ocultar';
          const uid = btnComment.dataset.username;
          const postId = btnComment.dataset.id;
          const commentsList = commentsSection.querySelector('.comments-list');
          await renderizarComentarios(uid, postId, commentsList);
        } else {
          commentsSection.style.display = 'none';
          btnComment.innerHTML = '<i class="fas fa-comment"></i> Comentar';
        }
      }
      if (userNameLink) {
        const uid = userNameLink.dataset.username;
        window.location.href = `PF.html?userid=${encodeURIComponent(uid)}`;
      }
      if (commentSubmit) {
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
    feed.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('comment-input')) {
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
  `;
  document.head.appendChild(style);
}

// ===================
// INICIALIZAÇÃO
// ===================
window.addEventListener("DOMContentLoaded", async () => {
  const user = await verificarLogin();
  if (!user) return;
  adicionarEstilosCSS();
  criarInputImagem();
  await atualizarGreeting();
  configurarLinks();
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
      window.location.href = `PF.html?userid=${encodeURIComponent(uid)}`;
    }
  }
});

document.addEventListener('DOMContentLoaded', function() {
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
  
});


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