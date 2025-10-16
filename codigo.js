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
  increment
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


onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  currentUserId = user.uid;
  currentUserData = await getUserData(currentUserId);
  await carregarPerfilCompleto();
  configurarLinks();
  configurarNavegacaoTabs();
  await atualizarMarqueeUltimoUsuario();
});

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
        li.textContent = user.displayname ? `${user.displayname} (@${user.username})` : user.username;
        li.addEventListener('click', () => {
          window.location.href = `PF.html?userid=${docSnap.id}`;
        });
        resultsList.appendChild(li);
      });
      resultsList.classList.add('visible');
    } catch (err) {
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
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Editar perfil';
    editBtn.className = 'btn-edit-profile';
    editBtn.onclick = () => window.location.href = 'config.html';
    followBtn.parentNode.appendChild(editBtn);
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
      <textarea id="depoimentoTexto" placeholder="Escreva seu depoimento aqui..." maxlength="500"></textarea>
      <div class="form-actions">
        <span class="char-count">0/500</span>
        <button class="btn-enviar-depoimento" onclick="enviarDepoimento('${userid}')">
          <i class="fas fa-paper-plane"></i> Enviar Depoimento
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
      position: fixed; top: 20px; right: 20px; background: #28a745; color: white;
      padding: 12px 20px; border-radius: 8px; z-index: 999999999; animation: slideIn 0.3s ease-out;
    `;
    document.body.appendChild(successMsg);
    setTimeout(() => { successMsg.remove(); }, 3000);
  } catch {
    alert('Erro ao enviar depoimento. Tente novamente.');
  } finally {
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Depoimento';
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
    position: fixed; top: 20px; right: 20px; background: #dc3545; color: white;
    padding: 12px 20px; border-radius: 8px; z-index: 9999; animation: slideIn 0.3s ease-out;
  `;
  document.body.appendChild(successMsg);
  setTimeout(() => { successMsg.remove(); }, 3000);
}

