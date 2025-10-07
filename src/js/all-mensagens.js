/// ===================
// SISTEMA DE LIVE STATUS AUTOMÁTICO INTEGRADO - VERSÃO COMPLETA
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
  setDoc,
  addDoc,
  limit,
  startAfter,
  deleteDoc,
  updateDoc,
  increment
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
// SISTEMA DE SEGUIR/SEGUINDO
// ===================

// Variáveis globais para sistema de seguir
let currentUserData = null;
let targetUserData = null;
let isFollowing = false;

// Função para verificar se está seguindo
async function verificarSeEstaSeguindo(currentUser, targetUser) {
  try {
    const seguidoresRef = doc(db, 'users', targetUser, 'seguidores', 'users');
    const seguidoresDoc = await getDoc(seguidoresRef);
    
    if (seguidoresDoc.exists()) {
      const seguidoresData = seguidoresDoc.data();
      return seguidoresData.hasOwnProperty(currentUser);
    }
    return false;
  } catch (error) {
    console.error('Erro ao verificar seguimento:', error);
    return false;
  }
}

// Função para seguir usuário
async function seguirUsuario(currentUser, targetUser) {
  try {
    // Adicionar aos seguidores do usuário target
    const seguidoresRef = doc(db, 'users', targetUser, 'seguidores', 'users');
    const seguidoresDoc = await getDoc(seguidoresRef);
    let seguidoresData = seguidoresDoc.exists() ? seguidoresDoc.data() : {};
    seguidoresData[currentUser] = currentUser;
    await setDoc(seguidoresRef, seguidoresData);

    // Adicionar aos seguindo do usuário atual
    const seguindoRef = doc(db, 'users', currentUser, 'seguindo', 'users');
    const seguindoDoc = await getDoc(seguindoRef);
    let seguindoData = seguindoDoc.exists() ? seguindoDoc.data() : {};
    seguindoData[targetUser] = targetUser;
    await setDoc(seguindoRef, seguindoData);

    console.log(`${currentUser} agora está seguindo ${targetUser}`);
    return true;
  } catch (error) {
    console.error('Erro ao seguir usuário:', error);
    return false;
  }
}

// Função para deixar de seguir usuário
async function deixarDeSeguir(currentUser, targetUser) {
  try {
    // Remover dos seguidores do usuário target
    const seguidoresRef = doc(db, 'users', targetUser, 'seguidores', 'users');
    const seguidoresDoc = await getDoc(seguidoresRef);
    if (seguidoresDoc.exists()) {
      let seguidoresData = seguidoresDoc.data();
      delete seguidoresData[currentUser];
      await setDoc(seguidoresRef, seguidoresData);
    }

    // Remover dos seguindo do usuário atual
    const seguindoRef = doc(db, 'users', currentUser, 'seguindo', 'users');
    const seguindoDoc = await getDoc(seguindoRef);
    if (seguindoDoc.exists()) {
      let seguindoData = seguindoDoc.data();
      delete seguindoData[targetUser];
      await setDoc(seguindoRef, seguindoData);
    }

    console.log(`${currentUser} deixou de seguir ${targetUser}`);
    return true;
  } catch (error) {
    console.error('Erro ao deixar de seguir usuário:', error);
    return false;
  }
}

// Função para contar seguidores
async function contarSeguidores(username) {
  try {
    const seguidoresRef = doc(db, 'users', username, 'seguidores', 'users');
    const seguidoresDoc = await getDoc(seguidoresRef);
    
    if (seguidoresDoc.exists()) {
      const seguidoresData = seguidoresDoc.data();
      return Object.keys(seguidoresData).length;
    }
    return 0;
  } catch (error) {
    console.error('Erro ao contar seguidores:', error);
    return 0;
  }
}

// Função para contar seguindo
async function contarSeguindo(username) {
  try {
    const seguindoRef = doc(db, 'users', username, 'seguindo', 'users');
    const seguindoDoc = await getDoc(seguindoRef);
    
    if (seguindoDoc.exists()) {
      const seguindoData = seguindoDoc.data();
      return Object.keys(seguindoData).length;
    }
    return 0;
  } catch (error) {
    console.error('Erro ao contar seguindo:', error);
    return 0;
  }
}

