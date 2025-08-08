// ===================
// SISTEMA DE LIVE STATUS AUTOMÁTICO INTEGRADO - VERSÃO CORRIGIDA
// ===================

import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  onDisconnect, 
  serverTimestamp,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  doc,
  getDoc,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const rtdb = getDatabase(app);

// ===================
// CLASSE LIVE STATUS MANAGER (mantida igual)
// ===================
class LiveStatusManager {
  constructor(username) {
    this.username = username;
    this.currentPage = this.getCurrentPage();
    this.statusRef = ref(rtdb, `userStatus/${username}`);
    this.heartbeatInterval = null;
    this.lastActivity = Date.now();
    this.isTabActive = true;
    this.awayTimeout = null;
    
    this.init();
  }

  init() {
    this.setupPresenceSystem();
    this.setupActivityTracking();
    this.setupPageTracking();
    this.setupVisibilityTracking();
    this.startHeartbeat();
    this.monitorUserStatus();
  }

  getCurrentPage() {
    const path = window.location.pathname;
    const page = path.split('/').pop() || 'index.html';
    
    const pageMap = {
      'index.html': 'Login',
      'feed.html': 'Feed',
      'PF.html': 'Perfil',
      'config.html': 'Configurações',
      'chat.html': 'Chat',
      'search.html': 'Busca'
    };

    return pageMap[page] || page.replace('.html', '');
  }

  setupPresenceSystem() {
    const statusData = {
      username: this.username,
      status: 'online',
      lastSeen: serverTimestamp(),
      currentPage: this.currentPage,
      timestamp: serverTimestamp()
    };

    set(this.statusRef, statusData);

    onDisconnect(this.statusRef).set({
      username: this.username,
      status: 'offline',
      lastSeen: serverTimestamp(),
      currentPage: this.currentPage,
      timestamp: serverTimestamp()
    });

    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snapshot) => {
      if (snapshot.val() === true) {
        console.log('✅ Conectado ao Firebase Realtime');
        set(this.statusRef, {
          ...statusData,
          status: this.isTabActive ? 'online' : 'away',
          timestamp: serverTimestamp()
        });
      }
    });
  }

  setupActivityTracking() {
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
      if (this.awayTimeout) {
        clearTimeout(this.awayTimeout);
      }
      
      if (this.isTabActive) {
        this.setStatus('online');
      }
      
      this.awayTimeout = setTimeout(() => {
        if (this.isTabActive) {
          this.setStatus('away');
        }
      }, 5 * 60 * 1000);
    };

    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, true);
    });
  }

  setupPageTracking() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.updateCurrentPage();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.updateCurrentPage();
    };

    window.addEventListener('popstate', () => {
      this.updateCurrentPage();
    });
  }

  setupVisibilityTracking() {
    document.addEventListener('visibilitychange', () => {
      this.isTabActive = !document.hidden;
      
      if (this.isTabActive) {
        this.setStatus('online');
        this.lastActivity = Date.now();
      } else {
        this.setStatus('away');
      }
    });

    window.addEventListener('beforeunload', () => {
      this.setStatus('offline');
    });

    window.addEventListener('focus', () => {
      this.isTabActive = true;
      this.setStatus('online');
    });

    window.addEventListener('blur', () => {
      this.isTabActive = false;
      this.setStatus('away');
    });
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.isTabActive) {
        this.updateHeartbeat();
      }
    }, 30000);
  }

  updateCurrentPage() {
    const newPage = this.getCurrentPage();
    if (newPage !== this.currentPage) {
      this.currentPage = newPage;
      this.updateHeartbeat();
    }
  }

  updateHeartbeat() {
    const now = Date.now();
    const timeSinceActivity = now - this.lastActivity;
    
    let status = 'online';
    if (!this.isTabActive) {
      status = 'away';
    } else if (timeSinceActivity > 5 * 60 * 1000) {
      status = 'away';
    }

    set(this.statusRef, {
      username: this.username,
      status: status,
      lastSeen: serverTimestamp(),
      currentPage: this.currentPage,
      timestamp: serverTimestamp(),
      heartbeat: now
    });
  }

  setStatus(status) {
    set(this.statusRef, {
      username: this.username,
      status: status,
      lastSeen: serverTimestamp(),
      currentPage: this.currentPage,
      timestamp: serverTimestamp()
    });
  }

  monitorUserStatus() {
    const params = new URLSearchParams(window.location.search);
    const usernameParam = params.get("username") || params.get("user");
    
    if (usernameParam && usernameParam !== this.username) {
      const targetUserRef = ref(rtdb, `userStatus/${usernameParam}`);
      onValue(targetUserRef, (snapshot) => {
        if (snapshot.exists()) {
          this.updateStatusDisplay(snapshot.val());
        } else {
          this.updateStatusDisplay({ status: 'offline' });
        }
      });
    }
  }

  updateStatusDisplay(statusData) {
    const statusBox = document.querySelector('.status-box');
    const statusText = document.querySelector('.status-text');
    
    if (!statusBox || !statusText) return;

    const { status, lastSeen, currentPage } = statusData;
    let displayText = '';
    let statusClass = '';

    switch (status) {
      case 'online':
        displayText = currentPage ? `Online • ${currentPage}` : 'Online';
        statusClass = 'online';
        break;
      case 'away':
        displayText = currentPage ? `Ausente • ${currentPage}` : 'Ausente';
        statusClass = 'away';
        break;
      case 'offline':
        const lastSeenText = this.formatLastSeen(lastSeen);
        displayText = `Offline • ${lastSeenText}`;
        statusClass = 'offline';
        break;
      default:
        displayText = 'Status desconhecido';
        statusClass = 'offline';
    }

    statusText.textContent = displayText;
    statusText.className = `status-text ${statusClass}`;

    const indicator = statusBox.querySelector('.status-indicator') || this.createStatusIndicator();
    indicator.className = `status-indicator ${statusClass}`;
    
    if (!statusBox.querySelector('.status-indicator')) {
      statusBox.querySelector('p:first-child').appendChild(indicator);
    }
  }

  createStatusIndicator() {
    const indicator = document.createElement('span');
    indicator.className = 'status-indicator';
    indicator.style.cssText = `
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-left: 8px;
      animation: pulse 2s infinite;
    `;
    return indicator;
  }

  formatLastSeen(timestamp) {
    if (!timestamp) return 'há muito tempo';
    
    const now = Date.now();
    const lastSeen = typeof timestamp === 'number' ? timestamp : timestamp.seconds * 1000;
    const diff = now - lastSeen;
    
    if (diff < 60000) return 'agora mesmo';
    if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `há ${Math.floor(diff / 3600000)}h`;
    return `há ${Math.floor(diff / 86400000)}d`;
  }

  destroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.awayTimeout) {
      clearTimeout(this.awayTimeout);
    }
    this.setStatus('offline');
  }
}