// ===================
// SISTEMA DE POSTS DO MURAL
// ===================
let isLoadingPosts = false;
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
  const userData = await getUserData(userid);
  const userPhoto = await getUserPhoto(userid); // <-- busca correta
  const displayName = userData.displayname || userData.username || userid;
  const username = userData.username || userid;
  const postsRef = collection(db, 'users', userid, 'posts');
  const postsQuery = query(postsRef, orderBy('create', 'desc'), limit(10));
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
  snapshot.forEach(postDoc => {
    const postData = postDoc.data();
    const postElement = criarElementoPost(postData, userPhoto, displayName, username, postDoc.id, userid);
    muralContainer.appendChild(postElement);
  });
  if (snapshot.docs.length > 0) lastPostDoc = snapshot.docs[snapshot.docs.length - 1];
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
  isLoadingPosts = false;
}

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
  if (!menuItems.length || !tabs.length) return;
  menuItems.forEach((item, index) => {
    item.addEventListener('click', async () => {
      menuItems.forEach(mi => mi.classList.remove('active'));
      tabs.forEach(tab => tab.classList.remove('active'));
      item.classList.add('active');
      if (tabs[index]) tabs[index].classList.add('active');
      const userid = determinarUsuarioParaCarregar();
      if (!userid) return;
      if (index === 0) {
        if (!document.querySelector('#muralPosts .post-card:not(.loading-container):not(.empty-posts):not(.error-container)')) {
          await carregarPostsDoMural(userid);
        }
      } else if (index === 3) {
        await carregarDepoimentos(userid);
      } else if (index === 4) {
        await carregarLinks(userid);
      }
    });
  });
  if (menuItems[0] && tabs[0]) {
    menuItems[0].classList.add('active');
    tabs[0].classList.add('active');
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
// SISTEMA DE MÚSICA DO PERFIL
// ===================
async function tocarMusicaDoUsuario(userid) {
  const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
  const mediaSnap = await getDoc(mediaRef);
  if (mediaSnap.exists()) {
    const musicUrl = mediaSnap.data().music;
    if (musicUrl) {
      let audio = document.getElementById('profileMusicAudio');
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'profileMusicAudio';
        audio.src = musicUrl;
        audio.autoplay = true;
        audio.loop = true;
        audio.volume = 0.5;
        audio.style.display = 'none';
        document.body.appendChild(audio);
      } else {
        audio.src = musicUrl;
        audio.play();
      }
    }
  }
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


async function carregarPerfilCompleto() {
  const userid = determinarUsuarioParaCarregar();
  if (!userid) {
    window.location.href = 'index.html';
    return;
  }
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
  await tocarMusicaDoUsuario(userid);


  // Configura botão de mensagem
  const btnMsg = document.getElementById('btnMensagemPerfil') || document.querySelector('.btn-msg');
  if (btnMsg && userid !== currentUserId) {
    btnMsg.onclick = () => iniciarChatComUsuario(userid);
    btnMsg.style.display = 'inline-block';
  } else if (btnMsg) {
    btnMsg.style.display = 'none';
  }

  async function aplicarCorPersonalizada(userid) {
  const mediaRef = doc(db, "users", userid, "user-infos", "user-media");
  const mediaSnap = await getDoc(mediaRef);

  // Só aplica se existir cor personalizada
  if (!mediaSnap.exists() || !mediaSnap.data().profileColor) {
    // Remove estilos dinâmicos se existirem
    const style = document.getElementById('menu-item-hover-color');
    if (style) style.remove();
    const styleHoverPic = document.getElementById('pic-hover-color');
    if (styleHoverPic) styleHoverPic.remove();
    // Opcional: pode remover outros estilos personalizados aqui
    return;
  }


  const cor = mediaSnap.data().profileColor;

// Bloqueia cor com transparência
const corEhTransparente =
  (typeof cor === "string" && cor.trim().toLowerCase().startsWith("rgba")) ||
  (typeof cor === "string" && cor.trim().length === 9 && cor.trim().startsWith("#"));

if (corEhTransparente) return; // Não aplica cor personalizada

  // Adiciona CSS dinâmico para o hover do menu
  const style = document.getElementById('menu-item-hover-color') || document.createElement('style');
  style.id = 'menu-item-hover-color';
  style.textContent = `
    .menu-item:hover {
      background-color: ${cor} !important;
      color: #fff !important;
    }
  `;
  if (!document.head.contains(style)) document.head.appendChild(style);

  // ...já dentro de aplicarCorPersonalizada...

// Altera cor dos botões .action-buttons
document.querySelectorAll('.action-buttons button').forEach(btn => {
  btn.style.color = cor;
  btn.style.borderColor = cor;
  btn.style.background = 'transparent';
});

// Altera cor do hover dos botões .action-buttons
const styleBtnHover = document.getElementById('action-btn-hover-color') || document.createElement('style');
styleBtnHover.id = 'action-btn-hover-color';
styleBtnHover.textContent = `
  .action-buttons button:hover {
    background-color: ${cor} !important;
    color: #fff !important;
    border-color: ${cor} !important;
  }
`;
if (!document.head.contains(styleBtnHover)) document.head.appendChild(styleBtnHover);

  // Adiciona CSS dinâmico para hover das fotos de perfil
  const styleHoverPic = document.getElementById('pic-hover-color') || document.createElement('style');
  styleHoverPic.id = 'pic-hover-color';
  styleHoverPic.textContent = `
    .autor-pic:hover,
    .user-pic:hover {
      border-color: ${cor} !important;
    }
  `;
  if (!document.head.contains(styleHoverPic)) document.head.appendChild(styleHoverPic);

  // Altera todos elementos com cor principal
  document.querySelectorAll(`
    .info-icon,
    .profile-stats strong,
    .action-buttons button,
    .action-buttons button:hover,
    .menu-item:hover,
    .status-box,
    .btn-enviar-depoimento,
    .btn-enviar-depoimento:hover,
    .btn-follow,
    .btn-follow.following,
    .like-btn:hover,
    .like-btn.liked,
    .load-more-btn,
    .load-more-btn:hover,
    .msg-visto-externo
  `).forEach(el => {
    el.style.color = cor;
    el.style.borderColor = cor;
    if (el.classList.contains('btn-enviar-depoimento') || el.classList.contains('load-more-btn')) {
      el.style.background = cor;
    }
  });
}
await aplicarCorPersonalizada(userid);
}


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
  if (generoEl) generoEl.textContent = userData.gender || "Não informado";
  if (localizacaoEl) localizacaoEl.textContent = userData.location || "Não informada";
  if (estadoCivilEl) estadoCivilEl.textContent = userData.maritalStatus || "Não informado";
}

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


  const bgUrl = mediaData.background;
  if (bgUrl) {
    document.body.style.backgroundImage = `url('${bgUrl}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
  }

  const headerPhoto = mediaData.headerphoto;
  const headerEl = document.querySelector('.profile-header');
  if (headerEl && headerPhoto) {
    headerEl.style.backgroundImage = `url('${headerPhoto}')`;
    headerEl.style.backgroundSize = 'cover';
    headerEl.style.backgroundPosition = 'center';
  }
}

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
      window.location.href = 'index.html';
    });
  }
}
document.addEventListener('DOMContentLoaded', function() {
  if (window.innerWidth <= 768) {
    const header = document.querySelector('.profile-header');
    if (header) {
      // Remove imediatamente
      header.classList.remove('shrink');
      // Observa mudanças de classe e remove sempre que aparecer
      const observer = new MutationObserver(() => {
        if (header.classList.contains('shrink')) {
          header.classList.remove('shrink');
        }
      });
      observer.observe(header, { attributes: true, attributeFilter: ['class'] });
    }
  }
});

function removerShrinkHeaderMobile() {
  if (window.innerWidth <= 768) {
    const header = document.querySelector('.profile-header');
    if (header) {
      header.classList.remove('shrink');
      // Observa mudanças de classe e remove sempre que aparecer
      if (!header._shrinkObserver) {
        const observer = new MutationObserver(() => {
          if (header.classList.contains('shrink')) {
            header.classList.remove('shrink');
          }
        });
        observer.observe(header, { attributes: true, attributeFilter: ['class'] });
        header._shrinkObserver = observer;
      }
    }
  }
}
document.addEventListener('DOMContentLoaded', removerShrinkHeaderMobile);
window.addEventListener('resize', removerShrinkHeaderMobile);


function esconderNoteBubbleSeShrink() {
  const header = document.querySelector('.profile-header');
  const note = document.querySelector('.note-bubble');
  if (header && note) {
    if (header.classList.contains('shrink')) {
      note.classList.add('fade-out');
    } else {
      note.classList.remove('fade-out');
    }
  }
}
// Chame sempre que o header mudar:
const header = document.querySelector('.profile-header');
if (header) {
  const observer = new MutationObserver(esconderNoteBubbleSeShrink);
  observer.observe(header, { attributes: true, attributeFilter: ['class'] });
  esconderNoteBubbleSeShrink();
}