// Função para atualizar estatísticas do perfil
async function atualizarEstatisticasPerfil(username) {
  try {
    const postsRef = collection(db, 'users', username, 'posts');
    const postsSnapshot = await getDocs(postsRef);
    const numPosts = postsSnapshot.size;

    const numSeguidores = await contarSeguidores(username);
    const numSeguindo = await contarSeguindo(username);

    const statsElement = document.querySelector('.profile-stats');
    if (statsElement) {
      statsElement.innerHTML = `
        <span><strong>${numPosts}</strong> posts</span>
        <span><strong>${numSeguidores}</strong> seguidores</span>
        <span><strong>0</strong> amigos</span>
        <span><strong>${numSeguindo}</strong> seguindo</span>
      `;
    }

    console.log(`Estatísticas atualizadas: ${numPosts} posts, ${numSeguidores} seguidores, ${numSeguindo} seguindo`);
  } catch (error) {
    console.error('Erro ao atualizar estatísticas:', error);
  }
}

// Função para configurar botão de seguir
// Função para configurar botão de seguir ou editar perfil
async function configurarBotaoSeguir() {
  const followBtn = document.querySelector('.btn-follow');
  if (!followBtn) return;

  const currentUserJson = localStorage.getItem('usuarioLogado');
  if (!currentUserJson) return;

  const currentUser = JSON.parse(currentUserJson);
  const params = new URLSearchParams(window.location.search);
  const targetUsername = params.get("username") || params.get("user");

  // Se for o próprio perfil
  if (!targetUsername || targetUsername === currentUser.username) {
    followBtn.style.display = 'none'; // esconde o botão seguir

    // cria botão editar perfil
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar perfil';
    editBtn.className = 'btn-edit-profile';
    editBtn.onclick = () => {
      window.location.href = 'config.html';
    };

    // adiciona no mesmo container do followBtn
    followBtn.parentNode.appendChild(editBtn);
    return;
  }

  // Verificar se já está seguindo
  isFollowing = await verificarSeEstaSeguindo(currentUser.username, targetUsername);
  
  // Atualizar texto do botão
  followBtn.textContent = isFollowing ? 'seguindo' : 'seguir';
  followBtn.className = isFollowing ? 'btn-follow following' : 'btn-follow';

  // Adicionar event listener
  followBtn.onclick = async () => {
    followBtn.disabled = true;
    followBtn.textContent = 'carregando...';

    try {
      if (isFollowing) {
        const success = await deixarDeSeguir(currentUser.username, targetUsername);
        if (success) {
          isFollowing = false;
          followBtn.textContent = 'seguir';
          followBtn.className = 'btn-follow';
        }
      } else {
        const success = await seguirUsuario(currentUser.username, targetUsername);
        if (success) {
          isFollowing = true;
          followBtn.textContent = 'seguindo';
          followBtn.className = 'btn-follow following';
        }
      }
      
      // Atualizar estatísticas
      await atualizarEstatisticasPerfil(targetUsername);
      
    } catch (error) {
      console.error('Erro ao processar seguimento:', error);
      followBtn.textContent = 'erro';
    } finally {
      followBtn.disabled = false;
    }
  };
}


// ===================
// SISTEMA DE DEPOIMENTOS
// ===================