// ===================
// FUNCIONALIDADE DE BUSCA (mantida igual)
// ===================
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('searchResults');
const searchButton = document.querySelector('.search-box button');

if (searchInput && resultsList && searchButton) {
  async function performSearch() {
    const term = searchInput.value.trim().toLowerCase();
    resultsList.innerHTML = '';
    resultsList.classList.remove('visible');

    if (!term) return;

    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('username'), startAt(term), endAt(term + '\uf8ff'));

    try {
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        resultsList.innerHTML = '<li>Nenhum usuário encontrado</li>';
        resultsList.classList.add('visible');
        return;
      }

      snapshot.forEach(docSnap => {
        const user = docSnap.data();
        const li = document.createElement('li');
        li.textContent = user.username;
        li.addEventListener('click', () => {
          window.location.href = `PF.html?username=${user.username}`;
        });
        resultsList.appendChild(li);
      });

      resultsList.classList.add('visible');
    } catch (err) {
      console.error('Erro na busca:', err);
      resultsList.innerHTML = '<li>Erro na busca</li>';
      resultsList.classList.add('visible');
    }
  }

  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    performSearch();
  });

  searchInput.addEventListener('input', performSearch);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-area')) {
      resultsList.classList.remove('visible');
    }
  });
}

// ===================
// SISTEMA DE POSTS CORRIGIDO E MELHORADO
// ===================

// Variáveis globais para controle de posts
let isLoadingPosts = false;
let lastPostDoc = null;
let currentUsername = null;

// Função para formatar data
function formatarDataPost(timestamp) {
  if (!timestamp) return 'Data não disponível';
  
  try {
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp && timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp) {
      date = new Date(timestamp);
    } else {
      return 'Data inválida';
    }

    const agora = new Date();
    const diff = agora - date;
    const diffMinutos = Math.floor(diff / (1000 * 60));
    const diffHoras = Math.floor(diff / (1000 * 60 * 60));
    const diffDias = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffMinutos < 1) return 'Agora';
    if (diffMinutos < 60) return `${diffMinutos}min`;
    if (diffHoras < 24) return `${diffHoras}h`;
    if (diffDias < 7) return `${diffDias}d`;
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Data inválida';
  }
}

// Função para formatar conteúdo do post
function formatarConteudoPost(conteudo) {
  if (!conteudo) return '<p class="empty-content">Post sem conteúdo</p>';
  
  let conteudoFormatado = conteudo;
  
  // Detectar URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  conteudoFormatado = conteudoFormatado.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Detectar hashtags
  const hashtagRegex = /#(\w+)/g;
  conteudoFormatado = conteudoFormatado.replace(hashtagRegex, '<span class="hashtag">#$1</span>');
  
  // Detectar menções
  const mentionRegex = /@(\w+)/g;
  conteudoFormatado = conteudoFormatado.replace(mentionRegex, '<span class="mention">@$1</span>');
  
  // Quebras de linha
  conteudoFormatado = conteudoFormatado.replace(/\n/g, '<br>');
  
  return `<p>${conteudoFormatado}</p>`;
}

