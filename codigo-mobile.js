
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
  limit,
  startAfter,
  deleteDoc,
  updateDoc,
  increment,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

let currentUser = null;
let currentUserId = null;
let currentUserData = null;
let profileUserId;


onAuthStateChanged(auth, async (user) => {
if (!user) {
    window.location.href = 'index.html';
    return;
  }
  
  currentUserId = user.uid;

  profileUserId = determinarUsuarioParaCarregar(); // Obtém da URL ou usa o ID logado
  
  // 2. CARREGA OS DADOS INICIAIS USANDO O ID DO PERFIL
  await carregarPerfilCompleto(profileUserId); 
  
  // 3. INICIA O MONITORAMENTO EM TEMPO REAL COM O ID DO PERFIL
  if (profileUserId) {
      // Chamamos a função de monitoramento com o ID CORRETO
      monitorarDadosPerfilEmTempoReal(profileUserId); 
  }
  configurarLinks();
  configurarNavegacaoTabs();
  await atualizarMarqueeUltimoUsuario();
    if(currentUserId) {
      monitorarEstatisticasPerfil(currentUserId);
  }
});


// ===================
// MONITORAMENTO EM TEMPO REAL DO PERFIL (FIXADO)
// ===================
function monitorarDadosPerfilEmTempoReal(targetUserId) {
  if (!targetUserId) {
    console.error("ID do alvo inválido para monitoramento.");
    return;
  }
  
  // 1. MONITORAR DADOS BÁSICOS (Nome, Bio, Status, etc.)
  const userRef = doc(db, 'users', targetUserId);
  const unsubscribeDados = onSnapshot(userRef, (docSnap) => {
      if(docSnap.exists()){
          const userData = docSnap.data();
          
          // Exemplo de atualização:
          const displaynameEl = document.getElementById('displaynamePerfil');
          if (displaynameEl) {
              displaynameEl.textContent = userData.displayname || userData.username;
          }
          
          // Chame suas funções que atualizam o DOM do perfil aqui:
          // atualizarNomeDoPerfil(userData);
          // atualizarBio(userData);
          // atualizarStatus(userData.status);
          
          console.log(`Dados básicos do perfil ${targetUserId} atualizados.`);
      }
  }, (error) => {
      console.error("Erro ao monitorar dados básicos:", error);
  });
  
  // 2. MONITORAR ESTATÍSTICAS (Posts, Seguidores, Seguindo)
  // Se suas estatísticas de posts estão em um subdocumento (ex: 'users/ID/stats')
  const statsRef = doc(db, 'users', targetUserId, 'stats', 'counts'); 
  const unsubscribeStats = onSnapshot(statsRef, (docSnap) => {
      if (docSnap.exists()) {
          const statsData = docSnap.data();
          
          // Exemplo de atualização:
          const countFollowersEl = document.getElementById('countFollowers');
          if (countFollowersEl) {
              countFollowersEl.textContent = statsData.followersCount || 0;
          }
          
          // Chame suas funções que atualizam as estatísticas aqui:
          // atualizarContagemPosts(statsData.postsCount);
          
          console.log(`Estatísticas do perfil ${targetUserId} atualizadas.`);
      }
  }, (error) => {
      console.error("Erro ao monitorar estatísticas:", error);
  });
  
  // Você pode retornar uma função para desativar todos os listeners se a página mudar
  return () => {
    unsubscribeDados();
    unsubscribeStats();
  };
}

// ===================
// BUSCA DE USUÁRIOS
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

  // Mostra loading
  resultsList.innerHTML = '<li class="search-loading"><div class="spinner"></div><span>Buscando...</span></li>';
  resultsList.classList.add('visible');

  const usersRef = collection(db, 'users');
  const q = query(usersRef, orderBy('username'), startAt(term), endAt(term + '\uf8ff'));
  
  try {
    const snapshot = await getDocs(q);
    
    resultsList.innerHTML = '';
    
    if (snapshot.empty) {
      resultsList.innerHTML = '<li class="no-results">Nenhum usuário encontrado</li>';
      return;
    }

    for (const docSnap of snapshot.docs) {
      const user = docSnap.data();
      const userId = docSnap.id;
      
      // Detecta mobile
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const profileUrl = isMobile ? `pfmobile.html?userid=${userId}` : `PF.html?userid=${userId}`;
      
      const li = document.createElement('li');
      li.className = 'search-result-item';
      li.innerHTML = `
        <img data-src="placeholder" alt="${user.displayname || user.username}" class="search-user-photo lazy-load" src="./src/icon/default.jpg">
        <div class="search-user-info">
          <span class="search-user-name">${user.displayname || user.username}</span>
          <span class="search-user-username">@${user.username}</span>
        </div>
      `;
      
      li.addEventListener('click', () => {
        window.location.href = profileUrl;
      });
      
      resultsList.appendChild(li);
      
      // Carrega foto em background (lazy)
      loadUserPhotoLazy(userId, li.querySelector('.search-user-photo'));
    }
    
  } catch (err) {
    console.error('Erro na busca:', err);
    resultsList.innerHTML = '<li class="no-results">Erro na busca</li>';
  }
}