// Função para carregar depoimentos
async function carregarDepoimentos(username) {
  console.log('🔄 Carregando depoimentos para:', username);
  
  const depoimentosContainer = document.querySelector('.deps-tab .about-container');
  if (!depoimentosContainer) {
    console.error('❌ Container de depoimentos não encontrado');
    return;
  }

  try {
    // Mostrar loading
    depoimentosContainer.innerHTML = `
      <div class="loading-container">
        <div class="loading-spinner"></div>
        <p>Carregando depoimentos...</p>
      </div>
    `;

    // Buscar depoimentos
    const depoimentosRef = collection(db, 'users', username, 'depoimentos');
    const depoimentosQuery = query(depoimentosRef, orderBy('criadoem', 'desc'));
    const snapshot = await getDocs(depoimentosQuery);

    // Limpar container
    depoimentosContainer.innerHTML = '';

    // Verificar se é perfil próprio para mostrar/esconder botão
    const currentUserJson = localStorage.getItem('usuarioLogado');
    const isOwnProfile = currentUserJson ? JSON.parse(currentUserJson).username === username : false;

    // Adicionar botão de enviar depoimento (apenas para outros usuários)
    if (!isOwnProfile) {
      const depoimentoForm = document.createElement('div');
      depoimentoForm.className = 'depoimento-form';
      depoimentoForm.innerHTML = `
        <h4>Deixar um depoimento</h4>
        <textarea id="depoimentoTexto" placeholder="Escreva seu depoimento aqui..." maxlength="500"></textarea>
        <div class="form-actions">
          <span class="char-count">0/500</span>
          <button class="btn-enviar-depoimento" onclick="enviarDepoimento('${username}')">
            <i class="fas fa-paper-plane"></i> Enviar Depoimento
          </button>
        </div>
      `;
      depoimentosContainer.appendChild(depoimentoForm);

      // Contador de caracteres
      const textarea = depoimentoForm.querySelector('#depoimentoTexto');
      const charCount = depoimentoForm.querySelector('.char-count');
      textarea.addEventListener('input', () => {
        const count = textarea.value.length;
        charCount.textContent = `${count}/500`;
        charCount.style.color = count > 450 ? '#dc3545' : '#666';
      });
    }

    if (snapshot.empty) {
      console.log('📭 Nenhum depoimento encontrado');
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-depoimentos';
      emptyDiv.innerHTML = `
        <div class="empty-icon">
          <i class="fas fa-comments"></i>
        </div>
        <h3>Nenhum depoimento ainda</h3>
        <p>${isOwnProfile ? 'Você ainda não recebeu depoimentos.' : 'Este usuário ainda não recebeu depoimentos.'}</p>
      `;
      depoimentosContainer.appendChild(emptyDiv);
      return;
    }

    // Criar depoimentos
    let depoimentosAdicionados = 0;
    
    for (const depoDoc of snapshot.docs) {
      try {
        const depoData = depoDoc.data();
        console.log(`📄 Processando depoimento ${depoDoc.id}:`, {
          conteudo: depoData.conteudo?.substring(0, 50) + '...',
          username: depoData.username,
          data: depoData.criadoem
        });

        // Buscar dados do autor do depoimento
        let autorData = {};
        if (depoData.username) {
          const autorRef = doc(db, 'users', depoData.username);
          const autorDoc = await getDoc(autorRef);
          if (autorDoc.exists()) {
            autorData = autorDoc.data();
          }
        }

        const depoElement = criarElementoDepoimento(depoData, autorData, depoDoc.id, username);
        depoimentosContainer.appendChild(depoElement);
        depoimentosAdicionados++;
      } catch (error) {
        console.error(`❌ Erro ao processar depoimento ${depoDoc.id}:`, error);
      }
    }

    console.log(`✅ ${depoimentosAdicionados} depoimentos carregados com sucesso!`);

  } catch (error) {
    console.error('❌ Erro ao carregar depoimentos:', error);
    depoimentosContainer.innerHTML = `
      <div class="error-container">
        <div class="error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar depoimentos</h3>
        <p>Não foi possível carregar os depoimentos. Tente novamente.</p>
        <button onclick="carregarDepoimentos('${username}')" class="btn-secondary">Tentar novamente</button>
      </div>
    `;
  }
}

// Função para criar elemento do depoimento
function criarElementoDepoimento(depoData, autorData, depoId, targetUsername) {
  const depoElement = document.createElement('div');
  depoElement.className = 'depoimento-card';
  depoElement.setAttribute('data-depo-id', depoId);

  const autorFoto = autorData.userphoto || autorData.foto || './src/icon/default.jpg';
  const autorNome = autorData.displayname || autorData.username || depoData.username || 'Usuário Anônimo';
  const dataFormatada = formatarDataPost(depoData.criadoem);
  const conteudo = depoData.conteudo || 'Depoimento sem conteúdo';

  const currentUserJson = localStorage.getItem('usuarioLogado');
  const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;

  // Verificar se usuário logado é dono do perfil (targetUsername) ou autor do depoimento (depoData.username)
  const isOwner = currentUser && currentUser.username === targetUsername;
  const isAuthor = currentUser && currentUser.username === depoData.username;

  const podeExcluir = isOwner || isAuthor;

  depoElement.innerHTML = `
    <div class="depoimento-header">
      <div class="autor-info">
        <img src="${autorFoto}" 
             alt="Foto do autor" 
             class="autor-pic" 
             onerror="this.src='./src/icon/default.jpg'"
             onclick="window.location.href='PF.html?username=${depoData.username}'">
        <div class="autor-details">
          <span class="autor-nome" onclick="window.location.href='PF.html?username=${depoData.username}'">${autorNome}</span>
          <span class="depo-time">${dataFormatada}</span>
        </div>
      </div>
      ${podeExcluir ? `<button class="delete-depo-btn" onclick="excluirDepoimento('${depoId}', '${targetUsername}')">
        <i class="fas fa-trash"></i>
      </button>` : ''}
    </div>
    
    <div class="depoimento-content">
      <p>${conteudo}</p>
    </div>
  `;

  return depoElement;
}