// Função para criar elemento do post
function criarElementoPost(postData, userPhoto, displayName, postId, username) {
  console.log('Criando post:', { postId, conteudo: postData.conteudo, data: postData.postadoem });
  
  const postCard = document.createElement('div');
  postCard.className = 'post-card';
  postCard.setAttribute('data-post-id', postId);

  const dataPost = formatarDataPost(postData.postadoem);
  const conteudoFormatado = formatarConteudoPost(postData.conteudo);
  
  let imagemHTML = '';
  if (postData.imagem) {
    imagemHTML = `
      <div class="post-image-container">
        <img src="${postData.imagem}" 
             alt="Imagem do post" 
             class="post-image" 
             onerror="this.parentElement.style.display='none'"
             onclick="abrirModalImagem('${postData.imagem}')">
      </div>
    `;
  }

  const curtidas = postData.curtidas || 0;

  postCard.innerHTML = `
    <div class="post-header">
      <div class="profile-info">
        <img src="${userPhoto}" 
             alt="Foto de perfil" 
             class="user-pic" 
             onerror="this.src='./src/icon/default.jpg'">
        <div class="user-details">
          <span class="display-name">${displayName}</span>
          <span class="username-small">@${username}</span>
          <span class="post-time">${dataPost}</span>
        </div>
      </div>
      <button class="post-options" onclick="mostrarOpcoesPost('${postId}')">
        <i class="fas fa-ellipsis-h"></i>
      </button>
    </div>
    
    <div class="post-content">
      ${conteudoFormatado}
      ${imagemHTML}
    </div>
    
    <div class="post-actions">
      <button class="action-btn like-btn ${curtidas > 0 ? 'has-likes' : ''}" 
              onclick="curtirPost('${postId}', '${username}', this)">
        <i class="fas fa-heart"></i>
        <span class="action-count">${curtidas > 0 ? curtidas : ''}</span>
      </button>
      
      <button class="action-btn comment-btn" onclick="abrirComentarios('${postId}')">
        <i class="fas fa-comment"></i>
        <span class="action-count"></span>
      </button>
      
      <button class="action-btn share-btn" onclick="compartilharPost('${postId}')">
        <i class="fas fa-share"></i>
      </button>
      
      <button class="action-btn bookmark-btn" onclick="salvarPost('${postId}')">
        <i class="fas fa-bookmark"></i>
      </button>
    </div>
  `;

  return postCard;
}