// Função para carregar foto com lazy loading
async function loadUserPhotoLazy(userId, imgElement) {
  try {
    const mediaRef = doc(db, 'users', userId, 'user-infos', 'user-media');
    const mediaSnap = await getDoc(mediaRef);
    
    if (mediaSnap.exists() && mediaSnap.data().userphoto) {
      const photo = mediaSnap.data().userphoto;
      
      // Carrega imagem antes de mostrar
      const img = new Image();
      img.onload = () => {
        imgElement.src = photo;
        imgElement.classList.add('loaded');
      };
      img.onerror = () => {
        imgElement.src = './src/icon/default.jpg';
      };
      img.src = photo;
    }
  } catch (err) {
    console.log('Erro ao carregar foto:', err);
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
// FUNÇÕES AUXILIARES
// ===================
async function getUserData(userid) {
  const userRef = doc(db, "users", userid);
  const userSnap = await getDoc(userRef);
  return userSnap.exists() ? userSnap.data() : {};
}

// Função correta para buscar foto de perfil do post
async function getUserPhoto(userid) {
  const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
  const mediaSnap = await getDoc(mediaRef);
  if (mediaSnap.exists()) {
    return mediaSnap.data().userphoto || './src/icon/default.jpg';
  }
  return './src/icon/default.jpg';
}

// ===================
// SISTEMA DE SEGUIR/SEGUINDO
// ===================
async function verificarSeEstaSeguindo(currentUserId, targetUserId) {
  const segRef = doc(db, 'users', targetUserId, 'followers', currentUserId);
  const segDoc = await getDoc(segRef);
  return segDoc.exists();
}

async function seguirUsuario(currentUserId, targetUserId) {
  const now = new Date();
  await setDoc(doc(db, 'users', targetUserId, 'followers', currentUserId), {
    userid: currentUserId,
    followerin: now
  });
  await setDoc(doc(db, 'users', currentUserId, 'following', targetUserId), {
    userid: targetUserId,
    followin: now
  });
}

async function deixarDeSeguir(currentUserId, targetUserId) {
  await deleteDoc(doc(db, 'users', targetUserId, 'followers', currentUserId));
  await deleteDoc(doc(db, 'users', currentUserId, 'following', targetUserId));
}

async function contarSeguidores(userid) {
  const col = collection(db, 'users', userid, 'followers');
  const snap = await getDocs(col);
  return snap.size;
}

async function contarSeguindo(userid) {
  const col = collection(db, 'users', userid, 'following');
  const snap = await getDocs(col);
  return snap.size;
}

async function contarAmigos(userid) {
  const col = collection(db, 'users', userid, 'friends');
  const snap = await getDocs(col);
  return snap.size;
}

async function atualizarEstatisticasPerfil(userid) {
  const postsRef = collection(db, 'users', userid, 'posts');
  const postsSnap = await getDocs(postsRef);
  const numPosts = postsSnap.size;
  const numSeguidores = await contarSeguidores(userid);
  const numSeguindo = await contarSeguindo(userid);
  const numAmigos = await contarAmigos(userid);
  const statsElement = document.querySelector('.profile-stats');
  if (statsElement) {
    statsElement.innerHTML = `
      <div class="stats">
        <span><strong>${numPosts}</strong> posts</span>
      </div>
      <div class="stats">
        <span>
          <strong>${numSeguidores}</strong>
          <a href="list.html?userid=${userid}&tab=seguidores" class="stats-link">seguidores</a>
        </span>
      </div>
      <div class="stats">
        <span>
          <strong>${numAmigos}</strong>
          <a href="list.html?userid=${userid}&tab=amigos" class="stats-link">amigos</a>
        </span>
      </div>
      <div class="stats">
        <span>
          <strong>${numSeguindo}</strong>
          <a href="list.html?userid=${userid}&tab=seguindo" class="stats-link">seguindo</a>
        </span>
      </div>
    `;
  }
}


async function configurarBotaoSeguir(targetUserId) {
  const followBtn = document.querySelector('.btn-follow');
  if (!followBtn || !currentUserId) return;
  if (targetUserId === currentUserId) {
    followBtn.style.display = 'none';
    // Oculta botão de mensagem e nudge se for o próprio perfil
    const msgBtn = document.querySelector('.btn-message');
    if (msgBtn) msgBtn.style.display = 'none';
    const nudgeBtn = document.querySelector('.btn-nudge');
    if (nudgeBtn) nudgeBtn.style.display = 'none';
    // Adiciona botão de editar perfil
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar perfil';
    editBtn.className = 'btn-edit-profile';
    editBtn.onclick = () => window.location.href = 'config.html';
    followBtn.parentNode.appendChild(editBtn);
    const shareBtn = document.createElement('button');
    shareBtn.textContent = 'Compartilhar perfil';
    shareBtn.className = 'btn-share-profile';
    shareBtn.onclick = () => compartilharPerfil(targetUserId);
    followBtn.parentNode.appendChild(shareBtn);
    return;     
  }
  let isFollowing = await verificarSeEstaSeguindo(currentUserId, targetUserId);
  followBtn.textContent = isFollowing ? 'seguindo' : 'seguir';
  followBtn.className = isFollowing ? 'btn-follow following' : 'btn-follow';
  followBtn.onclick = async () => {
    followBtn.disabled = true;
    followBtn.textContent = 'carregando...';
    if (isFollowing) {
      await deixarDeSeguir(currentUserId, targetUserId);
      isFollowing = false;
      followBtn.textContent = 'seguir';
      followBtn.className = 'btn-follow';
    } else {
      await seguirUsuario(currentUserId, targetUserId);
      isFollowing = true;
      followBtn.textContent = 'seguindo';
      followBtn.className = 'btn-follow following';
    }
    await atualizarEstatisticasPerfil(targetUserId);
    followBtn.disabled = false;
  };
}

// ===================
// SISTEMA DE DEPOIMENTOS
// ===================
async function carregarDepoimentos(userid) {
  const depoimentosContainer = document.querySelector('.deps-tab .about-container');
  if (!depoimentosContainer) return;
  depoimentosContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Carregando depoimentos...</p>
    </div>
  `;
  const depoimentosRef = collection(db, 'users', userid, 'depoimentos');
  const depoimentosQuery = query(depoimentosRef, orderBy('criadoem', 'desc'));
  const snapshot = await getDocs(depoimentosQuery);
  depoimentosContainer.innerHTML = '';
  const isOwnProfile = userid === currentUserId;
  if (!isOwnProfile) {
    const depoimentoForm = document.createElement('div');
    depoimentoForm.className = 'depoimento-form';
    depoimentoForm.innerHTML = `
      <h4>Deixar um depoimento</h4>
      <div class="form-actions">
        <textarea id="depoimentoTexto" placeholder="Escreva seu depoimento aqui..." maxlength="500"></textarea>
        <button class="btn-enviar-depoimento" onclick="enviarDepoimento('${userid}')">
          <i class="fas fa-paper-plane"></i> Enviar
        </button>
      </div>
    `;
    depoimentosContainer.appendChild(depoimentoForm);
    const textarea = depoimentoForm.querySelector('#depoimentoTexto');
    const charCount = depoimentoForm.querySelector('.char-count');
    textarea.addEventListener('input', () => {
      const count = textarea.value.length;
      charCount.textContent = `${count}/500`;
      charCount.style.color = count > 450 ? '#dc3545' : '#666';
    });
  }
  if (snapshot.empty) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-depoimentos';
    emptyDiv.innerHTML = `
      <div class="empty-icon"><i class="fas fa-comments"></i></div>
      <h3>Nenhum depoimento ainda</h3>
      <p>${isOwnProfile ? 'Você ainda não recebeu depoimentos.' : 'Este usuário ainda não recebeu depoimentos.'}</p>
    `;
    depoimentosContainer.appendChild(emptyDiv);
    return;
  }
  for (const depoDoc of snapshot.docs) {
    const depoData = depoDoc.data();
    let autorData = {};
    if (depoData.creatorid) {
      autorData = await getUserData(depoData.creatorid);
    }
    const depoElement = criarElementoDepoimento(depoData, autorData, depoDoc.id, userid);
    depoimentosContainer.appendChild(depoElement);
  }
}

function criarElementoDepoimento(depoData, autorData, depoId, targetUserId) {
  const depoElement = document.createElement('div');
  depoElement.className = 'depoimento-card';
  depoElement.setAttribute('data-depo-id', depoId);
  let autorFotoPromise = getUserPhoto(depoData.creatorid);
  autorFotoPromise.then(autorFoto => {
    const autorNome = autorData.displayname || autorData.username || 'Usuário';
    const dataFormatada = formatarDataPost(depoData.criadoem);
    const conteudo = depoData.conteudo || 'Depoimento sem conteúdo';
    const isOwner = currentUserId === targetUserId;
    const isAuthor = currentUserId === depoData.creatorid;
    const podeExcluir = isOwner || isAuthor;
    depoElement.innerHTML = `
      <div class="depoimento-header">
        <div class="autor-info">
          <img src="${autorFoto}" alt="Foto do autor" class="autor-pic"
            onerror="this.src='./src/icon/default.jpg'"
            onclick="window.location.href='PF.html?userid=${depoData.creatorid}'">
          <div class="autor-details">
            <span class="autor-nome" onclick="window.location.href='PF.html?userid=${depoData.creatorid}'">${autorNome}</span>
            <span class="depo-time">${dataFormatada}</span>
          </div>
        </div>
        ${podeExcluir ? `<button class="delete-depo-btn" onclick="excluirDepoimento('${depoId}', '${targetUserId}')">
          <i class="fas fa-trash"></i>
        </button>` : ''}
      </div>
      <div class="depoimento-content"><p>${conteudo}</p></div>
    `;
  });

  return depoElement;
}


async function enviarDepoimento(targetUserId) {
  const textarea = document.getElementById('depoimentoTexto');
  const btnEnviar = document.querySelector('.btn-enviar-depoimento');
  if (!textarea || !btnEnviar) return;
  const conteudo = textarea.value.trim();
  if (!conteudo) {
    alert('Por favor, escreva um depoimento antes de enviar.');
    return;
  }
  if (currentUserId === targetUserId) {
    alert('Você não pode deixar um depoimento para si mesmo.');
    return;
  }
  btnEnviar.disabled = true;
  btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
  try {
    const depoId = `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const depoimentoData = {
      conteudo,
      creatorid: currentUserId,
      criadoem: new Date()
    };
    await setDoc(doc(db, 'users', targetUserId, 'depoimentos', depoId), depoimentoData);
    textarea.value = '';
    const charCount = document.querySelector('.char-count');
    if (charCount) charCount.textContent = '0/500';
    await carregarDepoimentos(targetUserId);
    const successMsg = document.createElement('div');
    successMsg.className = 'success-message';
    successMsg.textContent = 'Depoimento enviado com sucesso!';
    successMsg.style.cssText = `
      position: fixed; display:none; top: 20px; right: 20px; background: #28a745; color: white;
      padding: 12px 20px; border-radius: 8px; z-index: 999999999; animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(successMsg);
    setTimeout(() => { successMsg.remove(); }, 3000);
  } catch {
    alert('Erro ao enviar depoimento. Tente novamente.');
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar';
  }
}

async function excluirDepoimento(depoId, targetUserId) {
  if (!confirm('Tem certeza que deseja excluir este depoimento?')) return;
  await deleteDoc(doc(db, 'users', targetUserId, 'depoimentos', depoId));
  await carregarDepoimentos(targetUserId);
  const successMsg = document.createElement('div');
  successMsg.className = 'success-message';
  successMsg.textContent = 'Depoimento excluído com sucesso!';
  successMsg.style.cssText = `
    position: fixed; display:none; top: 20px; right: 20px; background: #dc3545; color: white;
    padding: 12px 20px; border-radius: 8px; z-index: 9999; animation: slideIn 0.3s ease-out;
  `;
  document.body.appendChild(successMsg);
  setTimeout(() => { successMsg.remove(); }, 3000);
}

// ===================
// SISTEMA DE POSTS DO MURAL
// ===================
let isLoadingPosts = false;
let postsDoUsuario = [];
let lastPostDoc = null;
let currentProfileId = null;

function formatarDataPost(timestamp) {
  if (!timestamp) return 'Data não disponível';
  let date;
  if (timestamp && typeof timestamp.toDate === 'function') date = timestamp.toDate();
  else if (timestamp && timestamp.seconds) date = new Date(timestamp.seconds * 1000);
  else if (timestamp) date = new Date(timestamp);
  else return 'Data inválida';
  const agora = new Date();
  const diff = agora - date;
  const diffMinutos = Math.floor(diff / (1000 * 60));
  const diffHoras = Math.floor(diff / (1000 * 60 * 60));
  const diffDias = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (diffMinutos < 1) return 'Agora';
  if (diffMinutos < 60) return `${diffMinutos}min`;
  if (diffHoras < 24) return `${diffHoras}h`;
  if (diffDias < 7) return `${diffDias}d`;
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatarConteudoPost(conteudo) {
  if (!conteudo) return '<p class="empty-content">Post sem conteúdo</p>';
  let conteudoFormatado = conteudo;
  conteudoFormatado = conteudoFormatado.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  conteudoFormatado = conteudoFormatado.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  conteudoFormatado = conteudoFormatado.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  conteudoFormatado = conteudoFormatado.replace(/\n/g, '<br>');
  return `<p>${conteudoFormatado}</p>`;
}

// Comentários do post
async function carregarComentariosDoPost(userid, postId, container) {
  container.innerHTML = '<div class="loading-comments">Carregando...</div>';
  const comentariosRef = collection(db, 'users', userid, 'posts', postId, 'coments');
  const comentariosSnap = await getDocs(comentariosRef);
  container.innerHTML = '';
  if (comentariosSnap.empty) {
    container.innerHTML = '<div class="no-comments">Nenhum comentário ainda.</div>';
    return;
  }

  // Cria a nova div .comentarios
  const comentariosDiv = document.createElement('div');
  comentariosDiv.className = 'comentarios';

  for (const comentDoc of comentariosSnap.docs) {
    const comentData = comentDoc.data();
    const userData = await getUserData(comentData.senderid);
    const nome = userData.displayname || userData.username || comentData.senderid;
    const username = userData.username ? `@${userData.username}` : '';
    const foto = userData.userphoto || './src/icon/default.jpg';
    const data = formatarDataPost(comentData.create);
    const comentEl = document.createElement('div');
    comentEl.className = 'comentario-item';
    comentEl.innerHTML = `
      <div class="comentario-header">
        <img src="${foto}" alt="Avatar" class="comentario-avatar" onerror="this.src='./src/icon/default.jpg'" />
        <div class="comentario-meta">
          <strong>${nome}</strong>
          <small>${username}</small>
          <small>Há ${data}</small>
        </div>
      </div>
      <div class="comentario-conteudo">${formatarConteudoPost(comentData.content)}</div>
    `;
    comentariosDiv.appendChild(comentEl);
  }

  // Adiciona a nova div .comentarios dentro do container
  container.appendChild(comentariosDiv);
}
// Comentar post
async function comentarPost(userid, postId, conteudo, comentariosContainer) {
  if (!conteudo) return;
  const comentarioId = `coment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const comentarioData = {
    content: conteudo,
    create: new Date(),
    senderid: currentUserId,
    report: 0
  };
  await setDoc(doc(db, 'users', userid, 'posts', postId, 'coments', comentarioId), comentarioData);
  await carregarComentariosDoPost(userid, postId, comentariosContainer);
}

// Curtir post
async function curtirPost(postId, userid, btnElement) {
  btnElement.classList.add('loading');
  const postRef = doc(db, 'users', userid, 'posts', postId);
  await updateDoc(postRef, { likes: increment(1) });
  const countElement = btnElement.querySelector('.action-count');
  let currentCount = parseInt(countElement.textContent) || 0;
  currentCount++;
  countElement.textContent = currentCount;
  btnElement.classList.add('liked', 'has-likes');
  btnElement.style.transform = 'scale(1.2)';
  setTimeout(() => { btnElement.style.transform = 'scale(1)' }, 200);
  btnElement.classList.remove('loading');
}

// Card do post
function criarElementoPost(postData, userPhoto, displayName, username, postId, userid) {
  const postCard = document.createElement('div');
  postCard.className = 'post-card';
  postCard.setAttribute('data-post-id', postId);
  const dataPost = formatarDataPost(postData.create);
  const conteudoFormatado = formatarConteudoPost(postData.content);
  let imagemHTML = '';
  if (postData.img) {
    imagemHTML = `
      <div class="post-image-container">
        <img src="${postData.img}" alt="Imagem do post" class="post-image"
          onerror="this.parentElement.style.display='none'"
          onclick="abrirModalImagem('${postData.img}')">
      </div>
    `;
  }
  const curtidas = postData.likes || 0;
  postCard.innerHTML = `
    <div class="post-header">
      <div class="profile-info">
        <img src="${userPhoto}" alt="Foto de perfil" class="user-pic"
          onerror="this.src='./src/icon/default.jpg'">
        <div class="user-details">
          <span class="display-name">${displayName}</span>
          <span class="username-small">@${username}</span>
          <span class="post-time">${dataPost}</span>
        </div>
      </div>
    </div>
    <div class="post-content">${conteudoFormatado}${imagemHTML}</div>
    <div class="post-actions">
      <button class="action-btn like-btn ${curtidas > 0 ? 'has-likes' : ''}"
        onclick="curtirPost('${postId}', '${userid}', this)">
        <i class="fas fa-heart"></i>
        <span class="action-count">${curtidas > 0 ? curtidas : ''}</span>
      </button>
      <button class="action-btn comment-btn">
        <i class="fas fa-comment"></i>
      </button>
    </div>
    <div class="comentarios-container" style="display:none;"></div>
    <div class="comentar-area" style="display:none;">
      <input type="text" class="input-comentario" placeholder="Escreva um comentário..." maxlength="200">
      <button class="btn-enviar-comentario"><i class="fas fa-paper-plane"></i></button>
    </div>
  `;
  // Eventos de comentar
  const commentBtn = postCard.querySelector('.comment-btn');
  const comentariosContainer = postCard.querySelector('.comentarios-container');
  const comentarArea = postCard.querySelector('.comentar-area');
  commentBtn.onclick = () => {
    comentariosContainer.style.display = comentariosContainer.style.display === 'none' ? 'block' : 'none';
    comentarArea.style.display = comentarArea.style.display === 'none' ? 'flex' : 'none';
    if (comentariosContainer.style.display === 'block') {
      carregarComentariosDoPost(userid, postId, comentariosContainer);
    }
  };
  const btnEnviarComentario = postCard.querySelector('.btn-enviar-comentario');
  const inputComentario = postCard.querySelector('.input-comentario');
  btnEnviarComentario.onclick = () => {
    const texto = inputComentario.value.trim();
    if (texto) {
      comentarPost(userid, postId, texto, comentariosContainer);
      inputComentario.value = '';
    }
  };
  inputComentario.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnEnviarComentario.click();
    }
  });
  return postCard;
}