// Função para enviar depoimento
async function enviarDepoimento(targetUsername) {
  const textarea = document.getElementById('depoimentoTexto');
  const btnEnviar = document.querySelector('.btn-enviar-depoimento');
  
  if (!textarea || !btnEnviar) return;

  const conteudo = textarea.value.trim();
  if (!conteudo) {
    alert('Por favor, escreva um depoimento antes de enviar.');
    return;
  }

  const currentUserJson = localStorage.getItem('usuarioLogado');
  if (!currentUserJson) {
    alert('Você precisa estar logado para enviar depoimentos.');
    return;
  }

  const currentUser = JSON.parse(currentUserJson);

  // Verificar se não está tentando fazer autodepoimento
  if (currentUser.username === targetUsername) {
    alert('Você não pode deixar um depoimento para si mesmo.');
    return;
  }

  btnEnviar.disabled = true;
  btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  try {
    // Gerar ID único para o depoimento
    const depoId = `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const depoimentoData = {
      conteudo: conteudo,
      username: currentUser.username,
      criadoem: new Date(),
      targetUser: targetUsername
    };

    // Salvar depoimento
    const depoRef = doc(db, 'users', targetUsername, 'depoimentos', depoId);
    await setDoc(depoRef, depoimentoData);

    console.log('✅ Depoimento enviado com sucesso!');
    
    // Limpar formulário
    textarea.value = '';
    const charCount = document.querySelector('.char-count');
    if (charCount) charCount.textContent = '0/500';

    // Recarregar depoimentos
    await carregarDepoimentos(targetUsername);

    // Mostrar mensagem de sucesso
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.textContent = 'Depoimento enviado com sucesso!';
    successMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #28a745;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
      successMsg.remove();
    }, 3000);

  } catch (error) {
    console.error('❌ Erro ao enviar depoimento:', error);
    alert('Erro ao enviar depoimento. Tente novamente.');
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Depoimento';
  }
}

// Função para excluir depoimento
async function excluirDepoimento(depoId, targetUsername) {
  if (!confirm('Tem certeza que deseja excluir este depoimento?')) {
    return;
  }

  try {
    const depoRef = doc(db, 'users', targetUsername, 'depoimentos', depoId);
    await deleteDoc(depoRef);

    console.log('✅ Depoimento excluído com sucesso!');
    
    // Recarregar depoimentos
    await carregarDepoimentos(targetUsername);

    // Mostrar mensagem de sucesso
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.textContent = 'Depoimento excluído com sucesso!';
    successMsg.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #dc3545;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 9999;
      animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(successMsg);
    
    setTimeout(() => {
      successMsg.remove();
    }, 3000);

  } catch (error) {
    console.error('❌ Erro ao excluir depoimento:', error);
    alert('Erro ao excluir depoimento. Tente novamente.');
  }
  
}

// ===================
// SISTEMA DE LINKS
// ===================

// Função para carregar links do usuário
async function carregarLinks(username) {
  console.log('🔄 Carregando links para:', username);
  
  const linksContainer = document.querySelector('.links-tab .about-container');
  if (!linksContainer) {
    console.error('❌ Container de links não encontrado');
    return;
  }

  try {
    // Buscar dados do usuário para pegar links
    const userRef = doc(db, 'users', username);
    const userDoc = await getDoc(userRef);
    
    linksContainer.innerHTML = '';

    if (!userDoc.exists()) {
      linksContainer.innerHTML = `
        <div class="empty-links">
          <div class="empty-icon">
            <i class="fas fa-link"></i>
          </div>
          <h3>Usuário não encontrado</h3>
        </div>
      `;
      return;
    }

    const userData = userDoc.data();
    const links = userData.links || {};

    // Se não há links
    if (!links || Object.keys(links).length === 0) {
      linksContainer.innerHTML = `
        <div class="empty-links">
          <div class="empty-icon">
            <i class="fas fa-link"></i>
          </div>
          <h3>Nenhum link ainda</h3>
          <p>Este usuário ainda não adicionou nenhum link.</p>
        </div>
      `;
      return;
    }

    // Criar elementos de link
    Object.entries(links).forEach(([key, url]) => {
      if (url && url.trim()) {
        const linkElement = document.createElement('div');
        linkElement.className = 'link-box';
        
        // Detectar tipo de link e adicionar ícone apropriado
        let icon = 'fas fa-external-link-alt';
        let label = key;
        
        if (url.includes('instagram.com')) {
          icon = 'fab fa-instagram';
          label = 'Instagram';
        } else if (url.includes('twitter.com') || url.includes('x.com')) {
          icon = 'fab fa-twitter';
          label = 'Twitter/X';
        } else if (url.includes('tiktok.com')) {
          icon = 'fab fa-tiktok';
          label = 'TikTok';
        } else if (url.includes('youtube.com')) {
          icon = 'fab fa-youtube';
          label = 'YouTube';
        } else if (url.includes('github.com')) {
          icon = 'fab fa-github';
          label = 'GitHub';
        } else if (url.includes('linkedin.com')) {
          icon = 'fab fa-linkedin';
          label = 'LinkedIn';
        } else if (url.includes('discord')) {
          icon = 'fab fa-discord';
          label = 'Discord';
        } else if (url.includes('spotify.com')) {
          icon = 'fab fa-spotify';
          label = 'Spotify';
        }

        linkElement.innerHTML = `
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="user-link">
            <i class="${icon}"></i>
            <span>${label}</span>
            <i class="fas fa-external-link-alt link-arrow"></i>
          </a>
        `;
        
        linksContainer.appendChild(linkElement);
      }
    });

    console.log(`✅ ${Object.keys(links).length} links carregados com sucesso!`);

  } catch (error) {
    console.error('❌ Erro ao carregar links:', error);
    linksContainer.innerHTML = `
      <div class="error-container">
        <div class="error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar links</h3>
        <p>Não foi possível carregar os links. Tente novamente.</p>
        <button onclick="carregarLinks('${username}')" class="btn-secondary">Tentar novamente</button>
      </div>
    `;
  }
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
// SISTEMA DE NAVEGAÇÃO ENTRE TABS
// ===================

// Função para configurar navegação entre tabs
function configurarNavegacaoTabs() {
  const menuItems = document.querySelectorAll('.menu-item');
  const tabs = document.querySelectorAll('.tab');
  
  if (!menuItems.length || !tabs.length) return;

  menuItems.forEach((item, index) => {
    item.addEventListener('click', async () => {
      // Remover classe active de todos os itens e tabs
      menuItems.forEach(mi => mi.classList.remove('active'));
      tabs.forEach(tab => tab.classList.remove('active'));
      
      // Adicionar classe active ao item clicado e tab correspondente
      item.classList.add('active');
      if (tabs[index]) {
        tabs[index].classList.add('active');
      }

      // Carregar conteúdo específico baseado na tab
      const username = determinarUsuarioParaCarregar();
      if (!username) return;

      switch (index) {
        case 0: // Mural
          if (!document.querySelector('#muralPosts .post-card:not(.loading-container):not(.empty-posts):not(.error-container)')) {
            await carregarPostsDoMural(username);
          }
          break;
        case 1: // Visão Geral
          // Já carregado no carregarPerfilCompleto
          break;
        case 2: // Gostos  
          // Já carregado no carregarPerfilCompleto
          break;
        case 3: // Depoimentos
          await carregarDepoimentos(username);
          break;
        case 4: // Links
          await carregarLinks(username);
          break;
      }
    });
  });

  // Ativar primeira tab por padrão
  if (menuItems[0] && tabs[0]) {
    menuItems[0].classList.add('active');
    tabs[0].classList.add('active');
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
// OUTRAS FUNÇÕES
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
      
      // Aplicar background do headerphoto no body
      aplicarBackgroundHeaderPhoto(dados);
      
      // Atualizar estatísticas e configurar botão de seguir
      await atualizarEstatisticasPerfil(usernameParaCarregar);
      await configurarBotaoSeguir();
      
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

  // Atualizar títulos das outras tabs
  const gostosTitle = document.getElementById("gostos-title");
  if (gostosTitle) {
    gostosTitle.textContent = `Gostos de ${nomeCompleto || dados.username || username}`;
  }

  const depsTitle = document.querySelector('.deps-tab h3');
  if (depsTitle) {
    depsTitle.textContent = `Depoimentos de ${nomeCompleto || dados.username || username}`;
  }

  const linksTitle = document.querySelector('.links-tab h3');
  if (linksTitle) {
    linksTitle.textContent = `Links de ${nomeCompleto || dados.username || username}`;
  }

  const amigosTitle = document.querySelector('.amigos-tab h3');
  if (amigosTitle) {
    amigosTitle.textContent = `Amigos de ${nomeCompleto || dados.username || username}`;
  }

  if (dados.pronoun1 || dados.pronoun2) {
    const pronomes = `${dados.pronoun1 || ''}/${dados.pronoun2 || ''}`.replace(/^\/|\/$/g, '');
    const handleElement = document.querySelector('.handle');
    if (handleElement && pronomes) {
      handleElement.innerHTML = `@${dados.username || username} • ${pronomes}`;
    }
  }
}

function criarAboutBoxSobre(dados, username) {
  const nomeUsuario = dados.displayname || dados.username || username;
  const genero = dados.genero || "Não informado";
  const localizacao = dados.localizacao || "Não informada";
  const estadoCivil = dados.estadoCivil || "Não informado";

  return `
    <div class="about-box sobre-box" id="sobreBox">
      <div class="sobre-header">
        <h4>Sobre ${nomeUsuario}</h4>
      </div>
      <div class="sobre-content">
        <div class="info-item">
          <div class="info-details">
          <span class="info-icon"><i class="fas fa-user"></i></span>
            <span class="info-label">Gênero:</span>
            <span class="info-value">${genero}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-details">
          <span class="info-icon"><i class="fas fa-map-marker-alt"></i></span>
            <span class="info-label">Localização:</span>
            <span class="info-value">${localizacao}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-details">
          <span class="info-icon"><i class="fas fa-heart"> </i></span>
            <span class="info-label">Estado Civil:</span>
            <span class="info-value">${estadoCivil}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function atualizarVisaoGeral(dados, username) {
  const visaoTab = document.querySelector('.visao-tab .about-container');
  if (!visaoTab) return;

  // Verificar se já existe a about-box "sobre"
  let sobreBox = document.getElementById('sobreBox');
  
  if (!sobreBox) {
    // Criar a nova about-box no início do container
    const sobreBoxHTML = criarAboutBoxSobre(dados, username);
    visaoTab.insertAdjacentHTML('afterbegin', sobreBoxHTML);
  } else {
    // Atualizar a about-box existente
    sobreBox.outerHTML = criarAboutBoxSobre(dados, username);
  }

  // Atualizar as outras about-boxes (ajustar índices por causa da nova box)
  const aboutBoxes = visaoTab.querySelectorAll('.about-box:not(.sobre-box)');
  
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
  
  // Configurar navegação entre tabs
  configurarNavegacaoTabs();
  
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
window.enviarDepoimento = enviarDepoimento;
window.excluirDepoimento = excluirDepoimento;
window.carregarDepoimentos = carregarDepoimentos;
window.carregarLinks = carregarLinks;

// ===================
// CSS MELHORADO PARA POSTS E STATUS
// ===================
const postCSS = `
<style>
/* Full Profile Container with Glassmorphism */
.full-profile-container {
  width: 1050px;
  height: 520px;
  margin: 0 auto;
  background: rgba(20, 20, 20, 0.247);
  backdrop-filter: blur(8px);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-left: 250px;
  margin-top: 80px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Profile Header - Fixed Top */
.profile-header {
  display: flex;
  padding: 30px;
  gap: 20px;
  background: rgba(20, 20, 20, 0.61);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #333;
  position: sticky;
  top: 0;
  z-index: 1000;
  flex-shrink: 0;
}

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

/* Body Background Overlay */
.body-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  z-index: -1;
  pointer-events: none;
}

/* Follow Button States */


/* Depoimentos Styles - Enhanced with Glassmorphism */
.depoimento-form {
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.depoimento-form h4 {
  color: #fff;
  margin-bottom: 15px;
  font-size: 1.2em;
  font-weight: 600;
}

.depoimento-form textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  border: 1px solid (255, 255, 255, 0.2);
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  transition: border-color 0.3s ease;
  background: rgba(40, 40, 40, 0.8);
  color: #fff;
  backdrop-filter: blur(4px);
}

.depoimento-form textarea:focus {
  border-color: #fff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,123,255,0.2);
}

.depoimento-form textarea::placeholder {
  color: #aaa;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.char-count {
  font-size: 12px;
  color: #aaa;
  font-weight: 500;
}

.btn-enviar-depoimento {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-enviar-depoimento:hover {
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,123,255,0.4);
}

.btn-enviar-depoimento:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.depoimento-card {
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 15px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  animation: fadeInUp 0.5s ease-out;
}

.depoimento-card:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}

.depoimento-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.autor-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.autor-pic {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: border-color 0.3s ease;
}

.autor-pic:hover {
  border-color: #007bff;
}

.autor-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.autor-nome {
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: color 0.3s ease;
}

.autor-nome:hover {
  color: #007bff;
}

.depo-time {
  font-size: 12px;
  color: #aaa;
}

.delete-depo-btn {
  background: none;
  border: none;
  color: #dc3545;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.delete-depo-btn:hover {
  background: rgba(220, 53, 69, 0.2);
  transform: scale(1.1);
}

.depoimento-content p {
  margin: 0;
  color: #fff;
  line-height: 1.6;
  font-size: 15px;
}

.empty-depoimentos {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 60px 20px;
  color: #aaa;
  background-color: transparent;
  border-radius: 16px;
  margin: 20px 0;
}

.empty-depoimentos .empty-icon {
  font-size: 3em;
  color: #555;
  margin-bottom: 20px;
}

.empty-depoimentos h3 {
  margin-bottom: 10px;
  color: #fff;
}

/* Links Styles - Enhanced with Glassmorphism */
.link-box {
  margin-bottom: 12px;
}

.user-link {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  background-color: transparent;
  border-radius: 12px;
  text-decoration: none;
  color: #fff;
  transition: all 0.3s ease;
  gap: 12px;
}

.user-link:hover {
  border-color: #007bff;
  color: #007bff;
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,123,255,0.2);
  background: rgba(0, 123, 255, 0.1);
}

.user-link i:first-child {
  font-size: 20px;
  width: 24px;
  text-align: center;
}

.user-link span {
  flex: 1;
  font-weight: 600;
}

.link-arrow {
  font-size: 12px !important;
  opacity: 0.7;
}

.empty-links {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 60px 20px;
  color: #aaa;
  background-color: transparent;
  border-radius: 16px;
  margin: 20px 0;
}

.empty-links .empty-icon {
  font-size: 3em;
  color: #555;
  margin-bottom: 20px;
}

.empty-links h3 {
  margin-bottom: 10px;
  color: #fff;
}

/* Social Media Link Colors - Enhanced for Dark Theme */
.user-link:hover .fa-instagram {
  color: #E4405F;
}

.user-link:hover .fa-twitter {
  color: #1DA1F2;
}

.user-link:hover .fa-tiktok {
  color: #ff0050;
}

.user-link:hover .fa-youtube {
  color: #FF0000;
}

.user-link:hover .fa-github {
  color: #fff;
}

.user-link:hover .fa-linkedin {
  color: #0077B5;
}

.user-link:hover .fa-discord {
  color: #7289DA;
}

.user-link:hover .fa-spotify {
  color: #1DB954;
}

/* Loading States - Dark Theme */
.loading-container, .error-container, .empty-posts {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  min-height: 200px;
  background-color: transparent;
  border-radius: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.1);
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
  color: #555;
  margin-bottom: 20px;
}

.error-icon {
  color: #dc3545;
}

.empty-posts h3, .error-container h3 {
  color: #fff;
  margin-bottom: 10px;
  font-size: 1.3em;
}

.empty-posts p, .error-container p {
  color: #aaa;
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
  backdrop-filter: blur(8px);
}

.btn-primary {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,123,255,0.4);
}

.btn-secondary {
  background: rgba(108, 117, 125, 0.8);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  background: rgba(84, 91, 98, 0.9);
  transform: translateY(-2px);
}

/* Post Cards - Enhanced Dark Glassmorphism */
.post-card {
  background: rgba(20, 20, 20, 0.582);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  margin-bottom: 20px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease-out;
  position: relative;
  overflow: hidden;
}

.post-card:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
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
  border: 2px solid rgba(255, 255, 255, 0.2);
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
  color: #fff;
  font-size: 1.1em;
  line-height: 1.2;
}

.username-small {
  color: #aaa;
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
  color: #aaa;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.post-options:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Post Content */
.post-content {
  margin-bottom: 15px;
  line-height: 1.6;
}

.post-content p {
  margin: 0;
  color: #fff;
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
  border-top: 1px solid rgba(255, 255, 255, 0.1);
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
  color: #aaa;
  font-size: 0.95em;
  padding: 8px 16px;
  border-radius: 20px;
  transition: all 0.3s ease;
  font-weight: 500;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
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
  background: rgba(233, 30, 99, 0.2) !important;
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
  background: rgba(29, 161, 242, 0.2) !important;
}

.share-btn:hover {
  color: #17bf63 !important;
  background: rgba(23, 191, 99, 0.2) !important;
}

.bookmark-btn:hover {
  color: #f39c12 !important;
  background: rgba(243, 156, 18, 0.2) !important;
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
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
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
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,123,255,0.4);
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

/* Image Modal - Enhanced for Dark Theme */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999999;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-overlay {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  padding: 20px;
  box-sizing: border-box;
  backdrop-filter: blur(16px);
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
  box-shadow: 0 16px 64px rgba(0,0,0,0.5);
  max-width:600px;
}

.modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
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
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}

.modal-close:hover {
  background: rgba(255, 255, 255, 1);
  transform: scale(1.1);
}

/* Success Message Animation */
.success-message {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}


/* Hover effects for better UX */
.depoimento-card:hover .autor-pic {
  transform: scale(1.05);
}

.user-link:hover i:first-child {
  transform: scale(1.1);
}

/* Loading spinner for buttons */
.btn-enviar-depoimento i.fa-spinner {
  animation: spin 1s linear infinite;
}

/* Enhanced visual feedback */
.depoimento-form textarea:valid {
  border-color: #4A90E2;
}

.depoimento-form textarea:invalid:not(:placeholder-shown) {
  border-color: #fff;
}

/* Smooth transitions for all interactive elements */
* {
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

/* Pulse animation for important buttons */
.btn-enviar-depoimento:not(:disabled):hover {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(0, 123, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); }
}

/* Custom scrollbar for better aesthetics - Dark Theme */
.depoimento-form textarea::-webkit-scrollbar {
  width: 6px;
}

.depoimento-form textarea::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.depoimento-form textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.depoimento-form textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* Enhanced focus states for accessibility */
.btn-enviar-depoimento:focus,
.user-link:focus,
.delete-depo-btn:focus,
.modal-close:focus {
  outline: 2px solid #007bff;
  outline-offset: 2px;
}

/* Subtle animations for content loading */
.depoimento-card,
.user-link {
  animation: fadeInUp 0.5s ease-out;
}

.depoimento-card:nth-child(even) {
  animation-delay: 0.1s;
}

.user-link:nth-child(even) {
  animation-delay: 0.1s;
}

/* Improved typography hierarchy */
.depoimento-form h4,
.empty-depoimentos h3,
.empty-links h3,
.empty-posts h3 {
  font-weight: 700;
  letter-spacing: -0.5px;
}

.depoimento-content p,
.empty-depoimentos p,
.empty-links p,
.empty-posts p {
  line-height: 1.7;
  font-weight: 400;
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', postCSS);