// Função principal para carregar posts
async function carregarPostsDoMural(username) {
  console.log('🔄 Iniciando carregamento de posts para:', username);
  
  const muralContainer = document.getElementById('muralPosts');
  if (!muralContainer) {
    console.error('❌ Container muralPosts não encontrado');
    return;
  }

  if (isLoadingPosts) {
    console.log('⏳ Já está carregando posts, aguarde...');
    return;
  }

  isLoadingPosts = true;
  currentUsername = username;

  // Mostrar loading
  muralContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Carregando posts...</p>
    </div>
  `;

  try {
    // Primeiro, buscar dados do usuário
    console.log('📋 Buscando dados do usuário...');
    const userRef = doc(db, 'users', username);
    const userDoc = await getDoc(userRef);
    
    let userData = {};
    if (userDoc.exists()) {
      userData = userDoc.data();
      console.log('✅ Dados do usuário encontrados:', userData.displayname || userData.username);
    } else {
      console.log('⚠️ Dados do usuário não encontrados, usando padrões');
    }
    
    const userPhoto = userData.userphoto || userData.foto || './src/icon/default.jpg';
    const displayName = userData.displayname || userData.username || username;

    // Buscar posts
    console.log('📝 Buscando posts...');
    const postsRef = collection(db, 'users', username, 'posts');
    const postsQuery = query(postsRef, orderBy('postadoem', 'desc'), limit(10));
    
    const snapshot = await getDocs(postsQuery);
    console.log(`📊 Encontrados ${snapshot.size} posts`);

    // Limpar container
    muralContainer.innerHTML = '';

    if (snapshot.empty) {
      console.log('📭 Nenhum post encontrado');
      muralContainer.innerHTML = `
        <div class="empty-posts">
          <div class="empty-icon">
            <i class="fas fa-pen-alt"></i>
          </div>
          <h3>Nenhum post ainda</h3>
          <p>Este usuário ainda não compartilhou nada.</p>
          ${isPerfilProprio() ? '<a href="feed.html" class="btn-primary">Fazer primeiro post</a>' : ''}
        </div>
      `;
      return;
    }

    // Criar posts
    let postsAdicionados = 0;
    snapshot.forEach(postDoc => {
      try {
        const postData = postDoc.data();
        console.log(`📄 Processando post ${postDoc.id}:`, {
          conteudo: postData.conteudo?.substring(0, 50) + '...',
          data: postData.postadoem,
          curtidas: postData.curtidas
        });
        
        const postElement = criarElementoPost(postData, userPhoto, displayName, postDoc.id, username);
        muralContainer.appendChild(postElement);
        postsAdicionados++;
      } catch (error) {
        console.error(`❌ Erro ao processar post ${postDoc.id}:`, error);
      }
    });

    // Configurar paginação
    if (snapshot.docs.length > 0) {
      lastPostDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    console.log(`✅ ${postsAdicionados} posts carregados com sucesso!`);

    // Adicionar botão "Carregar mais" se houver mais posts
    if (snapshot.docs.length === 10) {
      const loadMoreBtn = document.createElement('div');
      loadMoreBtn.className = 'load-more-container';
      loadMoreBtn.innerHTML = `
        <button class="load-more-btn" onclick="carregarMaisPosts()">
          <i class="fas fa-chevron-down"></i>
          Carregar mais posts
        </button>
      `;
      muralContainer.appendChild(loadMoreBtn);
    }

  } catch (error) {
    console.error('❌ Erro ao carregar posts:', error);
    muralContainer.innerHTML = `
      <div class="error-container">
        <div class="error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar posts</h3>
        <p>Não foi possível carregar os posts. Tente novamente.</p>
        <button onclick="location.reload()" class="btn-secondary">Tentar novamente</button>
      </div>
    `;
  } finally {
    isLoadingPosts = false;
  }
}

// Função para carregar mais posts
async function carregarMaisPosts() {
  if (!currentUsername || !lastPostDoc || isLoadingPosts) return;

  isLoadingPosts = true;
  
  const loadMoreBtn = document.querySelector('.load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    loadMoreBtn.disabled = true;
  }

  try {
    const postsRef = collection(db, 'users', currentUsername, 'posts');
    const postsQuery = query(postsRef, orderBy('postadoem', 'desc'), startAfter(lastPostDoc), limit(5));
    const snapshot = await getDocs(postsQuery);

    if (!snapshot.empty) {
      const muralContainer = document.getElementById('muralPosts');
      const loadMoreContainer = document.querySelector('.load-more-container');
      
      // Remover botão temporariamente
      if (loadMoreContainer) {
        loadMoreContainer.remove();
      }

      // Buscar dados do usuário novamente
      const userRef = doc(db, 'users', currentUsername);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.exists() ? userDoc.data() : {};
      
      const userPhoto = userData.userphoto || userData.foto || './src/icon/default.jpg';
      const displayName = userData.displayname || userData.username || currentUsername;

      // Adicionar novos posts
      snapshot.forEach(postDoc => {
        const postData = postDoc.data();
        const postElement = criarElementoPost(postData, userPhoto, displayName, postDoc.id, currentUsername);
        muralContainer.appendChild(postElement);
      });

      // Atualizar último documento
      lastPostDoc = snapshot.docs[snapshot.docs.length - 1];

      // Adicionar botão novamente se houver mais posts
      if (snapshot.docs.length === 5) {
        const loadMoreBtn = document.createElement('div');
        loadMoreBtn.className = 'load-more-container';
        loadMoreBtn.innerHTML = `
          <button class="load-more-btn" onclick="carregarMaisPosts()">
            <i class="fas fa-chevron-down"></i>
            Carregar mais posts
          </button>
        `;
        muralContainer.appendChild(loadMoreBtn);
      }
    } else {
      // Não há mais posts
      const loadMoreContainer = document.querySelector('.load-more-container');
      if (loadMoreContainer) {
        loadMoreContainer.innerHTML = `
          <div class="end-posts">
            <i class="fas fa-check-circle"></i>
            Todos os posts foram carregados
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Erro ao carregar mais posts:', error);
    if (loadMoreBtn) {
      loadMoreBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Erro - Tentar novamente';
      loadMoreBtn.disabled = false;
    }
  } finally {
    isLoadingPosts = false;
  }
}

// ===================
// FUNÇÕES DE INTERAÇÃO COM POSTS
// ===================

// Função para curtir post
async function curtirPost(postId, username, btnElement) {
  try {
    btnElement.classList.add('loading');
    
    // Simular curtida (remova este bloco se quiser implementar curtida real)
    const countElement = btnElement.querySelector('.action-count');
    let currentCount = parseInt(countElement.textContent) || 0;
    currentCount++;
    countElement.textContent = currentCount;
    btnElement.classList.add('liked', 'has-likes');
    
    // Animação
    btnElement.style.transform = 'scale(1.2)';
    setTimeout(() => {
      btnElement.style.transform = 'scale(1)';
    }, 200);

    // Implementação real seria aqui:
    // const postRef = doc(db, 'users', username, 'posts', postId);
    // await updateDoc(postRef, {
    //   curtidas: increment(1)
    // });
    
  } catch (error) {
    console.error('Erro ao curtir post:', error);
  } finally {
    btnElement.classList.remove('loading');
  }
}