// ATUALIZADO: buscar foto do local correto
// ATUALIZADO: Carregar posts como grid de previews
async function carregarPostsDoMural(userid) {
  const muralContainer = document.getElementById('muralPosts');
  if (!muralContainer || isLoadingPosts) return;
  
  isLoadingPosts = true;
  currentProfileId = userid;
  
  muralContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Carregando posts...</p>
    </div>
  `;

  const postsRef = collection(db, 'users', userid, 'posts');
  const postsQuery = query(postsRef, orderBy('create', 'desc'));
  const snapshot = await getDocs(postsQuery);
  
  muralContainer.innerHTML = '';
  
  if (snapshot.empty) {
    muralContainer.innerHTML = `
      <div class="empty-posts">
        <div class="empty-icon"><i class="fas fa-pen-alt"></i></div>
        <h3>Nenhum post ainda</h3>
        <p>Este usuário ainda não compartilhou nada.</p>
        ${userid === currentUserId ? '<a href="feed.html" class="btn-primary">Fazer primeiro post</a>' : ''}
      </div>
    `;
    isLoadingPosts = false;
    return;
  }

// Resetar lista global de posts
postsDoUsuario = [];

snapshot.forEach(postDoc => {
    const postData = postDoc.data();

    // Salvar post completo no array
    postsDoUsuario.push({
        id: postDoc.id,
        userid: userid,
        data: postData
    });

    // Criar preview do post
    const previewElement = criarPreviewPost(postData, postDoc.id, userid);
    muralContainer.appendChild(previewElement);
});


  

  isLoadingPosts = false;
}

// Nova função para criar preview do post
function criarPreviewPost(postData, postId, userid) {
  const preview = document.createElement('div');
  preview.className = 'postpreview';
  
  // Verifica se tem imagem
  if (postData.img && postData.img.trim()) {
    // POST COM IMAGEM
    preview.innerHTML = `
      <img src="${postData.img}" 
           alt="Post" 
           class="post-preview-img"
           onerror="this.parentElement.innerHTML='<div class=post-preview-error>Erro ao carregar imagem</div>'">
    `;
  } else {
    // POST SÓ COM TEXTO
    const conteudo = postData.content || 'Post sem conteúdo';
    const textoPreview = conteudo.length > 80 ? conteudo.slice(0, 80) + '...' : conteudo;
    
    preview.innerHTML = `
      <div class="post-preview-text-container">
        <p class="post-preview-text">${textoPreview}</p>
      </div>
    `;
  }
  
  // Adiciona evento de clique para abrir modal
  preview.onclick = () => {
    const index = postsDoUsuario.findIndex(p => p.id === postId);
    abrirModalFeed(index);
};

  
  return preview;
}

// ================================
// MODAL FEED — Vertical (1 post por tela) com overflow scroll
// ================================
function abrirModalFeed(indexInicial) {
    // cria o modal principal
    const modal = document.createElement('div');
    modal.className = 'post-feed-modal';
modal.innerHTML = `
    <div class="feed-overlay"></div>

<div class="feed-header-global">


        <button class="close-feed">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 298 511.93"> <path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16l-215-214.47c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7l-185.5 185.04L285.77 441z"/> </svg>
    </button>
    <span id="feedHeaderUsername" class="feed-header-username">username
    </span>
</div>

    <div class="feed-scroll"></div>
`;



    document.body.appendChild(modal);
    // ANIMAÇÃO DE ABRIR
setTimeout(() => {
    modal.classList.add("aberto");
}, 10);

    document.body.style.overflow = "hidden";

    function fecharFeed() {
    const modal = document.querySelector('.post-feed-modal');
    if (!modal) return;

    // animação de fechar
    modal.classList.remove("aberto");
    modal.classList.add("fechando");

    // remove só depois da animação
    setTimeout(() => {
        modal.remove();
        document.body.style.overflow = "auto";
    }, 350); // mesmo tempo do CSS
}


    // Preencher o username no header
preencherHeader(postsDoUsuario[indexInicial].userid);


    const scrollArea = modal.querySelector('.feed-scroll');

    // Renderiza TODOS os posts do usuário, 1 por tela
    postsDoUsuario.forEach(post => {
        const postEl = document.createElement('div');
        postEl.className = 'feed-page';

        postEl.innerHTML = `
            <div class="feed-header">
                <img src="./src/icon/default.jpg" class="feed-avatar" id="feedPic-${post.id}">
                <div class="feed-info">
                    <span class="feed-name" id="feedName-${post.id}"></span>
                    <span class="feed-username" id="feedUser-${post.id}"></span>
                </div>
            </div>

            <div class="feed-body">
                ${post.data.img ? `<img src="${post.data.img}" class="feed-img">` : ''}
                <div class="feed-text">${formatarConteudoPost(post.data.content)}</div>
            </div>
        `;

        scrollArea.appendChild(postEl);
        preencherInfos(post.userid, post.id);
    });

    // scroll automático para o post clicado
    setTimeout(() => {
        scrollArea.scrollTo({
            top: indexInicial * window.innerHeight,
            behavior: "instant"
        });
    }, 50);

    // Fechar
    modal.querySelector('.close-feed').onclick = () => {
        modal.remove();
        document.body.style.overflow = "auto";
    };

    // Função para preencher dados do autor
    async function preencherInfos(userid, pid) {
        const u = await getUserData(userid);
        const f = await getUserPhoto(userid);

        document.getElementById(`feedPic-${pid}`).src = f;
        document.getElementById(`feedName-${pid}`).textContent = u.displayname || u.username;
        document.getElementById(`feedUser-${pid}`).textContent = "@" + (u.username || "");
    }

    async function preencherHeader(userid) {
    const u = await getUserData(userid);
    document.getElementById("feedHeaderUsername").textContent = (u.username || "usuario");
}
modal.querySelector('.close-feed').onclick = fecharFeed;



}



// Modal para exibir post completo
async function abrirModalPostCompleto(postData, postId, userid) {
  const userData = await getUserData(userid);
  const userPhoto = await getUserPhoto(userid);
  const displayName = userData.displayname || userData.username || userid;
  const username = userData.username || userid;
  const dataPost = formatarDataPost(postData.create);
  const conteudoFormatado = formatarConteudoPost(postData.content);
  const curtidas = postData.likes || 0;

  const modal = document.createElement('div');
  modal.className = 'post-modal';
  modal.innerHTML = `
    <div class="post-modal-overlay" onclick="fecharModalPost()">
      <div class="post-modal-content" onclick="event.stopPropagation()">
        <button class="post-modal-close" onclick="fecharModalPost()">
          <i class="fas fa-times"></i>
        </button>
        
        <div class="post-modal-header">
          <img src="${userPhoto}" alt="Foto" class="post-modal-avatar">
          <div class="post-modal-user-info">
            <span class="post-modal-name">${displayName}</span>
            <span class="post-modal-username">@${username}</span>
            <span class="post-modal-time">${dataPost}</span>
          </div>
        </div>

        <div class="post-modal-body">
          ${postData.img ? `<img src="${postData.img}" alt="Post" class="post-modal-image">` : ''}
          <div class="post-modal-text">${conteudoFormatado}</div>
        </div>

        <div class="post-modal-actions">
          <button class="post-modal-btn like-btn ${curtidas > 0 ? 'has-likes' : ''}"
            onclick="curtirPostModal('${postId}', '${userid}', this)">
            <i class="fas fa-heart"></i>
            <span class="action-count">${curtidas > 0 ? curtidas : ''}</span>
          </button>
          <button class="post-modal-btn comment-btn">
            <i class="fas fa-comment"></i>
          </button>
          <button class="post-modal-btn share-btn">
            <i class="fas fa-share"></i>
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
}

function fecharModalPost() {
  const modal = document.querySelector('.post-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
}

async function curtirPostModal(postId, userid, btnElement) {
  btnElement.classList.add('loading');
  const postRef = doc(db, 'users', userid, 'posts', postId);
  await updateDoc(postRef, { likes: increment(1) });
  
  const countElement = btnElement.querySelector('.action-count');
  let currentCount = parseInt(countElement.textContent) || 0;
  currentCount++;
  countElement.textContent = currentCount;
  btnElement.classList.add('liked', 'has-likes');
  
  btnElement.classList.remove('loading');
}

// Adicionar ao window
window.fecharModalPost = fecharModalPost;
window.curtirPostModal = curtirPostModal;


async function carregarMaisPosts() {
  if (!currentProfileId || !lastPostDoc || isLoadingPosts) return;
  isLoadingPosts = true;
  const loadMoreBtn = document.querySelector('.load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando...';
    loadMoreBtn.disabled = true;
  }
  const userData = await getUserData(currentProfileId);
  const userPhoto = await getUserPhoto(currentProfileId); // <-- busca correta
  const displayName = userData.displayname || userData.username || currentProfileId;
  const username = userData.username || currentProfileId;
  const postsRef = collection(db, 'users', currentProfileId, 'posts');
  const postsQuery = query(postsRef, orderBy('create', 'desc'), startAfter(lastPostDoc), limit(5));
  const snapshot = await getDocs(postsQuery);
  if (!snapshot.empty) {
    const muralContainer = document.getElementById('muralPosts');
    const loadMoreContainer = document.querySelector('.load-more-container');
    if (loadMoreContainer) loadMoreContainer.remove();
    snapshot.forEach(postDoc => {
      const postData = postDoc.data();
      const postElement = criarElementoPost(postData, userPhoto, displayName, username, postDoc.id, currentProfileId);
      muralContainer.appendChild(postElement);
    });
    lastPostDoc = snapshot.docs[snapshot.docs.length - 1];
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
  isLoadingPosts = false;
}
// ===================
// SISTEMA DE NAVEGAÇÃO ENTRE TABS
// ===================
function configurarNavegacaoTabs() {
  const menuItems = document.querySelectorAll('.menu-item');
  const tabs = document.querySelectorAll('.tab');
  const slider = document.querySelector('.slider');
  const profileBody = document.querySelector('.profile-body');
  
  if (!menuItems.length || !tabs.length || !slider) return;
  
  let isTransitioning = false;
  
  // Função para mover o slider
  function moverSlider(index) {
    slider.style.transform = `translateX(${index * 100}%)`;
  }
  
  // Função para trocar tabs com fade
  async function trocarTab(index, userid) {
    if (isTransitioning) return;
    isTransitioning = true;
    
    // Adiciona classe de transição no body
    if (profileBody) profileBody.classList.add('transitioning');
    
    // Encontra tab ativa atual
    const tabAtual = document.querySelector('.tab.active');
    
    if (tabAtual) {
      // Fade out da tab atual
      tabAtual.classList.add('fade-out');
      
      // Aguarda animação de fade out
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Remove active e fade-out
      tabAtual.classList.remove('active', 'fade-out');
    }
    
    // Ativa nova tab
    if (tabs[index]) {
      tabs[index].classList.add('active', 'fade-in');
      
      // Aguarda animação de fade in
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Remove classe fade-in
      tabs[index].classList.remove('fade-in');
    }
    
    // Remove classe de transição
    if (profileBody) profileBody.classList.remove('transitioning');
    
    // Carrega conteúdo da tab
    if (index === 0) {
      if (!document.querySelector('#muralPosts .postpreview, #muralPosts .post-card')) {
        await carregarPostsDoMural(userid);
      }
    } else if (index === 3) {
      await carregarDepoimentos(userid);
    } else if (index === 4) {
      await carregarLinks(userid);
    }
    
    isTransitioning = false;
  }
  
  menuItems.forEach((item, index) => {
    item.addEventListener('click', async () => {
      // Previne cliques durante transição
      if (isTransitioning) return;
      
      // Verifica se já está na tab clicada
      if (item.classList.contains('active')) return;
      
      // Remove classe active de todos os menu items
      menuItems.forEach(mi => mi.classList.remove('active'));
      
      // Adiciona active no clicado
      item.classList.add('active');
      
      // Move o slider
      moverSlider(index);
      
      // Troca tab com animação
      const userid = determinarUsuarioParaCarregar();
      if (userid) {
        await trocarTab(index, userid);
      }
    });
  });
  
  // Inicializa na primeira tab
  if (menuItems[0] && tabs[0]) {
    menuItems[0].classList.add('active');
    tabs[0].classList.add('active');
    moverSlider(0);
  }
}
// ===================
// FUNÇÕES DE INTERAÇÃO COM POSTS
// ===================
window.curtirPost = curtirPost;
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
window.carregarMaisPosts = carregarMaisPosts;
window.enviarDepoimento = enviarDepoimento;
window.excluirDepoimento = excluirDepoimento;
window.carregarDepoimentos = carregarDepoimentos;
window.carregarLinks = carregarLinks;


// ===================
// SISTEMA DE MÚSICA DO PERFIL - VERSÃO CORRIGIDA
// ===================
// ===================
// SISTEMA DE MÚSICA DO PERFIL - VERSÃO IFRAME YOUTUBE API
// ===================

let player = null;
let musicUrl = "";
let musicName = "";
let musicReady = false;

// Carrega API do YouTube
function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) return Promise.resolve();
  
  return new Promise((resolve) => {
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
    
    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };
  });
}