// Função para abrir modal de imagem
function abrirModalImagem(imagemUrl) {
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
}

// Função para fechar modal
function fecharModal() {
  const modal = document.querySelector('.image-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
}

// Outras funções de interação
function mostrarOpcoesPost(postId) {
  console.log('Opções do post:', postId);
  // Implementar menu de opções
}

function abrirComentarios(postId) {
  console.log('Comentários do post:', postId);
  // Implementar comentários
}

function compartilharPost(postId) {
  if (navigator.share) {
    navigator.share({
      title: 'Post do RealMe',
      url: window.location.href
    }).catch(console.error);
  } else {
    // Fallback para copiar link
    navigator.clipboard.writeText(window.location.href)
      .then(() => alert('Link copiado!'))
      .catch(() => console.log('Erro ao copiar link'));
  }
}

function salvarPost(postId) {
  console.log('Salvar post:', postId);
  // Implementar salvamento
}

// ===================
// OUTRAS FUNÇÕES (mantidas iguais)
// ===================

function determinarUsuarioParaCarregar() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username") || params.get("user");
  
  if (usernameParam) {
    return usernameParam;
  }
  
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    return usuarioLogado.username;
  }
  
  return null;
}

function isPerfilProprio() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username") || params.get("user");
  
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    return !usernameParam || usernameParam === usuarioLogado.username;
  }
  
  return false;
}

async function carregarPerfilCompleto() {
  const usernameParaCarregar = determinarUsuarioParaCarregar();
  
  if (!usernameParaCarregar) {
    console.log("Nenhum usuário para carregar");
    window.location.href = 'index.html';
    return;
  }

  console.log("Carregando perfil do usuário:", usernameParaCarregar);

  try {
    const userRef = doc(db, "users", usernameParaCarregar);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      const dados = docSnap.data();
      console.log("Dados do usuário carregados:", dados);
      
      atualizarInformacoesBasicas(dados, usernameParaCarregar);
      atualizarVisaoGeral(dados);
      atualizarGostos(dados);
      atualizarImagensPerfil(dados);
      
      // Carregar posts do mural (versão corrigida)
      await carregarPostsDoMural(usernameParaCarregar);
      
    } else {
      console.log("Usuário não encontrado no banco de dados");
      const nomeElement = document.getElementById("nomeCompleto");
      if (nomeElement) nomeElement.textContent = "Usuário não encontrado";
      const usernameElement = document.getElementById("username");
      if (usernameElement) usernameElement.textContent = "";
      
      // Ainda assim tentar carregar posts
      await carregarPostsDoMural(usernameParaCarregar);
    }
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);
  }
}

// ===================
// FUNÇÕES DE ATUALIZAÇÃO DO PERFIL
// ===================
function atualizarInformacoesBasicas(dados, username) {
  const nomeCompleto = dados.displayname || `${dados.nome || ''} ${dados.sobrenome || ''}`.trim();
  const nomeElement = document.getElementById("nomeCompleto");
  if (nomeElement) {
    nomeElement.textContent = nomeCompleto || "Nome não disponível";
  }

  const usernameElement = document.getElementById("username");
  if (usernameElement) {
    usernameElement.textContent = `@${dados.username || username}`;
  }

  const tituloMural = document.getElementById("tituloMural");
  if (tituloMural) {
    tituloMural.textContent = `Mural de ${nomeCompleto || dados.username || username}`;
  }

  const visaoGeralTitle = document.getElementById("visao-geral-title");
  if (visaoGeralTitle) {
    visaoGeralTitle.textContent = `Visão Geral de ${nomeCompleto || dados.username || username}`;
  }

  if (dados.pronoun1 || dados.pronoun2) {
    const pronomes = `${dados.pronoun1 || ''}/${dados.pronoun2 || ''}`.replace(/^\/|\/$/g, '');
    const handleElement = document.querySelector('.handle');
    if (handleElement && pronomes) {
      handleElement.innerHTML = `@${dados.username || username} • ${pronomes}`;
    }
  }
}

function atualizarVisaoGeral(dados) {
  const visaoTab = document.querySelector('.visao-tab .about-container');
  if (!visaoTab) return;

  const aboutBoxes = visaoTab.querySelectorAll('.about-box');
  
  if (aboutBoxes[0]) {
    const visaoGeral = dados.visaoGeral || "Informação não disponível";
    aboutBoxes[0].innerHTML = `<p><i>Visão geral:</i></p><p>${visaoGeral}</p>`;
  }

  if (aboutBoxes[1]) {
    const tags = dados.tags || "Informação não disponível";
    aboutBoxes[1].innerHTML = `<p><i>Tags:</i></p><p>${tags}</p>`;
  }

  if (aboutBoxes[2]) {
    const estilo = dados.estilo || "Informação não disponível";
    aboutBoxes[2].innerHTML = `<p><i>Meu Estilo:</i></p><p>${estilo}</p>`;
  }

  if (aboutBoxes[3]) {
    const personalidade = dados.personalidade || "Informação não disponível";
    aboutBoxes[3].innerHTML = `<p><i>Minha personalidade:</i></p><p>${personalidade}</p>`;
  }

  if (aboutBoxes[4]) {
    const sonhos = dados.sonhos || "Informação não disponível";
    aboutBoxes[4].innerHTML = `<p><i>Meus Sonhos e desejos:</i></p><p>${sonhos}</p>`;
  }

  if (aboutBoxes[5]) {
    const medos = dados.medos || "Informação não disponível";
    aboutBoxes[5].innerHTML = `<p><i>Meus Medos:</i></p><p>${medos}</p>`;
  }
}

function atualizarGostos(dados) {
  const gostosTab = document.querySelector('.gostos-tab .about-container');
  if (!gostosTab) return;

  const aboutBoxes = gostosTab.querySelectorAll('.about-box');

  if (aboutBoxes[0]) {
    const musicas = dados.musicas || "Informação não disponível";
    aboutBoxes[0].innerHTML = `<p><i>Músicas:</i></p><p>${musicas}</p>`;
  }

  if (aboutBoxes[1]) {
    const filmesSeries = dados.filmesSeries || "Informação não disponível";
    aboutBoxes[1].innerHTML = `<p><i>Filmes e Séries:</i></p><p>${filmesSeries}</p>`;
  }

  if (aboutBoxes[2]) {
    const livros = dados.livros || "Informação não disponível";
    aboutBoxes[2].innerHTML = `<p><i>Livros:</i></p><p>${livros}</p>`;
  }

  if (aboutBoxes[3]) {
    const personagens = dados.personagens || "Informação não disponível";
    aboutBoxes[3].innerHTML = `<p><i>Personagens:</i></p><p>${personagens}</p>`;
  }

  if (aboutBoxes[4]) {
    const comidas = dados.comidas || "Informação não disponível";
    aboutBoxes[4].innerHTML = `<p><i>Comidas e Bebidas:</i></p><p>${comidas}</p>`;
  }

  if (aboutBoxes[5]) {
    const hobbies = dados.hobbies || "Informação não disponível";
    aboutBoxes[5].innerHTML = `<p><i>Hobbies:</i></p><p>${hobbies}</p>`;
  }

  if (aboutBoxes[6]) {
    const jogos = dados.jogos || "Informação não disponível";
    aboutBoxes[6].innerHTML = `<p><i>Jogos favoritos:</i></p><p>${jogos}</p>`;
  }

  if (aboutBoxes[7]) {
    const outrosGostos = dados.outrosGostos || "Informação não disponível";
    aboutBoxes[7].innerHTML = `<p><i>Outros gostos:</i></p><p>${outrosGostos}</p>`;
  }
}

function atualizarImagensPerfil(dados) {
  const profilePic = document.querySelector('.profile-pic');
  if (profilePic) {
    if (dados.userphoto || dados.foto) {
      profilePic.src = dados.userphoto || dados.foto;
      profilePic.onerror = () => {
        profilePic.src = './src/icon/default.jpg';
      };
    } else {
      profilePic.src = './src/icon/default.jpg';
    }
  }

  const userPics = document.querySelectorAll('.user-pic');
  userPics.forEach(pic => {
    if (dados.userphoto || dados.foto) {
      pic.src = dados.userphoto || dados.foto;
      pic.onerror = () => {
        pic.src = './src/icon/default.jpg';
      };
    } else {
      pic.src = './src/icon/default.jpg';
    }
  });

  if (dados.backgroundphoto || dados.imagemFundo) {
    const profileHeader = document.querySelector('.profile-header');
    if (profileHeader) {
      const backgroundUrl = dados.backgroundphoto || dados.imagemFundo;
      profileHeader.style.backgroundImage = `url(${backgroundUrl})`;
      profileHeader.style.backgroundSize = 'cover';
      profileHeader.style.backgroundPosition = 'center';
      profileHeader.style.position = 'relative';
      profileHeader.style.backgroundAttachment = 'scroll';
    }
    
    const backgroundElements = document.querySelectorAll('.background-image, .hero-bg, .banner-bg');
    backgroundElements.forEach(element => {
      element.style.backgroundImage = `url(${backgroundUrl})`;
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
    });
  }

  if (dados.headerphoto) {
    const headerImages = document.querySelectorAll('.header-image, .banner-image, .cover-photo');
    headerImages.forEach(img => {
      if (img.tagName === 'IMG') {
        img.src = dados.headerphoto;
        img.onerror = () => {
          img.src = './src/bg/bg.jpg';
        };
      } else {
        img.style.backgroundImage = `url(${dados.headerphoto})`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
      }
    });
    
    if (!dados.backgroundphoto && !dados.imagemFundo) {
      const profileHeader = document.querySelector('.profile-header');
      if (profileHeader) {
        profileHeader.style.backgroundImage = `url(${dados.headerphoto})`;
        profileHeader.style.backgroundSize = 'cover';
        profileHeader.style.backgroundPosition = 'center';
      }
    }
  }

  const usernameSpans = document.querySelectorAll('.username');
  const displayName = dados.displayname || dados.username;
  usernameSpans.forEach(span => {
    if (displayName) {
      span.textContent = displayName;
    }
  });
}