// Extrai ID do vídeo do YouTube
function extractYouTubeID(url) {
  if (!url) return null;
  
  // https://www.youtube.com/watch?v=VIDEO_ID
  let match = url.match(/[?&]v=([^&]+)/);
  if (match) return match[1];
  
  // https://youtu.be/VIDEO_ID
  match = url.match(/youtu\.be\/([^?]+)/);
  if (match) return match[1];
  
  // https://www.youtube.com/embed/VIDEO_ID
  match = url.match(/embed\/([^?]+)/);
  if (match) return match[1];
  
  return null;
}

// Inicializa o sistema de música
async function inicializarSistemaDeMusicaProfile(userid) {
  try {
    const musicBlock = document.querySelector('.music');
    const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
    const mediaSnap = await getDoc(mediaRef);
    const musicTitleEl = document.getElementById('musicTitle');
    const btnPause = document.getElementById('btnPauseMusic');

    // Reseta
    musicUrl = "";
    musicName = "";
    musicReady = false;

    if (mediaSnap.exists()) {
      const mediaData = mediaSnap.data();
      if (mediaData.musicTheme) musicUrl = mediaData.musicTheme;
      if (mediaData.musicThemeName) musicName = mediaData.musicThemeName;
    }

    // Atualiza UI
    if (musicTitleEl) musicTitleEl.textContent = musicName || "Música do perfil";
    
    // Mostra/esconde bloco
    if (musicBlock) {
      musicBlock.style.display = musicUrl ? 'flex' : 'none';
    }

    if (!musicUrl) return;

    // Carrega API do YouTube
    await loadYouTubeAPI();

    const videoId = extractYouTubeID(musicUrl);
    if (!videoId) {
      console.error('URL inválida:', musicUrl);
      return;
    }

    // Destroi player antigo se existir
    if (player) {
      player.destroy();
      player = null;
    }

    // Cria container para o player se não existir
    let playerContainer = document.getElementById('bgMusic');
    if (!playerContainer) {
      playerContainer = document.createElement('div');
      playerContainer.id = 'bgMusic';
      playerContainer.style.cssText = 'position:fixed;bottom:0;right:0;width:0;height:0;opacity:0;pointer-events:none;';
      document.body.appendChild(playerContainer);
    }

    // Cria novo player
    player = new YT.Player('bgMusic', {
      height: '0',
      width: '0',
      videoId: videoId,
      playerVars: {
        autoplay: 0,
        loop: 1,
        playlist: videoId, // Necessário para loop funcionar
        controls: 0,
        showinfo: 0,
        modestbranding: 1,
        enablejsapi: 1
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });

    // Configura botão
    if (btnPause) {
      btnPause.onclick = toggleMusic;
      btnPause.classList.remove('playing');
    }

  } catch (e) {
    console.error('Erro ao inicializar música:', e);
  }
}

// Quando player está pronto
function onPlayerReady(event) {
  musicReady = true;
  console.log('Player YouTube pronto!');
  
  // Tenta iniciar automaticamente
  document.addEventListener('click', startMusicOnce, { once: true });
  document.addEventListener('touchstart', startMusicOnce, { once: true });
  document.addEventListener('keydown', startMusicOnce, { once: true });
}

// Monitora estado do player
function onPlayerStateChange(event) {
  const btnPause = document.getElementById('btnPauseMusic');
  if (!btnPause) return;

  // YT.PlayerState.PLAYING = 1
  if (event.data === 1) {
    btnPause.classList.add('playing');
  } else {
    btnPause.classList.remove('playing');
  }
}

// Erros do player
function onPlayerError(event) {
  console.error('Erro no player YouTube:', event.data);
}

// Inicia música no primeiro toque
function startMusicOnce() {
  if (!player || !musicReady) return;
  
  try {
    player.setVolume(50); // Volume 50%
    player.playVideo();
    console.log('Música iniciada!');
  } catch (e) {
    console.error('Erro ao iniciar música:', e);
  }
}

// Toggle play/pause
function toggleMusic() {
  if (!player || !musicReady) {
    console.warn('Player não está pronto');
    return;
  }

  try {
    const state = player.getPlayerState();
    
    // 1 = playing, 2 = paused
    if (state === 1) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  } catch (e) {
    console.error('Erro ao toggle música:', e);
  }
}

// Exporta funções
window.inicializarSistemaDeMusicaProfile = inicializarSistemaDeMusicaProfile;
window.toggleMusic = toggleMusic;

// ===================
// SISTEMA DE LINKS
// ===================
async function carregarLinks(userid) {
  const linksContainer = document.querySelector('.links-tab .about-container');
  if (!linksContainer) return;
  const userRef = doc(db, 'users', userid, 'user-infos', 'user-media');
  const userDoc = await getDoc(userRef);
  linksContainer.innerHTML = '';
  if (!userDoc.exists()) {
    linksContainer.innerHTML = `
      <div class="empty-links"><div class="empty-icon"><i class="fas fa-link"></i></div>
      <h3>Usuário não encontrado</h3></div>
    `;
    return;
  }
  const links = userDoc.data().links || {};
  if (!links || Object.keys(links).length === 0) {
    linksContainer.innerHTML = `
      <div class="empty-links"><div class="empty-icon"><i class="fas fa-link"></i></div>
      <h3>Nenhum link ainda</h3><p>Este usuário ainda não adicionou nenhum link.</p></div>
    `;
    return;
  }
  Object.entries(links).forEach(([key, url]) => {
    if (url && url.trim()) {
      const linkElement = document.createElement('div');
      linkElement.className = 'link-box';
      let icon = 'fas fa-external-link-alt', label = key;
      if (url.includes('instagram.com')) { icon = 'fab fa-instagram'; label = 'Instagram'; }
      else if (url.includes('twitter.com') || url.includes('x.com')) { icon = 'fab fa-twitter'; label = 'Twitter/X'; }
      else if (url.includes('tiktok.com')) { icon = 'fab fa-tiktok'; label = 'TikTok'; }
      else if (url.includes('youtube.com')) { icon = 'fab fa-youtube'; label = 'YouTube'; }
      else if (url.includes('github.com')) { icon = 'fab fa-github'; label = 'GitHub'; }
      else if (url.includes('linkedin.com')) { icon = 'fab fa-linkedin'; label = 'LinkedIn'; }
      else if (url.includes('discord')) { icon = 'fab fa-discord'; label = 'Discord'; }
      else if (url.includes('spotify.com')) { icon = 'fab fa-spotify'; label = 'Spotify'; }
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
}

// ===================
// BLUR DO FUNDO SOME SE TEM IMAGEM DE FUNDO
// ===================
async function removerBlurSeTemFundo(userid) {
  const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
  const mediaSnap = await getDoc(mediaRef);
  if (mediaSnap.exists()) {
    const bgUrl = mediaSnap.data().background;
    if (bgUrl) {
      const glassOverlay = document.querySelector('.glass-overlay');
      if (glassOverlay) glassOverlay.style.display = 'none';
    }
  }
}

// ===================
// OUTRAS FUNÇÕES
// ===================
function determinarUsuarioParaCarregar() {
  const params = new URLSearchParams(window.location.search);
  const useridParam = params.get("userid");
  if (useridParam) return useridParam;
  return currentUserId;
}

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


function configurarInterfacePerfil(userid) {
  const navbarBottom = document.querySelector('.navbar-bottom');
  const settingsBtn = document.getElementById('open-settings-btn');
  const isOwnProfile = userid === currentUserId;
  
  if (isOwnProfile) {
    // É SEU PERFIL - mostra navbar e configs
    if (navbarBottom) navbarBottom.style.display = 'flex';
    if (settingsBtn) settingsBtn.style.display = 'block';
  } else {
    // É PERFIL DE OUTRA PESSOA - esconde navbar e configs
    if (navbarBottom) navbarBottom.style.display = 'none';
    if (settingsBtn) settingsBtn.style.display = 'none';
  }
}

async function carregarPerfilCompleto() {
  const userid = determinarUsuarioParaCarregar();
  if (!userid) {
    window.location.href = 'index.html';
    return;
  }

  /*configurarInterfacePerfil(userid);*/
  const userData = await getUserData(userid);
  const aboutRef = doc(db, "users", userid, "user-infos", "about");
  const aboutSnap = await getDoc(aboutRef);
  const aboutData = aboutSnap.exists() ? aboutSnap.data() : {};
  atualizarInformacoesBasicas(userData, userid);
  atualizarVisaoGeral(aboutData);
  atualizarGostosDoUsuario(userid);
  atualizarSobre(userData);
  atualizarImagensPerfil(userData, userid);
  await atualizarEstatisticasPerfil(userid);
  await configurarBotaoSeguir(userid);
  await carregarPostsDoMural(userid);
await removerBlurSeTemFundo(userid);
await inicializarSistemaDeMusicaProfile(userid); // ← Nova função

  // Atualiza src do iframe bgMusic com a música do perfil e exibe o bloco só se houver música
  try {
    const musicBlock = document.querySelector('.music');
    const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
    const mediaSnap = await getDoc(mediaRef);
    const iframe = document.getElementById('bgMusic');
    let musicUrl = "";
    let musicName = "";
    if (mediaSnap.exists()) {
      const mediaData = mediaSnap.data();
      if (mediaData.musicTheme) musicUrl = mediaData.musicTheme;
      if (mediaData.musicThemeName) musicName = mediaData.musicThemeName;
    }
    if (iframe) {
      iframe.src = musicUrl || "";
    }
    // Atualiza o nome da música ao lado do botão
    const musicTitleEl = document.getElementById('musicTitle');
    if (musicTitleEl) musicTitleEl.textContent = musicName || "";
    // Exibe o bloco .music como flex só se houver música
    if (musicBlock) {
      if (musicUrl) {
        musicBlock.style.display = 'flex';
      }
    }

    // --- AUTOPLAY EM IPHONE E OUTROS: listeners globais para tocar música ao primeiro clique/touch ---
    if (musicUrl && iframe) {
      let musicStarted = false;
      function startMusicOnce() {
        if (musicStarted) return;
        try {
          // Para iOS: força reload do src e play
          iframe.src = musicUrl;
          // Para browsers que aceitam play() em audio/iframe
          if (iframe.contentWindow && typeof iframe.contentWindow.postMessage === 'function') {
            iframe.contentWindow.postMessage('play', '*');
          }
        } catch (e) {}
        musicStarted = true;
        document.removeEventListener('click', startMusicOnce, true);
        document.removeEventListener('touchstart', startMusicOnce, true);
        document.removeEventListener('keydown', startMusicOnce, true);
      }
      document.addEventListener('click', startMusicOnce, true);
      document.addEventListener('touchstart', startMusicOnce, true);
      document.addEventListener('keydown', startMusicOnce, true);
    }
  } catch (e) {}


  // Configura botão de mensagem
  const btnMsg = document.getElementById('btnMensagemPerfil') || document.querySelector('.btn-msg');
  if (btnMsg && userid !== currentUserId) {
    btnMsg.onclick = () => iniciarChatComUsuario(userid);
    btnMsg.style.display = 'inline-block';
  } else if (btnMsg) {
    btnMsg.style.display = 'none';
  }

  // Função de cor personalizada removida
  async function aplicarCorPersonalizada(userid) {
  const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
  const mediaSnap = await getDoc(mediaRef);

  // Limpa estilos personalizados se não houver cor
  if (!mediaSnap.exists() || !mediaSnap.data().profileColor) {
    removerEstilosPersonalizados();
    return;
  }

  const cor = mediaSnap.data().profileColor;

  // Bloqueia cor com transparência
  if (corTemTransparencia(cor)) return;

  // Aplica cores em diferentes aspectos
  aplicarCoresMenu(cor);
  aplicarCoresBotoes(cor);
  aplicarCoresImagens(cor);
  aplicarCoresTextos(cor);
  aplicarCoresLinks(cor);
  aplicarCoresInteracoes(cor);
  aplicarCoresFormularios(cor);
  aplicarCoresCards(cor);
}

// ============================================
// VERIFICAÇÃO DE TRANSPARÊNCIA
// ============================================
function corTemTransparencia(cor) {
  return (
    (typeof cor === "string" && cor.trim().toLowerCase().startsWith("rgba")) ||
    (typeof cor === "string" && cor.trim().length === 9 && cor.trim().startsWith("#"))
  );
}

// ============================================
// REMOÇÃO DE ESTILOS
// ============================================
function removerEstilosPersonalizados() {
  const idsEstilos = [
    'menu-item-hover-color',
    'pic-hover-color',
    'action-btn-hover-color',
    'link-hover-color',
    'form-focus-color',
    'card-hover-color',
    'interaction-color',
    'text-accent-color'
  ];
  
  idsEstilos.forEach(id => {
    const style = document.getElementById(id);
    if (style) style.remove();
  });
}

// ============================================
// MENU E NAVEGAÇÃO
// ============================================
function aplicarCoresMenu(cor) {
  const style = criarOuAtualizarEstilo('menu-item-hover-color');
  style.textContent = `
    /* Itens do menu */
    
    .slide {
    background-color: ${cor}; 
    }
    
  `;
}

// ============================================
// BOTÕES
// ============================================
function aplicarCoresBotoes(cor) {
  const style = criarOuAtualizarEstilo('action-btn-hover-color');
  style.textContent = `
    /* Botões de ação primários */
    .action-buttons button {
      background: ${cor} !important;
    }
    
    .action-buttons button:hover {
      background: ${cor} !important;
    }
    

    
    /* Botão carregar mais */
    .load-more-btn {
      color: ${cor} !important;
      border-color: ${cor} !important;
    }
    
    .load-more-btn:hover {
      background-color: ${cor} !important;
      color: #fff !important;
    }
  `;
}

// ============================================
// IMAGENS E FOTOS DE PERFIL
// ============================================
function aplicarCoresImagens(cor) {
  const style = criarOuAtualizarEstilo('pic-hover-color');
  style.textContent = `
    /* Fotos de perfil */
    .autor-pic:hover,
    .user-pic:hover,
    .profile-picture:hover {
      border-color: ${cor} !important;
      box-shadow: 0 0 0 3px ${cor}33 !important;
    }
    
    /* Avatar com borda ativa */
    .user-pic.active,
    .autor-pic.active {
      border-color: ${cor} !important;
    }
  `;
}

// ============================================
// TEXTOS E ÍCONES
// ============================================
function aplicarCoresTextos(cor) {
  const style = criarOuAtualizarEstilo('text-accent-color');
  style.textContent = `
    /* Ícones de informação */
    .info-icon {
      color: ${cor} !important;
      border: ${cor} !important;
    }
    
    /* Estatísticas do perfil */
    .profile-stats strong {
      color: ${cor} !important;
    }
    
    /* Status box */
    .status-box {
      border-left-color: ${cor} !important;
    }
    
    /* Badges */
    .badge-premium,
    .badge-verified {
      background-color: ${cor} !important;
      color: #fff !important;
    }
    
    /* Mensagem visto */
    .msg-visto-externo {
      color: ${cor} !important;
    }

    .about-title {
    color: ${cor} !important;
    }

    .sobre-header {
    color: ${cor} !important;
    }
  `;
}

// ============================================
// LINKS
// ============================================
function aplicarCoresLinks(cor) {
  const style = criarOuAtualizarEstilo('link-hover-color');
  style.textContent = `
    /* Links gerais */
    a.user-link:hover {
      color: ${cor} !important;
    }
    
    /* Boxes de links */
    .link-box:hover {
      border-color: ${cor} !important;
      background-color: ${cor}0a !important;
    }
    
    .link-box:hover .link-arrow {
      color: ${cor} !important;
    }

        .empty-icon{
    color: ${cor};
    }
    
    /* Links de navegação */
    .nav-link:hover,
    .nav-link.active {
      color: ${cor} !important;
      border-bottom-color: ${cor} !important;
    }
  `;
}

// ============================================
// INTERAÇÕES (LIKES, COMENTÁRIOS, ETC)
// ============================================
function aplicarCoresInteracoes(cor) {
  const style = criarOuAtualizarEstilo('interaction-color');
  style.textContent = `
    /* Botão de like */
    .like-btn:hover {
      color: ${cor} !important;
    }
    
    .like-btn.liked {
      color: ${cor} !important;
    }
    
    /* Botão de comentário */
    .comment-btn:hover {
      color: ${cor} !important;
    }
    
    /* Botão de compartilhar */
    .share-btn:hover {
      color: ${cor} !important;
    }
    
    /* Contador de interações */
    .interaction-count.active {
      color: ${cor} !important;
    }
  `;
}

// ============================================
// FORMULÁRIOS
// ============================================
function aplicarCoresFormularios(cor) {
  const style = criarOuAtualizarEstilo('form-focus-color');
  style.textContent = `
  `;
}

// ============================================
// CARDS E CONTAINERS
// ============================================
function aplicarCoresCards(cor) {
  const style = criarOuAtualizarEstilo('card-hover-color');
  style.textContent = `
    /* Cards com hover */
    .post-card:hover,
    .depoimento-card:hover,
    .user-card:hover {
      border-color: ${cor} !important;
    }
    
    /* Divisores */
    .divider {
      background-color: ${cor}33 !important;
    }
    
    /* Progress bars */
    .progress-bar-fill {
      background-color: ${cor} !important;
    }
    
    /* Tooltips */
    .tooltip {
      background-color: ${cor} !important;
      color: #fff !important;
    }
    
    .tooltip::after {
      border-top-color: ${cor} !important;
    }
  `;
}

// ============================================
// FUNÇÃO AUXILIAR
// ============================================
function criarOuAtualizarEstilo(id) {
  let style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    document.head.appendChild(style);
  }
  return style;
}

// ============================================
// APLICAÇÃO
// ============================================
await aplicarCorPersonalizada(userid);

// ============================================
// MOSTRAR/OCULTAR VERIFICADO
// ============================================

async function aplicarVerificado(userid) {
  const userRef = doc(db, 'users', userid);
  const userSnap = await getDoc(userRef);
  
  const verificadoElement = document.querySelector('.verificado');
  
  if (!verificadoElement) return;
  
  // Pega o status do Firebase
  const isVerified = userSnap.exists() && userSnap.data().verified === true;
  
  // Adiciona ou remove a classe 'active'
  if (isVerified) {
    verificadoElement.classList.add('active');
  } else {
    verificadoElement.classList.remove('active');
  }
}

// Chamar ao carregar o perfil
await aplicarVerificado(userid);
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

// ===================
// SISTEMA DE NUDGE ENTRE USUÁRIOS
// ===================
import { addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Função para buscar dados do usuário pelo uid
async function buscarDadosUsuario(userid) {
  let displayname = "Usuário";
  let userphoto = "./src/icon/default.jpg";
  let username = "";
  try {
    const userDoc = await getDoc(doc(db, "users", userid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      displayname = data.displayname || displayname;
      userphoto = data.userphoto || data.photoURL || userphoto;
      username = data.username || "";
    }
    // Busca foto do subdocumento se existir
    const mediaDoc = await getDoc(doc(db, "users", userid, "user-infos", "user-media"));
    if (mediaDoc.exists()) {
      const mediaData = mediaDoc.data();
      userphoto = mediaData.userphoto || userphoto;
    }
  } catch (err) {}
  return { displayname, userphoto, username };
}


// Função para remover popup com animação
function removerComAnimacao(popup) {
  popup.classList.add("saindo");
  setTimeout(() => popup.remove(), 500);
}

// Popup de confirmação de envio
async function mostrarPopupConfirmacaoNudge(destinatarioId) {
  const { displayname } = await buscarDadosUsuario(destinatarioId);
  const popup = document.createElement("div");
  popup.className = "nudge-popup nudge-confirm";
  popup.innerHTML = `
    <p>Você enviou um Nudge para <strong>${displayname}</strong>!</p>
    <button>Fechar</button>
  `;
  document.body.appendChild(popup);

  // Botão fecha com animação
  popup.querySelector("button").onclick = function() {
    removerComAnimacao(popup);
  };
  setTimeout(() => removerComAnimacao(popup), 4000);
}

// Envia nudge ao clicar no botão
function setupNudgeButton() {
  const nudgeBtn = document.querySelector('.btn-nudge');
  if (!nudgeBtn) return;

  nudgeBtn.addEventListener('click', async () => {
    // Toca o som imediatamente ao clicar
    try { new Audio("./src/audio/nudge.mp3").play(); } catch {}

    document.body.classList.add("shake-leve");
    setTimeout(() => document.body.classList.remove("shake-leve"), 500);

    if (!currentUser || !currentUserId) return;
    const destinatarioId = determinarUsuarioParaCarregar();
    if (!destinatarioId || destinatarioId === currentUserId) return;

    try {
      await addDoc(collection(db, "nudges"), {
        to: destinatarioId,
        from: currentUserId,
        data: serverTimestamp()
      });
      // Mostra popup de envio feito
      await mostrarPopupConfirmacaoNudge(destinatarioId);
    } catch (err) {
      console.error("Erro ao salvar nudge:", err);
    }
  });
}

// Monitora nudges recebidos
function monitorarNudgesRecebidos() {
  onAuthStateChanged(auth, user => {
    if (!user) return;
    const nudgesRef = collection(db, "nudges");
    const q = query(nudgesRef, where("to", "==", user.uid));
    onSnapshot(q, snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === "added") {
          const nudge = change.doc.data();
          // Busca dados do remetente pelo uid
          const { displayname, userphoto, username } = await buscarDadosUsuario(nudge.from);

          try { new Audio("./src/sounds/nudge-forte.mp3").play(); } catch {}
          document.body.classList.add("shake-forte");
          setTimeout(() => document.body.classList.remove("shake-forte"), 800);

          mostrarPopupNudge(displayname, userphoto, username, nudge.from);
        }
      });
    });
  });
}

// Popup do nudge recebido
function mostrarPopupNudge(nome, foto, username, remetenteId) {
  const popup = document.createElement("div");
  popup.className = "nudge-popup";
  popup.innerHTML = `
    <img src="${foto}" alt="Foto" class="nudge-photo">
    <p><strong>${nome}</strong> (@${username}) te enviou um nudge!</p>
    <button onclick="window.location.href='direct.html?chatid=chat-${remetenteId}'">Enviar mensagem</button>
    <button>Fechar</button>
  `;
  document.body.appendChild(popup);

  // Botão fecha com animação
  const btns = popup.querySelectorAll("button");
  btns[1].onclick = function() {
    removerComAnimacao(popup);
  };
  setTimeout(() => removerComAnimacao(popup), 10000);
}


// Inicialização do sistema de nudge
document.addEventListener("DOMContentLoaded", () => {
  setupNudgeButton();
  monitorarNudgesRecebidos();
});
// ===================
// SISTEMA DE CHAT
// ===================
function gerarChatId(user1, user2) {
  return `chat-${[user1, user2].sort().join("-")}`;
}

async function iniciarChatComUsuario(targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    console.error("IDs inválidos:", { currentUserId, targetUserId });
    return;
  }
  
  const chatId = gerarChatId(currentUserId, targetUserId);
  const chatRef = doc(db, "chats", chatId);
  
  try {
    // Tenta criar o chat diretamente (sem verificar se existe antes)
    // Se já existir, o Firestore vai ignorar ou você pode usar merge
    await setDoc(chatRef, {
      participants: [currentUserId, targetUserId].sort(),
      createdAt: new Date(),
      lastMessage: "",
      lastMessageTime: null
    }, { merge: true }); // merge: true evita sobrescrever se já existir
    
    console.log("Chat criado/acessado com sucesso!");
    window.location.href = `direct.html?chatid=${chatId}`;
    
  } catch (error) {
    console.error("Erro ao criar/acessar chat:", error);
    console.error("Código do erro:", error.code);
    console.error("Mensagem:", error.message);
    alert("Erro ao iniciar conversa. Verifique suas permissões.");
  }
}
// ===================
// ATUALIZAÇÃO DE INFORMAÇÕES BÁSICAS
// ===================
function atualizarInformacoesBasicas(userData, userid) {
  const nomeCompleto = userData.displayname || "Nome não disponível";
  const nomeElement = document.getElementById("displayname");
  if (nomeElement) nomeElement.textContent = nomeCompleto;

  const usernameElement = document.getElementById("username");
  // Junta os pronomes se existirem
  let pronouns = "";
  if (userData.pronoun1 && userData.pronoun2) {
    pronouns = `${userData.pronoun1}/${userData.pronoun2}`;
  } else if (userData.pronoun1) {
    pronouns = userData.pronoun1;
  } else if (userData.pronoun2) {
    pronouns = userData.pronoun2;
  }
  if (usernameElement) {
    usernameElement.textContent = userData.username ? `@${userData.username}` : `@${userid}`;
    if (pronouns) {
      usernameElement.textContent += ` • ${pronouns}`;
    }
  }
  const statususername = document.getElementById('statususername');
  if (statususername) statususername.textContent = `${nomeCompleto} esta:`;

  const headername = document.getElementById('headername');
  if (headername) headername.textContent = userData.username ? `${userData.username}` : `@${userid}`;

  const nomeUsuario = document.getElementById('nomeUsuario');
  if (nomeUsuario) nomeUsuario.textContent = `${nomeCompleto}`;

  const tituloMural = document.getElementById("tituloMural");
  if (tituloMural) tituloMural.textContent = `Mural de ${nomeCompleto}`;

  const visaoGeralTitle = document.getElementById("visao-geral-title");
  if (visaoGeralTitle) visaoGeralTitle.textContent = `Visão Geral de ${nomeCompleto}`;

  const gostosTitle = document.getElementById("gostos-title");
  if (gostosTitle) gostosTitle.textContent = `Gostos de ${nomeCompleto}`;

  const depsTitle = document.querySelector('.deps-tab h3');
  if (depsTitle) depsTitle.textContent = `Depoimentos de ${nomeCompleto}`;

  const linksTitle = document.querySelector('.links-tab h3');
  if (linksTitle) linksTitle.textContent = `Links de ${nomeCompleto}`;

  const amigosTitle = document.querySelector('.amigos-tab h3');
  if (amigosTitle) amigosTitle.textContent = `Amigos de ${nomeCompleto}`;
}






// ATUALIZAÇÃO DE VISÃO GERAL
function atualizarVisaoGeral(dados) {
  const visaoTab = document.querySelector('.visao-tab .about-container');
  if (!visaoTab) return;
  const aboutBoxes = visaoTab.querySelectorAll('.about-box');
  if (aboutBoxes[0]) aboutBoxes[0].innerHTML = `<p class="about-title">Visão geral:</p><p>${dados.overview || "Informação não disponível"}</p>`;
  if (aboutBoxes[1]) aboutBoxes[1].innerHTML = `<p class="about-title">Tags:</p><p>${dados.tags || "Informação não disponível"}</p>`;
  if (aboutBoxes[2]) aboutBoxes[2].innerHTML = `<p class="about-title">Meu Estilo:</p><p>${dados.styles || "Informação não disponível"}</p>`;
  if (aboutBoxes[3]) aboutBoxes[3].innerHTML = `<p class="about-title">Minha personalidade:</p><p>${dados.personality || "Informação não disponível"}</p>`;
  if (aboutBoxes[4]) aboutBoxes[4].innerHTML = `<p class="about-title">Meus Sonhos e desejos:</p><p>${dados.dreams || "Informação não disponível"}</p>`;
  if (aboutBoxes[5]) aboutBoxes[5].innerHTML = `<p class="about-title">Meus Medos:</p><p>${dados.fears || "Informação não disponível"}</p>`;
}

// ATUALIZAÇÃO DE GOSTOS
function atualizarGostosDoUsuario(userid) {
  const gostosTab = document.querySelector('.gostos-tab .about-container');
  if (!gostosTab) return;
  const likesRef = doc(db, "users", userid, "user-infos", "likes");
  getDoc(likesRef).then(likesSnap => {
    const gostos = likesSnap.exists() ? likesSnap.data() : {};
    const aboutBoxes = gostosTab.querySelectorAll('.about-box');
    if (aboutBoxes[0]) aboutBoxes[0].innerHTML = `<p class="about-title">Músicas:</p><p>${gostos.music || "Informação não disponível"}</p>`;
    if (aboutBoxes[1]) aboutBoxes[1].innerHTML = `<p class="about-title">Filmes e Séries:</p><p>${gostos.movies || "Informação não disponível"}</p>`;
    if (aboutBoxes[2]) aboutBoxes[2].innerHTML = `<p class="about-title">Livros:</p><p>${gostos.books || "Informação não disponível"}</p>`;
    if (aboutBoxes[3]) aboutBoxes[3].innerHTML = `<p class="about-title">Personagens:</p><p>${gostos.characters || "Informação não disponível"}</p>`;
    if (aboutBoxes[4]) aboutBoxes[4].innerHTML = `<p class="about-title">Comidas e Bebidas:</p><p>${gostos.foods || "Informação não disponível"}</p>`;
    if (aboutBoxes[5]) aboutBoxes[5].innerHTML = `<p class="about-title">Hobbies:</p><p>${gostos.hobbies || "Informação não disponível"}</p>`;
    if (aboutBoxes[6]) aboutBoxes[6].innerHTML = `<p class="about-title">Jogos favoritos:</p><p>${gostos.games || "Informação não disponível"}</p>`;
    if (aboutBoxes[7]) aboutBoxes[7].innerHTML = `<p class="about-title">Outros gostos:</p><p>${gostos.others || "Informação não disponível"}</p>`;
  });
}


// ATUALIZAÇÃO DA TAB SOBRE (gênero, localização, estado civil)
function atualizarSobre(userData) {
  const generoEl = document.getElementById('generoUsuario');
  const localizacaoEl = document.getElementById('localizacaoUsuario');
  const estadoCivilEl = document.getElementById('estadoCivilUsuario');
  const idadeEl = document.getElementById('idadeUsuario');
  const areaUsuario = document.getElementById('areaUsuario');
  const nomeRealUsuario = document.getElementById('nomeRealUsuario');
  if (generoEl) generoEl.textContent = userData.gender || "Não informado";
  if (localizacaoEl) localizacaoEl.textContent = userData.location || "Não informada";
  if (estadoCivilEl) estadoCivilEl.textContent = userData.maritalStatus || "Não informado";
  if (idadeEl) idadeEl.textContent = userData.age || "Não informada";
  if (areaUsuario) areaUsuario.textContent = userData.area || "Não informada";
  if (nomeRealUsuario) nomeRealUsuario.textContent = userData.name || "Não informado";
}


// CÓDIGO PARA ADICIONAR EM codigo-mobile.js

function setupSettingsSidebar() {
    // A. Elementos
    // 1. O botão que o usuário clica para abrir (EXEMPLO: ajuste o ID se for diferente)
    const openBtn = document.getElementById('open-settings-btn'); 
    
    // 2. A barra lateral que será aberta
    const sidebar = document.getElementById('settings-sidebar');
    
    // 3. O botão de 'x' que fecha a barra
    const closeBtn = document.getElementById('close-sidebar-btn');

    // B. Funções
    function toggleSidebar() {
        if (sidebar) {
            // Adiciona ou remove a classe 'open', ativando o efeito CSS
            sidebar.classList.toggle('open');
            
            // Opcional: Impedir o scroll da página enquanto a barra está aberta
            document.body.style.overflow = sidebar.classList.contains('open') ? 'hidden' : '';
        }
    }

    // C. Listeners de Evento
    // Abre ao clicar no botão de configurações
    if (openBtn) {
        openBtn.addEventListener('click', (event) => {
            event.stopPropagation(); // Evita que o clique seja propagado para o body
            toggleSidebar();
        });
    }
    
    // Fecha ao clicar no botão 'x'
    if (closeBtn) {
        closeBtn.addEventListener('click', toggleSidebar);
    }

    // Opcional: Fechar ao clicar em qualquer lugar da tela, fora da sidebar
    document.addEventListener('click', (event) => {
        // Verifica se o clique foi fora da sidebar E se a sidebar está aberta
        if (sidebar && sidebar.classList.contains('open') && 
            !sidebar.contains(event.target)) {
            toggleSidebar(); // Chama para fechar
        }
    });
}

// Chame a função de inicialização
// Se o seu código já usa um evento de 'DOMContentLoaded', adicione a função lá.
setupSettingsSidebar();

// ===================
// ATUALIZAÇÃO DE IMAGENS DO PERFIL
// ===================
async function atualizarImagensPerfil(userData, userid) {
  const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
  const mediaSnap = await getDoc(mediaRef);
  const mediaData = mediaSnap.exists() ? mediaSnap.data() : {};

  const profilePic = document.querySelector('.profile-pic');
  if (profilePic) {
    profilePic.src = mediaData.userphoto || './src/icon/default.jpg';
    profilePic.onerror = () => { profilePic.src = './src/icon/default.jpg'; };
  }

  const userPics = document.querySelectorAll('.user-pic');
  userPics.forEach(pic => {
    pic.src = mediaData.userphoto || './src/icon/default.jpg';
    pic.onerror = () => { pic.src = './src/icon/default.jpg'; };
  });

  // Removido: aplicação de cor personalizada

/* === APLICAR FUNDO GERAL NA CONTAINER-FULL ===
const bgUrl = mediaData.background;
const containerFull = document.querySelector(".full-profile-container");

if (containerFull && bgUrl) {
    containerFull.style.setProperty("background-image", `url('${bgUrl}')`, "important");
    containerFull.style.setProperty("background-size", "cover", "important");
    containerFull.style.setProperty("background-position", "center", "important");
    containerFull.style.setProperty("background-repeat", "no-repeat", "important");
}
*/

  const headerPhoto = mediaData.headerphoto;
  const headerEl = document.querySelector('.profile-header-bg');
  if (headerEl && headerPhoto) {
    headerEl.style.backgroundImage = `url('${headerPhoto}')`;
    headerEl.style.backgroundSize = 'cover';
    headerEl.style.backgroundPosition = 'center';
  }
}

renderFeedGrid(postsArray);

// ===================
// LINKS E LOGOUT
// ===================
function configurarLinks() {
  if (currentUserId && currentUserData) {
    const urlPerfil = `PF.html?userid=${encodeURIComponent(currentUserId)}`;
    const linkSidebar = document.getElementById('linkPerfilSidebar');
    const linkMobile = document.getElementById('linkPerfilMobile');
    if (linkSidebar) linkSidebar.href = urlPerfil;
    if (linkMobile) linkMobile.href = urlPerfil;
  }
  const btnSair = document.getElementById('btnSair');
  if (btnSair) {
    btnSair.addEventListener('click', (e) => {
      e.preventDefault();
      signOut(auth);
      window.location.href = 'login.html';
    });
  }
}