function configurarLinks() {
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    const username = usuarioLogado.username;
    
    const urlPerfil = `PF.html?username=${encodeURIComponent(username)}`;
    
    const linkSidebar = document.getElementById('linkPerfilSidebar');
    const linkMobile = document.getElementById('linkPerfilMobile');
    
    if (linkSidebar) linkSidebar.href = urlPerfil;
    if (linkMobile) linkMobile.href = urlPerfil;
  }

  const btnSair = document.getElementById('btnSair');
  if (btnSair) {
    btnSair.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('usuarioLogado');
      window.location.href = 'index.html';
    });
  }
}

async function atualizarMarqueeUltimoUsuario() {
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
    if (marquee) marquee.textContent = "Erro ao carregar dados.";
  }
}

function verificarLogin() {
  const usuarioLogado = localStorage.getItem('usuarioLogado');
  if (!usuarioLogado) {
    console.log("Usuário não está logado, redirecionando para login");
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ===================
// INICIALIZAÇÃO
// ===================
let liveStatusManager = null;

window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Carregando página de perfil...");
  
  if (!verificarLogin()) {
    return;
  }
  
  // Inicializar Live Status
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    liveStatusManager = new LiveStatusManager(usuarioLogado.username);
  }
  
  await carregarPerfilCompleto();
  await atualizarMarqueeUltimoUsuario();
  configurarLinks();
  
  console.log("✅ Página de perfil carregada com sucesso!");
});

// Cleanup ao sair da página
window.addEventListener('beforeunload', () => {
  if (liveStatusManager) {
    liveStatusManager.destroy();
  }
});

// Tornar funções globais para onclick
window.curtirPost = curtirPost;
window.abrirModalImagem = abrirModalImagem;
window.fecharModal = fecharModal;
window.mostrarOpcoesPost = mostrarOpcoesPost;
window.abrirComentarios = abrirComentarios;
window.compartilharPost = compartilharPost;
window.salvarPost = salvarPost;
window.carregarMaisPosts = carregarMaisPosts;

// ===================
// CSS MELHORADO PARA POSTS E STATUS
// ===================
const postCSS = `
<style>
/* Status Indicators */
.status-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 8px;
}

.status-indicator.online {
  background-color: #28a745;
  animation: pulse-green 2s infinite;
}

.status-indicator.away {
  background-color: #ffc107;
}

.status-indicator.offline {
  background-color: #dc3545;
}

@keyframes pulse-green {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.status-text.online { color: #28a745; font-weight: bold; }
.status-text.away { color: #ffc107; font-weight: bold; }
.status-text.offline { color: #dc3545; }

/* Loading States */
.loading-container, .error-container, .empty-posts {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  min-height: 200px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-icon, .error-icon {
  font-size: 3.5em;
  color: #ccc;
  margin-bottom: 20px;
}

.error-icon {
  color: #dc3545;
}

.empty-posts h3, .error-container h3 {
  color: #333;
  margin-bottom: 10px;
  font-size: 1.3em;
}

.empty-posts p, .error-container p {
  color: #666;
  margin-bottom: 20px;
  line-height: 1.5;
}

.btn-primary, .btn-secondary {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
  display: inline-block;
}

.btn-primary {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,123,255,0.3);
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
  transform: translateY(-2px);
}

/* Post Cards */
.post-card {
  background: white;
  border-radius: 16px;
  margin-bottom: 20px;
  padding: 20px;
  box-shadow: 0 2px 12px rgba(0,0,0,0.1);
  border: 1px solid #e9ecef;
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease-out;
  position: relative;
  overflow: hidden;
}

.post-card:hover {
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  transform: translateY(-2px);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Post Header */
.post-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.profile-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-pic {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #e9ecef;
  transition: border-color 0.3s ease;
}

.user-pic:hover {
  border-color: #007bff;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.display-name {
  font-weight: 700;
  color: #333;
  font-size: 1.1em;
  line-height: 1.2;
}

.username-small {
  color: #666;
  font-size: 0.9em;
  font-weight: 500;
}

.post-time {
  color: #999;
  font-size: 0.85em;
  font-weight: 400;
}

.post-options {
  background: none;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.post-options:hover {
  background: #f8f9fa;
  color: #333;
}

/* Post Content */
.post-content {
  margin-bottom: 15px;
  line-height: 1.6;
}

.post-content p {
  margin: 0;
  color: #333;
  font-size: 1.05em;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.empty-content {
  color: #999;
  font-style: italic;
}

.hashtag {
  color: #007bff;
  font-weight: 600;
  cursor: pointer;
}

.hashtag:hover {
  text-decoration: underline;
}

.mention {
  color: #007bff;
  font-weight: 600;
  cursor: pointer;
}

.mention:hover {
  text-decoration: underline;
}

.post-content a {
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
}

.post-content a:hover {
  text-decoration: underline;
}

/* Post Images */
.post-image-container {
  margin-top: 15px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.post-image {
  width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: cover;
  transition: transform 0.3s ease;
  display: block;
}

.post-image:hover {
  transform: scale(1.02);
}

/* Post Actions */
.post-actions {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-top: 15px;
  border-top: 1px solid #333;
  max-width: 400px;
  margin: 0 auto;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  font-size: 0.95em;
  padding: 8px 16px;
  border-radius: 20px;
  transition: all 0.3s ease;
  font-weight: 500;
}

.action-btn:hover {
  background: #f8f9fa;
  color: #333;
}

.action-btn i {
  font-size: 1.1em;
}

.action-btn.loading {
  opacity: 0.6;
  pointer-events: none;
}

.action-btn.loading i {
  animation: spin 1s linear infinite;
}

/* Like Button Specific */
.like-btn:hover {
  color: #e91e63 !important;
  background: rgba(233, 30, 99, 0.1) !important;
}

.like-btn.liked {
  color: #e91e63 !important;
}

.like-btn.has-likes .action-count {
  font-weight: 700;
}

/* Other Action Buttons */
.comment-btn:hover {
  color: #1da1f2 !important;
  background: rgba(29, 161, 242, 0.1) !important;
}

.share-btn:hover {
  color: #17bf63 !important;
  background: rgba(23, 191, 99, 0.1) !important;
}

.bookmark-btn:hover {
  color: #f39c12 !important;
  background: rgba(243, 156, 18, 0.1) !important;
}

.action-count {
  font-size: 0.9em;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

/* Load More Button */
.load-more-container {
  display: flex;
  justify-content: center;
  padding: 30px 20px;
}

.load-more-btn {
  background-color: #4A90E2;
  color: #fff;
  border: none;
  padding: 12px 24px;
  border-radius: 25px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.load-more-btn:hover {
  background-color: #4A90E2;
  color: #fff;
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.end-posts {
  text-align: center;
  color: #28a745;
  font-weight: 600;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Image Modal */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-overlay {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  padding: 20px;
  box-sizing: border-box;
}

.modal-content {
  position: relative;
  max-width: 90%;
  max-height: 90%;
  animation: zoomIn 0.3s ease-out;
}

@keyframes zoomIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-image {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
}

.modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  background: white;
  border: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #333;
  transition: all 0.3s ease;
  box-shadow: 0 2px 10px rgba(0,0,0,0.2);
}

.modal-close:hover {
  background: #f8f9fa;
  transform: scale(1.1);
}

/* Responsive Design */
@media (max-width: 768px) {
  .post-card {
    margin-bottom: 15px;
    padding: 15px;
    border-radius: 12px;
  }
  
  .post-actions {
    max-width: 100%;
    justify-content: space-between;
  }
  
  .action-btn {
    padding: 6px 12px;
    font-size: 0.9em;
  }
  
  .user-pic {
    width: 42px;
    height: 42px;
  }
  
  .display-name {
    font-size: 1em;
  }
  
  .modal-content {
    max-width: 95%;
    max-height: 80%;
  }
  
  .modal-close {
    top: -40px;
    width: 35px;
    height: 35px;
    font-size: 14px;
  }
  
  .loading-container, .error-container, .empty-posts {
    padding: 40px 15px;
    min-height: 150px;
  }
  
  .empty-icon, .error-icon {
    font-size: 2.5em;
  }
}

@media (max-width: 480px) {
  .post-actions {
    flex-wrap: wrap;
    gap: 10px;
  }
  
  .action-btn {
    flex: 1;
    min-width: calc(50% - 5px);
    justify-content: center;
  }
}

/* Dark mode support (opcional) */
@media (prefers-color-scheme: dark) {
  .post-card {
    background: #1a1a1a;
    border-color: #333;
    color: #fff;
  }
  
  .display-name, .post-content p {
    color: #fff;
  }
  
  .username-small, .post-time {
    color: #aaa;
  }
  
  .action-btn {
    color: #aaa;
  }
  
  .action-btn:hover {
    background: #333;
    color: #fff;
  }
  
  .post-options:hover {
    background: #333;
  }
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', postCSS);