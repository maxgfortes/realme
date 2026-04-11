import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
  where,
  deleteDoc,
  query,
  orderBy,
  limit,
  startAfter
  
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { registerPushNotifications, listenForegroundMessages } from "./notifications-push.js";


import { 
  toggleSalvarPost, 
  verificarSeEstaSalvo 
} from './save-posts.js';

import {
  triggerNovoPost,
  triggerNovoBubble,
  triggerNovoComentario
} from './activitie-creator.js';


let lastPostSnapshot = null; 
let allItems = []; 

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

const POSTS_LIMIT = 10;
let loading = false;
let hasMorePosts = true;

let feed = null;
let loadMoreBtn = null;
let postInput = null;
let postButton = null;

// ==============================
// SISTEMA DE CACHE FORTE DO FEED
// ==============================
const CACHE_CONFIG = {
  POSTS_TTL: 5 * 60 * 1000,          // 5 minutos para posts
  BUBBLES_TTL: 3 * 60 * 1000,        // 3 minutos para bubbles (expiram em 24h)
  USERS_TTL: 10 * 60 * 1000,         // 10 minutos para dados de usuário
  CHECK_UPDATE_INTERVAL: 2 * 60 * 1000, // Verificar atualizações a cada 2 minutos
  MAX_CACHED_POSTS: 100,             // Máximo de posts em cache
  MAX_CACHED_BUBBLES: 50             // Máximo de bubbles em cache
};

let cacheCheckTimer = null;

// Obter cache de posts com tipo e timestamp
function getPostsCache() {
  try {
    const cached = localStorage.getItem('feed_posts_cache');
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
    // Verificar expiração
    if (now - data.timestamp > CACHE_CONFIG.POSTS_TTL) {
          localStorage.removeItem('feed_posts_cache');
      return null;
    }
    
    return data.posts;
  } catch (e) {
    console.warn('Erro ao recuperar cache de posts:', e);
    return null;
  }
}

// Salvar cache de posts
function setPostsCache(posts) {
  try {
    // Limitar a quantidade de posts em cache
    const postsParaCache = posts.slice(0, CACHE_CONFIG.MAX_CACHED_POSTS);
    
    localStorage.setItem('feed_posts_cache', JSON.stringify({
      timestamp: Date.now(),
      posts: postsParaCache
    }));
    } catch (e) {
    console.warn('Erro ao salvar cache de posts:', e);
  }
}

// Obter cache de bubbles
function getBubblesCache() {
  try {
    const cached = localStorage.getItem('feed_bubbles_cache');
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
    if (now - data.timestamp > CACHE_CONFIG.BUBBLES_TTL) {
          localStorage.removeItem('feed_bubbles_cache');
      return null;
    }
    
    // Filtrar bubbles ainda válidos (menos de 24h)
    const bubblesValidos = data.bubbles.filter(bubble => {
      let dataCriacao = bubble.create;
      if (typeof dataCriacao === 'object' && dataCriacao.seconds) {
        dataCriacao = dataCriacao.seconds * 1000;
      } else {
        dataCriacao = new Date(dataCriacao).getTime();
      }
      const diferencaHoras = (now - dataCriacao) / (1000 * 60 * 60);
      return diferencaHoras < 24;
    });
    
    return bubblesValidos;
  } catch (e) {
    console.warn('Erro ao recuperar cache de bubbles:', e);
    return null;
  }
}

// Salvar cache de bubbles
function setBubblesCache(bubbles) {
  try {
    const bubblesParaCache = bubbles.slice(0, CACHE_CONFIG.MAX_CACHED_BUBBLES);
    
    localStorage.setItem('feed_bubbles_cache', JSON.stringify({
      timestamp: Date.now(),
      bubbles: bubblesParaCache
    }));
    } catch (e) {
    console.warn('Erro ao salvar cache de bubbles:', e);
  }
}

// Limpar cache do feed
function limparCacheFeed() {
  try {
    localStorage.removeItem('feed_posts_cache');
    localStorage.removeItem('feed_bubbles_cache');
    } catch (e) {
    console.warn('Erro ao limpar cache:', e);
  }
}

// Verificar atualizações em background (sincronização silenciosa)
function iniciarSincronizacaoBackground() {
  if (cacheCheckTimer) clearInterval(cacheCheckTimer);
  
  cacheCheckTimer = setInterval(async () => {
    try {
      const usuarioLogado = auth.currentUser;
      if (!usuarioLogado) return;

      // Buscar apenas o post mais recente para checar se há novidades
      const q = query(
        collection(db, 'posts'),
        orderBy('create', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      if (snapshot.empty) return;

      const postMaisRecente = snapshot.docs[0];
      const cacheAtual = getPostsCache() || [];
      const ultimoEmCache = cacheAtual.find(p => p.tipo === 'post');

      // Só invalida o cache se houver post novo — a próxima loadPosts() irá buscar e reclassificar
      if (ultimoEmCache && postMaisRecente.id !== ultimoEmCache.postid) {
        limparCacheFeed();
      }
    } catch (e) {
      console.warn('Erro ao sincronizar background:', e);
    }
  }, CACHE_CONFIG.CHECK_UPDATE_INTERVAL);
}

// Parar sincronização
function pararSincronizacaoBackground() {
  if (cacheCheckTimer) {
    clearInterval(cacheCheckTimer);
    cacheCheckTimer = null;
  }
}


// ===================
// DETECTAR E FORMATAR HASHTAGS E MENÇÕES
// ===================
function formatarHashtags(texto) {
  return texto.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
}

function formatarMentions(texto) { 
  const mentionRegex = /@([a-z0-9._]+)/g;
  return texto.replace(mentionRegex, (match, username) => {
     return `<a href="profile?u=${username}" class="mention">@${username}</a>`;
    });
}

function formatarTexto(text) {
  let texto = formatarHashtags(text);
  texto = formatarMentions(texto);
  return texto;
}



// ===================
// VERIFICAR LOGIN COM AUTH
// ===================
function verificarLogin() {
  return new Promise((resolve) => {
    // unsubscribe imediato após primeiro evento — evita múltiplos disparos
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      if (!user) {
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
    if (!docSnap.exists()) {
      console.warn(`⚠️ Usuário ${uid} não existe no Firebase`);
      return null;
    }
    const userData = docSnap.data();

    // Tenta buscar username/displayname de subcollection user-infos/user-data como fallback
    let extraData = {};
    try {
      const extraRef = doc(db, "users", uid, "user-infos", "user-data");
      const extraSnap = await getDoc(extraRef);
      if (extraSnap.exists()) {
        extraData = extraSnap.data();
      }
    } catch (e) {
      // subcollection opcional — ignora erro
    }

    // Busca userphoto
    let userphoto = '';
    try {
      const photoRef = doc(db, "users", uid, "user-infos", "user-media");
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        userphoto = photoSnap.data().userphoto || '';
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar foto:', e.message);
    }

    const resultado = {
      userphoto,
      // Prioriza dado do doc raiz, depois subcollection, depois uid como último recurso
      username: userData.username || extraData.username || '',
      displayname: userData.displayname || extraData.displayname || '',
      name: userData.name || extraData.name || '',
      verified: userData.verified || extraData.verified || false
    };

    return resultado;
  } catch (error) {
    console.error("❌ Erro ao buscar dados do usuário:", error);
    return null;
  }
}


function configurarScrollInfinito() {
  document.addEventListener('scroll', async (e) => {
    let scrollTop, windowHeight, documentHeight;
    const target = e.target;
    
    if (target === document || target === document.documentElement || target === document.body) {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      windowHeight = window.innerHeight;
      documentHeight = document.documentElement.scrollHeight;
    } 

    else if (target.scrollHeight > target.clientHeight) {
      scrollTop = target.scrollTop;
      windowHeight = target.clientHeight;
      documentHeight = target.scrollHeight;
    } else {
      return;
    }

    const threshold = 2200;

    if (scrollTop + windowHeight >= documentHeight - threshold) {
      
      const divFirebase = document.getElementById('feed');

      if (divFirebase && window.getComputedStyle(divFirebase).display !== 'none') {
        if (!loading && hasMorePosts) {
          await loadPosts();
        }
      }
    }
  }, true);
}

// ==============================
// CACHE DE COMENTÁRIOS (localStorage + stale-while-revalidate)
// ==============================
const COMENTARIOS_CACHE_TTL = 2 * 60 * 1000; // 2 minutos
const COMENTARIOS_CACHE_PREFIX = 'coments_cache_';
const COMENTARIOS_CACHE_MAX_POSTS = 30; // máximo de posts em cache

function _coments_getKey(postId) {
  return COMENTARIOS_CACHE_PREFIX + postId;
}

// Retorna os comentários do cache (mesmo que expirado — stale)
function getComentariosCache(postId) {
  try {
    const raw = localStorage.getItem(_coments_getKey(postId));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry.comentarios;
  } catch {
    return null;
  }
}

// Verifica se o cache expirou (mas ainda existe)
function comentariosCacheExpirado(postId) {
  try {
    const raw = localStorage.getItem(_coments_getKey(postId));
    if (!raw) return true;
    const entry = JSON.parse(raw);
    return Date.now() - entry.timestamp > COMENTARIOS_CACHE_TTL;
  } catch {
    return true;
  }
}

// Salva comentários no cache
function setComentariosCache(postId, comentarios) {
  try {
    // Serializa timestamps do Firestore (objeto {seconds, nanoseconds}) para número
    const serializados = comentarios.map(c => ({
      ...c,
      create: (c.create && c.create.seconds) ? c.create.seconds * 1000 : c.create
    }));

    localStorage.setItem(_coments_getKey(postId), JSON.stringify({
      timestamp: Date.now(),
      comentarios: serializados
    }));

    // Limpar entradas antigas se passou do limite
    _coments_limparExcesso();
  } catch (e) {
    console.warn('Erro ao salvar cache de comentários:', e);
  }
}

// Invalida o cache de um post (após enviar novo comentário)
function invalidarCacheComentarios(postId) {
  try {
    localStorage.removeItem(_coments_getKey(postId));
  } catch {}
}

// Evita lotar o localStorage — remove entradas mais antigas
function _coments_limparExcesso() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(COMENTARIOS_CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length <= COMENTARIOS_CACHE_MAX_POSTS) return;

    // Ordena por timestamp e remove os mais velhos
    const comTimestamp = keys.map(k => {
      try { return { k, t: JSON.parse(localStorage.getItem(k)).timestamp }; }
      catch { return { k, t: 0 }; }
    });
    comTimestamp.sort((a, b) => a.t - b.t);
    const excesso = comTimestamp.slice(0, comTimestamp.length - COMENTARIOS_CACHE_MAX_POSTS);
    excesso.forEach(({ k }) => localStorage.removeItem(k));
  } catch {}
}

// ===================
// CARREGAR COMENTÃRIOS - VERSÃO CORRIGIDA
// ===================
async function carregarComentarios(postId) {
  try {
    // Busca já ordenada pelo Firestore (mais antigo primeiro)
    const comentariosQuery = query(
      collection(db, 'posts', postId, 'coments'),
      orderBy('create', 'desc')
    );
    const comentariosSnapshot = await getDocs(comentariosQuery);
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
    
    
    return comentarios;
  } catch (error) {
    console.error("Erro ao carregar comentários:", error);
    return [];
  }
}

// ===================
// RENDERIZAR COMENTÁRIOS (com cache localStorage + stale-while-revalidate)
// ===================

// Renderiza uma lista de comentários num container (função pura, sem I/O)
function renderListaComentarios(comentarios, container) {
  container.innerHTML = '';
  if (comentarios.length === 0) {
    container.innerHTML = '<p class="no-comments">Nenhum comentario ainda</p>';
    return;
  }
  comentarios.forEach(comentario => {
    const nomeParaExibir = comentario.userData?.displayname || comentario.userData?.username || comentario.senderid;
    const usernameParaExibir = comentario.userData?.username ? `${comentario.userData.username}` : '';
    const fotoUsuario = comentario.userData?.userphoto || obterFotoPerfil(comentario.userData, null);
    const conteudoFormatado = formatarTexto(comentario.content);
    const isVerified = comentario.userData?.verified
      ? '<i class="fas fa-check-circle" style="margin-left: 4px; font-size: 0.85em; color: var(--verified-blue)"></i>'
      : '';
    const comentarioEl = document.createElement('div');
    comentarioEl.className = 'comentario-item';
    comentarioEl.innerHTML = `
      <div class="comentario-header">
        <img src="${fotoUsuario}" alt="Avatar" class="comentario-avatar"
             onerror="this.src='./src/img/default.jpg'" />
        <div class="comentario-meta">
          <strong class="comentario-nome" data-username="${comentario.senderid}">${usernameParaExibir}${isVerified}</strong>
          <small class="comentario-data">${formatarDataRelativa(comentario.create)}</small>
        </div>
      </div>
      <div class="comentario-conteudo">${conteudoFormatado}</div>
    `;
    container.appendChild(comentarioEl);
  });
}

async function renderizarComentarios(uid, postId, container) {
  const cached = getComentariosCache(postId);

  if (cached) {
    // Renderiza do cache instantaneamente (sem loading)
    renderListaComentarios(cached, container);

    // Se expirado, rebusca em background e atualiza silenciosamente
    if (comentariosCacheExpirado(postId)) {
      carregarComentarios(postId).then(novos => {
        setComentariosCache(postId, novos);
        renderListaComentarios(novos, container);
      }).catch(() => {}); // falha silenciosa — cache antigo continua exibido
    }
    return;
  }

  // Sem cache: mostra loading e busca no Firestore
  container.innerHTML = '<p class="no-comments" style="opacity:0.5">Carregando comentários...</p>';
  try {
    const comentarios = await carregarComentarios(postId);
    setComentariosCache(postId, comentarios);
    renderListaComentarios(comentarios, container);
  } catch (error) {
    console.error("Erro ao renderizar comentarios:", error);
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
    return false;
  }
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
    return true;
  } catch (error) {
    console.error("Erro ao adicionar comentario:", error);
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
    else if (minutos < 60) return `há ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    else if (horas < 24) return `há ${horas} hora${horas !== 1 ? 's' : ''}`;
    else if (dias < 7) return `há ${dias} dia${dias !== 1 ? 's' : ''}`;
    else if (semanas < 4) return `há ${semanas} semana${semanas !== 1 ? 's' : ''}`;
    else if (meses < 12) return `há ${meses} mês${meses !== 1 ? 'es' : ''}`;
    else return `há    ${anos} ano${anos !== 1 ? 's' : ''}`;
  } catch (error) {
    console.error("Erro ao formatar data:", error);
    return 'Data inválida';
  }
}


// ===================
// CARREGAR POSTS NO FEED
// ===================

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

async function carregarBubbles() {
  try {
    const bubblesQuery = query(
      collection(db, 'bubbles'),
      orderBy('create', 'desc'),
      limit(50) 
    );
    
    const bubblesSnapshot = await getDocs(bubblesQuery);
    const bubblesValidos = [];
    
    for (const bubbleDoc of bubblesSnapshot.docs) {
      const bubbleData = bubbleDoc.data();
      
      if (bubbleEstaValido(bubbleData.create)) {
        bubblesValidos.push({
          ...bubbleData,
          bubbleid: bubbleDoc.id,
          tipo: 'bubble'
        });
      } 
    }
    
    return bubblesValidos;
  } catch (error) {
    console.error("Erro ao carregar bubbles:", error);
    return [];
  }
}

function renderizarBubble(bubbleData, feed) {
  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble-container';
  bubbleEl.innerHTML = `
    <div class="bubble-header">
      <div class="user-info-bubble">
        <img src="./src/img/default.jpg" alt="Avatar do usuário" class="avatar"
             onerror="this.src='./src/img/default.jpg'" />
        <div class="user-meta-bubble">
          <strong class="user-name-link" data-username="${bubbleData.creatorid}">...</strong>
          <small class="bullet">•</small>
          <small class="post-date-bubble">${formatarDataRelativa(bubbleData.create)}</small>
        </div>
      </div>
    </div>
    <div class="bubble-content">
      <div class="bubble-text">
        <p>${formatarTexto(bubbleData.content || '')}</p>
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

  buscarUsuarioCached(bubbleData.creatorid).then(userData => {
    if (userData) {
      const avatar = bubbleEl.querySelector('.avatar');
      const nome = bubbleEl.querySelector('.user-name-link');
      
      if (avatar) avatar.src = userData.userphoto || './src/img/default.jpg';
      if (nome) {
        nome.textContent = userData.username || userData.displayname || userData.name || '';
        if (userData.verified) {
          nome.innerHTML = `${nome.textContent} <i class="fas fa-check-circle" style="margin-left: 4px; font-size: 0.9em; color: #4A90E2;"></i>`;
        }
      }
    }
  });
  
  const btnLike = bubbleEl.querySelector('.like-bubble');
  const usuarioLogado = auth.currentUser;
  
  if (btnLike && usuarioLogado) {
    const likerRef = doc(db, `bubbles/${bubbleData.bubbleid}/likers/${usuarioLogado.uid}`);
    getDoc(likerRef).then(likerSnap => {
      if (likerSnap.exists() && likerSnap.data().like === true) {
        btnLike.classList.add('liked');
        btnLike.querySelector('i').className = 'fas fa-heart';
      }
    });
    
    contarLikesBubble(bubbleData.bubbleid).then(totalLikes => {
      const span = btnLike.querySelector('.like-count');
      if (span) span.textContent = totalLikes;
    });
    
    btnLike.addEventListener('click', async () => {
      await toggleLikeBubble(bubbleData.bubbleid, btnLike);
    });
  }
}

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

async function toggleLikeBubble(bubbleId, btnElement) {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
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
  }
}


function iconType(postData) {
  if (postData.img && postData.img.trim() !== "") {
    return `
<svg width="340" height="340" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_d_4_100)">
<rect x="18.7275" y="114.119" width="214.8" height="166.2" transform="rotate(-4 18.7275 114.119)" fill="#D9D9D9"/>
<rect x="18.7275" y="114.119" width="214.8" height="166.2" transform="rotate(-4 18.7275 114.119)" stroke="#4E4E4E" stroke-width="2.4"/>
</g>
<rect x="40.2495" y="129.455" width="174" height="132.6" transform="rotate(-4 40.2495 129.455)" fill="#676868"/>
<g filter="url(#filter1_d_4_100)">
<rect x="96.1274" y="75.7188" width="214.8" height="166.2" transform="rotate(-4 96.1274 75.7188)" fill="#D9D9D9"/>
<rect x="96.1274" y="75.7188" width="214.8" height="166.2" transform="rotate(-4 96.1274 75.7188)" stroke="#4E4E4E" stroke-width="2.4"/>
</g>
<rect x="117.649" y="91.0548" width="174" height="132.6" transform="rotate(-4 117.649 91.0548)" fill="#B1B8C2"/>
<path fill-rule="evenodd" clip-rule="evenodd" d="M227.22 109.343C228.615 109.245 230.011 109.148 231.406 109.05C232.907 109.522 234.452 109.901 236.044 110.187C237.469 109.803 238.792 109.223 240.013 108.448C241.719 108.329 243.425 108.21 245.13 108.09C246.475 108.518 247.829 108.951 249.195 109.39C250.28 110.41 251.143 111.609 251.784 112.984C252.524 113.542 253.334 113.973 254.212 114.276C256.2 116.248 257.762 118.534 258.899 121.134C261.731 123.703 263.245 126.967 263.44 130.926C263.976 132.365 264.693 133.695 265.589 134.917C265.651 135.237 265.712 135.558 265.773 135.878C265.264 138.541 265.025 141.237 265.053 143.967C264.989 144.793 264.73 145.542 264.275 146.214C264.141 146.856 264.222 147.46 264.519 148.024C263.857 150.004 263.336 152.03 262.957 154.101C262.555 154.936 262.147 155.777 261.731 156.623C261.312 157.069 260.831 157.428 260.287 157.698C260.16 158.798 259.924 159.87 259.577 160.914C258.641 161.992 257.662 163.035 256.64 164.043C256.821 164.833 256.955 165.635 257.042 166.451C256.466 167.098 255.93 167.784 255.433 168.512C255.55 168.789 255.722 169.021 255.949 169.207C258.469 170.167 260.564 171.725 262.236 173.882C262.514 175.62 262.982 177.292 263.639 178.9C266.878 180.466 270.173 181.901 273.524 183.202C278.909 184.819 284.185 186.723 289.35 188.916C290.617 190.141 291.613 191.573 292.339 193.214C294.39 199.156 295.866 205.224 296.767 211.417C296.779 211.579 296.79 211.74 296.801 211.902C260.359 214.45 223.917 216.999 187.475 219.547C187.379 218.173 187.283 216.8 187.187 215.426C187.425 212.028 187.692 208.599 187.987 205.139C188.411 202.009 189.377 199.1 190.883 196.411C191.508 195.67 192.202 195.013 192.966 194.438C200.894 189.813 208.922 185.395 217.05 181.183C217.416 180.788 217.737 180.36 218.012 179.898C218.37 177.911 218.777 175.934 219.233 173.966C220.569 172.496 222.079 171.254 223.764 170.239C223.119 169.508 222.343 168.994 221.436 168.697C221.163 167.9 221.308 167.2 221.873 166.596C220.965 165.771 219.947 165.152 218.822 164.739C218.728 164.437 218.592 164.162 218.413 163.915C218.356 162.828 218.318 161.734 218.301 160.634C216.312 158.755 214.382 156.778 212.51 154.706C212.069 153.772 211.963 152.805 212.19 151.805C211.25 148.747 210.334 145.685 209.444 142.618C209.437 142.07 209.516 141.537 209.683 141.018C210.692 139.697 211.288 138.194 211.471 136.509C211.036 131.952 212.071 127.819 214.578 124.112C214.995 122.877 215.375 121.633 215.72 120.378C216.815 119.107 218.021 117.967 219.337 116.958C220.236 115.595 220.912 114.127 221.367 112.554C223.3 111.406 225.251 110.336 227.22 109.343Z" fill="#767D87"/>
<defs>
<filter id="filter0_d_4_100" x="15.0468" y="97.8543" width="233.232" height="188.14" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="2.4"/>
<feGaussianBlur stdDeviation="1.2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_100"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_100" result="shape"/>
</filter>
<filter id="filter1_d_4_100" x="92.4467" y="59.4543" width="233.232" height="188.14" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="2.4"/>
<feGaussianBlur stdDeviation="1.2"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_100"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_100" result="shape"/>
</filter>
</defs>
</svg>
`;
  } else {
    return `
<svg width="340" height="340" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg">
<g filter="url(#filter0_d_4_124)">
<path d="M65.96 230.28C58.8024 230.28 53 224.478 53 217.32L53 90.9601C53 83.8025 58.8024 78 65.96 78L274.94 78C282.098 78 287.9 83.8024 287.9 90.96L287.9 217.32C287.9 224.478 282.098 230.28 274.94 230.28H162.016C159.335 230.28 156.72 231.112 154.531 232.66L98.8916 272.024C98.5379 272.274 98.2075 272.556 97.9045 272.865C92.7975 278.083 84.0626 273.262 85.7558 266.16L92.8826 236.267C93.6108 233.213 91.295 230.28 88.1551 230.28H65.96Z" fill="#D9D9D9"/>
<path d="M65.96 230.28C58.8024 230.28 53 224.478 53 217.32L53 90.9601C53 83.8025 58.8024 78 65.96 78L274.94 78C282.098 78 287.9 83.8024 287.9 90.96L287.9 217.32C287.9 224.478 282.098 230.28 274.94 230.28H162.016C159.335 230.28 156.72 231.112 154.531 232.66L98.8916 272.024C98.5379 272.274 98.2075 272.556 97.9045 272.865C92.7975 278.083 84.0626 273.262 85.7558 266.16L92.8826 236.267C93.6108 233.213 91.295 230.28 88.1551 230.28H65.96Z" stroke="#4E4E4E" stroke-width="3.24"/>
</g>
<rect x="80.5405" y="116.07" width="12.96" height="179.01" rx="1.62" transform="rotate(-90 80.5405 116.07)" fill="#B7B7B7"/>
<rect x="80.5405" y="116.07" width="12.96" height="179.01" rx="1.62" transform="rotate(-90 80.5405 116.07)" fill="#B7B7B7"/>
<rect x="80.5405" y="142.8" width="12.96" height="129.6" rx="1.62" transform="rotate(-90 80.5405 142.8)" fill="#B7B7B7"/>
<rect x="80.5405" y="169.53" width="12.96" height="162.81" rx="1.62" transform="rotate(-90 80.5405 169.53)" fill="#B7B7B7"/>
<rect x="80.5405" y="196.26" width="12.96" height="75.33" rx="1.62" transform="rotate(-90 80.5405 196.26)" fill="#B7B7B7"/>
<defs>
<filter id="filter0_d_4_124" x="48.1399" y="76.3801" width="244.62" height="206.789" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
<feOffset dy="3.24"/>
<feGaussianBlur stdDeviation="1.62"/>
<feComposite in2="hardAlpha" operator="out"/>
<feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
<feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_124"/>
<feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_124" result="shape"/>
</filter>
</defs>
</svg>`;
  }
}

function renderPost(postData, feed) {
  if (postData.visible === false) return;

  const postEl = document.createElement('div');
  postEl.className = 'post-card';
  postEl.dataset.postId = postData.postid;
  postEl.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="./src/img/default.jpg" alt="Avatar do usuário" class="avatar"
             onerror="this.src='./src/img/default.jpg'" />
        <div class="user-meta">
          <strong class="user-name-link" data-username="${postData.creatorid}"></strong>
          <small class="post-date-mobile">${formatarDataRelativa(postData.create)}</small>
        </div>
      </div>
      <div class="left-space-options">
        <div class="post-icon">
          ${iconType(postData)}
        </div>
        <div class="more-options">
          <button class="more-options-button">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="post-content">
    <div class="post-text">${formatarTexto(postData.content || '')}</div>
    <div class="post-informations"><p> - <span>maxgfortes</span> estava com <span>davzx182</span> e <span>isareliquia<span></p></div>
      ${
        (postData.img && postData.img.trim() !== "")
          ? `
            <div class="post-image">
              <img src="${postData.img}" loading="lazy" decoding="async" style="width:100%;height:auto;display:block;">
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
            <svg width="252" height="253" viewBox="0 0 252 253"  xmlns="http://www.w3.org/2000/svg"><path d="M207.821 9.02051C228.731 3.33416 247.898 22.5349 242.175 43.4346L192.671 224.216C186.201 247.842 154.655 252.357 141.818 231.494L100.558 164.439L97.285 159.121L101.649 154.656L167.753 87.0137L165.087 84.2861L99.2411 151.665L94.6532 156.358L89.1542 152.777L20.7343 108.225C0.472592 95.0309 5.33388 64.0873 28.6649 57.7422L207.821 9.02051Z" stroke="#D9D9D9" stroke-width="20"/></svg>
            <p>Compartilhar</p>
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
        <p class="post-liked-by" style="min-height:28px;visibility:hidden;"></p>
        ${postData._feedTipo === 'amigoDosAmigos' && postData._sugeridoPor
          ? `<p class="post-sugerido-por"><i class="fas fa-user-friends"></i> Sugerido por <strong>@${postData._sugeridoPor}</strong></p>`
          : ''}
      </div>
    </div>
  `;
  feed.appendChild(postEl);

const postImgWrapper = postEl.querySelector('.post-image');
if (postImgWrapper) {
  postImgWrapper.addEventListener('dblclick', async (e) => {
    e.preventDefault();

    _animarCoracaoLike(postImgWrapper, e);

    const usuarioLogado = auth.currentUser;
    if (!usuarioLogado) return;

    const likerRef = doc(db, `posts/${postData.postid}/likers/${usuarioLogado.uid}`);
    const likerSnap = await getDoc(likerRef);
    const jaCurtiu = likerSnap.exists() && likerSnap.data().like === true;

    if (!jaCurtiu) {
      const btnLike = postEl.querySelector('.btn-like');
      if (btnLike) await toggleLikePost(usuarioLogado.uid, postData.postid, btnLike);
    }
  });
}

  const usuarioLogado = auth.currentUser;

  if (usuarioLogado) {
    gerarTextoCurtidoPor(postData.postid, usuarioLogado.uid).then(info => {
      const footer = postEl.querySelector(".post-liked-by");

      if (!footer) return;

      if (info.total === 0) {
        // Mantém o espaço reservado mas invisível — sem layout shift
        footer.style.visibility = "hidden";
      } else {
        // Renderiza as fotos de perfil
        let fotosHTML = '';
        if (info.fotos && info.fotos.length > 0) {
          fotosHTML = '<div style="display: flex; margin-right: 4px;">';
          info.fotos.forEach((foto, index) => {
            fotosHTML += `
              <img 
                src="${foto}" 
                alt="Avatar" 
                style="
                  width: 20px; 
                  height: 20px; 
                  border-radius: 50%; 
                  object-fit: cover;
                  ${index > 0 ? 'margin-left: -8px;' : ''}
                "
              />
            `;
          });
          fotosHTML += '</div>';
        }

        let textoHTML = '<span>Curtido por ';
        
        if (info.usernames.length === 1) {
          textoHTML += `<strong>${info.usernames[0]}</strong>`;
        } else if (info.usernames.length === 2) {
          textoHTML += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
        }
        
        if (info.total > info.usernames.length) {
          textoHTML += ` e outras ${info.total - info.usernames.length} pessoas`;
        }
        
        textoHTML += '</span>';

        footer.style.display = "flex";
        footer.style.alignItems = "center";
        footer.style.gap = "8px";
        footer.innerHTML = fotosHTML + textoHTML;
        // Revela sem mudar altura — o espaço já estava reservado
        footer.style.visibility = "visible";
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
  }

// Atualiza nome e foto do usuário via cache (evita cascata de requisições)
  buscarUsuarioCached(postData.creatorid).then(userData => {
    if (userData) {
      const avatar = postEl.querySelector('.avatar');
      const nome = postEl.querySelector('.user-name-link');
      const username = postEl.querySelector('.post-username');
      if (avatar) avatar.src = userData.userphoto || './src/img/default.jpg';
      if (nome) {
        // Mostra apenas o username no topo
        nome.textContent = userData.username || userData.displayname || userData.name || '...';
        // Adiciona ícone de verificado se o usuário for verificado
        if (userData.verified) {
          nome.innerHTML = `${nome.textContent} <i class="fas fa-check-circle" style="margin-left: 2px; font-size: 0.8em; color: #4A90E2;"></i>`;
        }
      }
      // Remove ou deixa vazio o elemento post-username
      if (username) username.textContent = '';
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

// ===================
// BUSCAR AMIGOS E AMIGOS DOS AMIGOS
// ===================
async function buscarAmigos(uid) {
  try {
    const amigosSnap = await getDocs(collection(db, `users/${uid}/friends`));
    return amigosSnap.docs.map(d => d.id);
  } catch (e) {
    console.warn('Erro ao buscar amigos:', e);
    return [];
  }
}

async function buscarAmigosDosAmigos(uid, amigosUids) {
  const amigosDosAmigos = new Map(); // uid -> sugeridoPor (username do amigo)
  try {
    const promises = amigosUids.slice(0, 20).map(async amigoUid => {
      try {
        const snap = await getDocs(collection(db, `users/${amigoUid}/friends`));
        const userData = await buscarUsuarioCached(amigoUid);
        const usernameAmigo = userData?.username || amigoUid;
        snap.docs.forEach(d => {
          const idAmigoDosAmigos = d.id;
          // Excluir o próprio usuário e amigos diretos
          if (idAmigoDosAmigos !== uid && !amigosUids.includes(idAmigoDosAmigos)) {
            if (!amigosDosAmigos.has(idAmigoDosAmigos)) {
              amigosDosAmigos.set(idAmigoDosAmigos, usernameAmigo);
            }
          }
        });
      } catch {}
    });
    await Promise.all(promises);
  } catch (e) {
    console.warn('Erro ao buscar amigos dos amigos:', e);
  }
  return amigosDosAmigos; // Map<uid, sugeridoPorUsername>
}

// Converte timestamp Firestore ou Date em segundos numéricos
function toSeconds(ts) {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts.seconds) return ts.seconds;
  return new Date(ts).getTime() / 1000;
}

// Ordena array de posts por data decrescente (cronológico)
function ordenarCronologico(posts) {
  return posts.sort((a, b) => toSeconds(b.create) - toSeconds(a.create));
}

// ===================
// MONTAR FEED COM PROPORÇÕES 60/30/10
// ===================
async function montarFeedProporcional(uid, todosOsPosts, amigosUids, amigosDosAmigosMap) {
  const postsAmigos = [];
  const postsAmigosDosAmigos = [];
  const postsDescoberta = [];

  for (const post of todosOsPosts) {
    if (!post || post.visible === false) continue;
    const criadorId = post.creatorid;
    if (criadorId === uid) {
      // Posts do próprio usuário entram como amigos
      postsAmigos.push({ ...post, _feedTipo: 'amigo' });
    } else if (amigosUids.includes(criadorId)) {
      postsAmigos.push({ ...post, _feedTipo: 'amigo' });
    } else if (amigosDosAmigosMap.has(criadorId)) {
      postsAmigosDosAmigos.push({
        ...post,
        _feedTipo: 'amigoDosAmigos',
        _sugeridoPor: amigosDosAmigosMap.get(criadorId)
      });
    } else {
      postsDescoberta.push({ ...post, _feedTipo: 'descoberta' });
    }
  }

  // Ordena cada grupo cronologicamente
  ordenarCronologico(postsAmigos);
  ordenarCronologico(postsAmigosDosAmigos);
  ordenarCronologico(postsDescoberta);

  // Intercala respeitando ~60/30/10 por janela de 10 posts
  // Para cada 10 posts: 6 amigos, 3 amigos dos amigos, 1 descoberta
  const resultado = [];
  let iA = 0, iAA = 0, iD = 0;
  const total = todosOsPosts.filter(p => p && p.visible !== false).length;

  while (resultado.length < total) {
    const lote = [];

    // 6 de amigos
    for (let i = 0; i < 6 && iA < postsAmigos.length; i++, iA++) {
      lote.push(postsAmigos[iA]);
    }
    // 3 de amigos dos amigos
    for (let i = 0; i < 3 && iAA < postsAmigosDosAmigos.length; i++, iAA++) {
      lote.push(postsAmigosDosAmigos[iAA]);
    }
    // 1 de descoberta
    for (let i = 0; i < 1 && iD < postsDescoberta.length; i++, iD++) {
      lote.push(postsDescoberta[iD]);
    }

    // Se o lote ficou vazio, todos os grupos acabaram
    if (lote.length === 0) break;

    // Dentro de cada lote de 10, ordena cronologicamente (mantém feed cronológico)
    ordenarCronologico(lote);
    resultado.push(...lote);
  }

  return resultado;
}

async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;

  const isFirstLoad = !feed || feed.children.length === 0;

  // CACHE-FIRST: renderiza do cache enquanto busca dados frescos
  if (isFirstLoad) {
    const postsEmCache = getPostsCache();
    const bubblesEmCache = getBubblesCache();

    if (postsEmCache || bubblesEmCache) {
      allItems = [];
      if (bubblesEmCache) bubblesEmCache.forEach(b => allItems.push(b));
      if (postsEmCache) postsEmCache.forEach(p => allItems.push(p));

      ordenarCronologico(allItems);

      for (const item of allItems) {
        if (item.tipo === 'bubble') {
          renderizarBubble(item, feed);
        } else {
          renderPost(item, feed);
        }
      }
    }
  }

  // Indicador de carregamento para scroll infinito
  let loadingIndicator = document.getElementById('scroll-loading-indicator');
  if (!isFirstLoad && !loadingIndicator) {
    loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'scroll-loading-indicator';
    loadingIndicator.style.cssText = 'text-align:center;padding:20px;color:#888;font-size:14px;';
    loadingIndicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando mais...';
    feed.appendChild(loadingIndicator);
  }

  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = isFirstLoad ? 'Carregando...' : 'Carregando mais...';
  }

  try {
    // auth.currentUser pode ser null logo após inicialização — aguarda resolução segura
    let usuarioLogado = auth.currentUser;
    if (!usuarioLogado) {
      usuarioLogado = await new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
      });
    }
    if (!usuarioLogado) {
      loading = false;
      return;
    }
    const uid = usuarioLogado.uid;
    let amigosUids = [];
    let amigosDosAmigosMap = new Map();
    if (!lastPostSnapshot) {
      amigosUids = await buscarAmigos(uid);
      amigosDosAmigosMap = await buscarAmigosDosAmigos(uid, amigosUids);
    }

    // Bubbles: apenas na primeira carga
    if (!lastPostSnapshot) {
      const bubbles = await carregarBubbles();
      setBubblesCache(bubbles);
    }

    // Busca lote de posts
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
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Não há mais posts'; loadMoreBtn.disabled = true; }
      if (loadingIndicator) loadingIndicator.remove();
      loading = false;
      return;
    }

    lastPostSnapshot = postsSnapshot.docs[postsSnapshot.docs.length - 1];

    const postsRaw = postsSnapshot.docs.map(d => ({ ...d.data(), postid: d.id, tipo: 'post' }));

    if (isFirstLoad) {
      // Buscar bubbles para misturar
      const bubblesAtuais = getBubblesCache() || await carregarBubbles();
      setBubblesCache(bubblesAtuais);

      // Aplicar proporções 60/30/10 nos posts
      const postsProporcional = await montarFeedProporcional(uid, postsRaw, amigosUids, amigosDosAmigosMap);

      // Salvar em cache
      setPostsCache(postsProporcional);

      // Montar allItems: bubbles + posts ordenados
      allItems = [];
      bubblesAtuais.forEach(b => allItems.push(b));
      postsProporcional.forEach(p => allItems.push(p));

      // Reordena mantendo a ordem proporcional mas com bubbles no topo por data
      // Bubbles ficam no topo cronológico, posts seguem a ordem proporcional
      const bubblesSorted = allItems.filter(i => i.tipo === 'bubble');
      ordenarCronologico(bubblesSorted);
      const postsSorted = allItems.filter(i => i.tipo !== 'bubble');
      allItems = [...bubblesSorted, ...postsSorted];

      feed.innerHTML = '';
      for (const item of allItems) {
        if (item.tipo === 'bubble') {
          renderizarBubble(item, feed);
        } else {
          renderPost(item, feed);
        }
      }

      iniciarSincronizacaoBackground();
    } else {
      // SCROLL INFINITO — busca amigos novamente para classificar os novos posts
      amigosUids = await buscarAmigos(uid);
      amigosDosAmigosMap = await buscarAmigosDosAmigos(uid, amigosUids);
      const postsProporcional = await montarFeedProporcional(uid, postsRaw, amigosUids, amigosDosAmigosMap);

      const cacheAtual = getPostsCache() || [];
      setPostsCache([...cacheAtual, ...postsProporcional]);

      for (const post of postsProporcional) {
        renderPost(post, feed);
      }
    }

    if (postsSnapshot.size < POSTS_LIMIT) {
      hasMorePosts = false;
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Não há mais posts'; loadMoreBtn.disabled = true; }
    } else {
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Carregar mais'; loadMoreBtn.disabled = false; }
    }

    if (loadingIndicator) loadingIndicator.remove();

  } catch (error) {
    console.error('❌ Erro ao carregar posts:', error);
    if (loadMoreBtn) loadMoreBtn.textContent = 'Erro ao carregar';
    const ind = document.getElementById('scroll-loading-indicator');
    if (ind) ind.remove();
  }

  loading = false;
}



// ===================
// ENVIAR POST - VERSÃO OTIMIZADA
// ===================
async function sendPost() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    return;
  }
  
  const texto = postInput.value.trim();
  if (!texto) {
    return;
  }
  
  const linkCheck = detectarLinksMaliciosos(texto);
  if (linkCheck.malicioso) {
    return;
  }

  const loadingInfo = mostrarLoading('Enviando post...');
   
  try {
    const postId = gerarIdUnico('post');
    let urlImagem = '';
    let deleteUrlImagem = '';
    
    const fileInput = document.querySelector('#image-file-input');
    
    if (fileInput && fileInput.files.length > 0) {
      atualizarTextoLoading('Fazendo upload da imagem...');
      const uploadResult = await uploadImagemPost(fileInput.files[0], usuarioLogado.uid);
      
      if (!uploadResult.success) {
        clearInterval(loadingInfo.interval);
        esconderLoading();
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
      likes: 0,
      saves: 0,
      comentarios: 0,
      postid: postId,
      creatorid: usuarioLogado.uid,
      reports: 0,
      visible: true,
      create: serverTimestamp()
    };
    
    await setDoc(doc(db, 'users', usuarioLogado.uid, 'posts', postId), postData);
    await setDoc(doc(db, 'posts', postId), postData);
    
    postInput.value = '';
    
    clearInterval(loadingInfo.interval);
    esconderLoading();

    feed.innerHTML = '';
    hasMorePosts = true;
    loading = false;
    lastPostSnapshot = null;
    limparCacheFeed();
    await loadPosts();
    
  } catch (error) {
    console.error("Erro ao enviar post:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
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
  }
}


// [REMOVIDO] Listener de like duplicado - consolidado em configurarEventListeners()

async function atualizarCurtidoPorDepoisDoLike(btn, postId) {
  const usuarioLogado = auth.currentUser;
  const footer = btn.closest(".post-card").querySelector(".post-liked-by");

  if (!footer || !usuarioLogado) return;

  const info = await gerarTextoCurtidoPor(postId, usuarioLogado.uid);

  if (info.total === 0) {
    footer.style.visibility = "hidden";
    return;
  }

  // Renderiza as fotos de perfil
  let fotosHTML = '';
  if (info.fotos && info.fotos.length > 0) {
    fotosHTML = '<div style="display: flex; margin-right: 0px;">';
    info.fotos.forEach((foto, index) => {
      fotosHTML += `
        <img 
          src="${foto}" 
          alt="Avatar" 
          style="
            width: 20px; 
            height: 20px; 
            border-radius: 50%; 
            object-fit: cover;
            ${index > 0 ? 'margin-left: 0px;' : ''}
          "
        />
      `;
    });
    fotosHTML += '</div>';
  }

  let textoHTML = '<span>Curtido por ';
  
  if (info.usernames.length === 1) {
    textoHTML += `<strong>${info.usernames[0]}</strong>`;
  } else if (info.usernames.length === 2) {
    textoHTML += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
  }
  
  if (info.total > info.usernames.length) {
    textoHTML += ` e outras ${info.total - info.usernames.length} pessoas`;
  }
  
  textoHTML += '</span>';

  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "8px";
  footer.innerHTML = fotosHTML + textoHTML;
  footer.style.visibility = "visible";
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
    // Busca sua foto
    let minhaFoto = '';
    try {
      const photoRef = doc(db, "users", usuarioLogadoUid, "user-infos", "user-media");
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        minhaFoto = photoSnap.data().userphoto || '';
      }
    } catch {}

    return {
      usernames: ["você"],
      total,
      fotos: [minhaFoto || './src/img/default.jpg']
    };
  }

  // 👉 CASO 2: Tem mais curtidas além da sua
  // Remove você para a exibição
  const likersExibicao = likersTotal.filter(l => l.uid !== usuarioLogadoUid);

  if (likersExibicao.length === 0) {
    return { usernames: ["você"], total, fotos: [] };
  }

  // Ordena por mais recente
  likersExibicao.sort((a, b) => b.timestamp - a.timestamp);

  // Buscar amigos
  const amigosSnap = await getDocs(collection(db, `users/${usuarioLogadoUid}/friends`));
  const amigosUid = amigosSnap.docs.map(d => d.id);

  // Filtrar amigos (sem você)
  const amigosQueCurtiram = likersExibicao.filter(l => amigosUid.includes(l.uid));
  const outrosQueCurtiram = likersExibicao.filter(l => !amigosUid.includes(l.uid));

  // 👉 SELECIONA ATÉ 2 PESSOAS (priorizando amigos)
  const pessoasParaMostrar = [];
  
  // Adiciona até 2 amigos primeiro
  for (let i = 0; i < Math.min(2, amigosQueCurtiram.length); i++) {
    pessoasParaMostrar.push(amigosQueCurtiram[i]);
  }
  
  // Se não tiver 2 amigos, completa com outros
  if (pessoasParaMostrar.length < 2) {
    for (let i = 0; i < Math.min(2 - pessoasParaMostrar.length, outrosQueCurtiram.length); i++) {
      pessoasParaMostrar.push(outrosQueCurtiram[i]);
    }
  }

  // 👉 BUSCA OS USERNAMES E FOTOS DAS 2 PESSOAS
  const usernames = [];
  const fotos = [];

  for (let i = 0; i < pessoasParaMostrar.length; i++) {
    const uid = pessoasParaMostrar[i].uid;
    
    // Busca dados do usuário
    const userData = await buscarDadosUsuarioPorUid(uid);
    const username = userData?.username || userData?.displayname || "usuário";
    usernames.push(username);
    
    // Busca foto
    let userphoto = '';
    try {
      const photoRef = doc(db, "users", uid, "user-infos", "user-media");
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        userphoto = photoSnap.data().userphoto || '';
      }
    } catch {}
    
    fotos.push(userphoto || './src/img/default.jpg');
  }

  return { usernames, total, fotos };
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
  return './src/img/default.jpg';
}


// ==============================
// SISTEMA DE CACHE GLOBAL
// ==============================

const CACHE_USER_TIME = 1000 * 60 * 30; // 30 minutos

function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw);

    // Expirou mas NÃO apaga — mantém o stale disponível enquanto
    // a revalidação em background ainda não terminou (evita username sumindo)
    return data.value || null;
  } catch {
    return null;
  }
}

function isCacheExpirado(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    const data = JSON.parse(raw);
    return Date.now() - data.time > CACHE_USER_TIME;
  } catch {
    return true;
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

  // Para o próprio usuário logado, nunca usar cache stale — sempre busca do Firebase
  const ehProprioUsuario = auth.currentUser && auth.currentUser.uid === uid;
  if (ehProprioUsuario) {
    // Tenta usar cache fresco (gravado por atualizarGreeting logo na inicialização)
    if (!isCacheExpirado(key)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { return JSON.parse(raw).value; } catch {}
      }
    }
    // Cache expirado ou ausente — busca direto do Firebase e atualiza
    const dados = await buscarDadosUsuarioPorUid(uid);
    if (dados) setCache(key, dados);
    return dados;
  }

  let stale = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      stale = JSON.parse(raw).value;
    }
  } catch {}

  if (stale) {
    if (isCacheExpirado(key)) {
      // Revalida em background mas mantém o stale visível até terminar
      buscarDadosUsuarioPorUid(uid).then(dados => {
        if (dados) setCache(key, dados);
      }).catch(() => {});
    }
    return stale;
  }

  // Sem cache nenhum — busca e aguarda
  const dados = await buscarDadosUsuarioPorUid(uid);
  if (dados) setCache(key, dados);
  return dados;
}

//Saudação

async function atualizarGreeting(userParam) {
  const user = userParam || auth.currentUser;
  if (!user) return;

  const uid = user.uid;
  const cacheKey = `user_cache_${uid}`;
  const photoKey = `user_photo_${uid}`;

  // Saudação imediata enquanto busca os dados
  const saudacao = getSaudacao();
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) greetingEl.textContent = saudacao;

  // Invalida o cache do próprio usuário antes de buscar — garante dado fresco do Firebase
  try { localStorage.removeItem(cacheKey); } catch {}

  // Sempre busca direto do Firestore — garante que o nome aparece corretamente
  const userData = await buscarDadosUsuarioPorUid(uid);

  // Atualiza cache para uso futuro (posts, bubbles, etc.)
  if (userData) {
    setCache(cacheKey, userData);
    if (userData.userphoto) setCache(photoKey, userData.userphoto);
  }

  const cachedPhoto = userData?.userphoto || getCache(photoKey);
  updateUI({ saudacao, nome: getNome(userData), userData, user, cachedPhoto });
}

// ==============================
// HELPERS
// ==============================

function getSaudacao() {
  const agora = new Date();
  const h = agora.getHours();
  const m = agora.getMinutes();

  if (h >= 6 && (h < 12)) {
    return "Bom dia";
  }

  if (
    (h >= 13 && h < 18) ||
    (h === 18 && m < 30)
  ) {
    return "Boa tarde";
  }

  return "Boa noite";
}

function getNome(data) {
  return data?.username || data?.displayname || data?.name || '';
}

function updateUI({ saudacao, nome, userData, user, cachedPhoto }) {
  const greetingEl = document.getElementById('greeting');
  const usernameEl = document.getElementById('username');

  if (greetingEl) greetingEl.textContent = saudacao;
  if (usernameEl) usernameEl.textContent = nome;

  const fotoEl =
    document.querySelector('.user-welcome img') ||
    document.querySelector('.welcome-box img') ||
    document.querySelector('section.welcome-box .user-welcome img');

  const foto = cachedPhoto || obterFotoPerfil(userData, user);

  if (fotoEl && foto && foto !== './src/img/default.jpg') {
    fotoEl.src = foto;
    fotoEl.onerror = () => (fotoEl.src = './src/img/default.jpg');
  }
}


// ============================================================
// SISTEMA DE ABERTURA DO POST LAYER
// Conecta: botão "+", "Como foi o seu dia?", sidebar "Criar",
//           botão fechar, e abrirPostModal global
// ============================================================
function configurarPostLayer() {
  const postLayer = document.getElementById('postLayer');
  const closeBtn  = document.getElementById('closeLayerBtn');

  if (!postLayer) return;

  function abrirLayer(tipoPadrao = 'post') {
    // Ativar tab correta
    document.querySelectorAll('.post-type-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.post-content-type').forEach(c => c.classList.remove('active'));
    const tab = document.querySelector(`.post-type-tab[data-type="${tipoPadrao}"]`);
    const content = document.querySelector(`.post-content-type[data-type="${tipoPadrao}"]`);
    if (tab) tab.classList.add('active');
    if (content) content.classList.add('active');

    postLayer.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Focar textarea
    setTimeout(() => {
      const textarea = postLayer.querySelector('.post-content-type.active .np-text-input');
      if (textarea) textarea.focus();
    }, 150);
  }

  function fecharLayer() {
    postLayer.classList.remove('active');
    document.body.style.overflow = '';
    limparInputsPost();
    // Remover preview de imagem se existir
    document.querySelector('.image-preview-container')?.remove();
  }

  // Fechar ao clicar no botão de voltar
  if (closeBtn) closeBtn.addEventListener('click', fecharLayer);

  // Fechar ao clicar no fundo (fora do conteúdo)
  postLayer.addEventListener('click', (e) => {
    if (e.target === postLayer) fecharLayer();
  });

  // Fechar com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && postLayer.classList.contains('active')) fecharLayer();
  });

  // Botão "+" na navbar-top
  const topBtn = document.getElementById('openPostLayerNav');
  if (topBtn) topBtn.addEventListener('click', () => abrirLayer('post'));

  // Botão "Como foi o seu dia?" / "Criar post"
  const npBtn = document.getElementById('openPostLayer');
  if (npBtn) npBtn.addEventListener('click', () => abrirLayer('post'));



  // Sidebar "Criar"
  const sidebarCriar = document.querySelector('.sidebar .postmodal');
  if (sidebarCriar) {
    sidebarCriar.removeAttribute('onclick');
    sidebarCriar.addEventListener('click', (e) => {
      e.preventDefault();
      abrirLayer('post');
    });
  }

  // Expor globalmente para onclick inline residual
  window.abrirPostModal  = () => abrirLayer('post');
  window.fecharPostModal = fecharLayer;

  // ============================================================
  // UPLOAD DE IMAGEM NO POST-LAYER (suporte a drag & drop + click)
  // ============================================================
  const postFileArea = document.getElementById('post-file-input');
  const previewPost  = document.querySelector('.image-preview-post');
  const previewImg   = previewPost?.querySelector('img');
  const removeBtn    = document.querySelector('.remove-image-post');

  // Input oculto para seleção de arquivo
  let fileInputLayer = document.getElementById('post-layer-file-input');
  if (!fileInputLayer) {
    fileInputLayer = document.createElement('input');
    fileInputLayer.type = 'file';
    fileInputLayer.id   = 'post-layer-file-input';
    // Suporta todos os tipos aceitos pelo ImgBB + browser
    fileInputLayer.accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp';
    fileInputLayer.style.display = 'none';
    document.body.appendChild(fileInputLayer);
  }

  function selecionarArquivo() { fileInputLayer.click(); }

  function aplicarPreview(file) {
    if (!file) return;
    if (!IMGBB_TIPOS_SUPORTADOS.includes(file.type)) {
      return;
    }
    postImageFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
      if (previewPost) previewPost.style.display = 'block';
      if (postFileArea) postFileArea.style.display = 'none';
      // Mostrar badge do tipo
      const badge = previewPost?.querySelector('.preview-type-badge');
      if (badge) {
        badge.textContent = file.type === 'image/gif' ? 'GIF' : file.type.split('/')[1].toUpperCase();
        badge.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }

  // Click na área de upload
  if (postFileArea) {
    postFileArea.addEventListener('click', selecionarArquivo);
  }

  // Drag & drop
  const fileBox = postFileArea?.closest('.file-box') || postFileArea;
  if (fileBox) {
    fileBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      fileBox.classList.add('drag-over');
    });
    fileBox.addEventListener('dragleave', () => fileBox.classList.remove('drag-over'));
    fileBox.addEventListener('drop', (e) => {
      e.preventDefault();
      fileBox.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) aplicarPreview(file);
    });
  }

  // Seleção via input
  fileInputLayer.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) aplicarPreview(file);
    fileInputLayer.value = ''; // permite reselecionar o mesmo arquivo
  });

  // Remover imagem
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      postImageFile = null;
      if (previewImg) previewImg.src = '';
      if (previewPost) previewPost.style.display = 'none';
      if (postFileArea) postFileArea.style.display = '';
    });
  }
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

// Tipos suportados pelo ImgBB
const IMGBB_TIPOS_SUPORTADOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const IMGBB_MAX_SIZE = 32 * 1024 * 1024; // 32MB limite ImgBB

async function uploadImagemPost(file, userId) {
  try {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    if (!IMGBB_TIPOS_SUPORTADOS.includes(file.type)) {
      throw new Error(`Tipo de arquivo não suportado. Use: JPEG, PNG, GIF, WebP ou BMP.`);
    }
    if (file.size > IMGBB_MAX_SIZE) {
      throw new Error('Arquivo muito grande. Máximo 32MB.');
    }

    let fileToUpload = file;
    
    // Comprimir apenas imagens estáticas maiores que 2MB (NÃO comprimir GIFs!)
    if (file.type !== 'image/gif' && file.size > 2 * 1024 * 1024) {
      fileToUpload = await comprimirImagem(file, 1920, 0.8);
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
    
    if (!response.ok) throw new Error('Erro na conexão com o ImgBB');
    
    const data = await response.json();
    
    if (data.success) {
      return {
        success: true,
        url: data.data.url,
        deleteUrl: data.data.delete_url,
        thumb: data.data.thumb?.url || data.data.url,
        display: data.data.display_url || data.data.url
      };
    } else {
      throw new Error(data.error?.message || 'Erro ao fazer upload');
    }
    
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    return { success: false, error: error.message };
  }
}

function mostrarPreview(file) {
  const postArea = document.querySelector('.post-area');
  if (!postArea) return;
  
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
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
      }
    });
  }
  
  // Ao clicar no botão, abre diretamente o seletor de arquivos
  fileBtn.addEventListener('click', () => {
    fileInput.click();
  });
}


// ===================
// MODAL DE COMENTÁRIOS COM DRAG E CLICK FORA
// ===================
async function abrirModalComentarios(postId, creatorId) {
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
      fecharModalComentarios();
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
      fecharModalComentarios();
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
  
const btnComment = document.querySelector(`.btn-comment[data-id="${postId}"]`);
if (btnComment) {
  const total = await contarComentarios(postId);
  const span = btnComment.querySelector('span');
  if (span) span.textContent = total;
}
  
  // Listener para o botão de envio
  modal.querySelector('.comment-submit-mobile').addEventListener('click', async (e) => {
    e.preventDefault();
    const input = modal.querySelector('.comment-input-mobile');
    const conteudo = input.value.trim();
    if (conteudo) {
      const sucesso = await adicionarComentario(creatorId, postId, conteudo);
      if (sucesso) {
        triggerNovoComentario(postId, creatorId).catch(console.warn);
        input.value = '';
        invalidarCacheComentarios(postId); // força rebusca no Firestore
        await renderizarComentarios(creatorId, postId, commentsList);
        // Atualiza contador no botão do feed
        const btnCommentFeed = document.querySelector(`.btn-comment[data-id="${postId}"]`);
        if (btnCommentFeed) {
          const total = await contarComentarios(postId);
          const spanCount = btnCommentFeed.querySelector('span');
          if (spanCount) spanCount.textContent = total;
        }
      }
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
          triggerNovoComentario(postId, creatorId).catch(console.warn);
          input.value = '';
          invalidarCacheComentarios(postId);
          await renderizarComentarios(creatorId, postId, commentsList);
          const btnCommentFeed = document.querySelector(`.btn-comment[data-id="${postId}"]`);
          if (btnCommentFeed) {
            const total = await contarComentarios(postId);
            const spanCount = btnCommentFeed.querySelector('span');
            if (spanCount) spanCount.textContent = total;
          }
        }
      }
    }
  });
}

function fecharModalComentarios() {
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
window.fecharModalComentarios = fecharModalComentarios;

let currentMenuPost = null;

function abrirMenuBottom(postId, ownerId, postElement = null) {
  const menuLayer = document.querySelector('.menu-bottom-layer');
  const user = auth.currentUser;

  if (!menuLayer || !user) return;

  currentMenuPost = { postId, ownerId, postElement };

  const ehMeuPost = user.uid === ownerId;

  menuLayer.querySelectorAll('.menu-bottom-btn').forEach(btn => {
    const action = btn.dataset.action;

    if (action === 'delete') {
      btn.style.display = ehMeuPost ? 'block' : 'none';
    } else if (action === 'report') {
      btn.style.display = ehMeuPost ? 'none' : 'block';
    } else {
      btn.style.display = 'block';
    }
  });

  menuLayer.classList.add('active');
  document.body.classList.add('menu-bottom-open');
}

function fecharMenuBottom() {
  const menuLayer = document.querySelector('.menu-bottom-layer');
  if (!menuLayer) return;

  menuLayer.classList.add('closing');

  setTimeout(() => {
    menuLayer.classList.remove('active', 'closing');
    document.body.classList.remove('menu-bottom-open');
    currentMenuPost = null;
  }, 300);
}

function configurarListenersMenuBottom() {
  const menuLayer = document.querySelector('.menu-bottom-layer');
  if (!menuLayer) return;

  // Clique fora
  menuLayer.addEventListener('click', (e) => {
    if (e.target === menuLayer) fecharMenuBottom();
  });

  // Ações
  menuLayer.addEventListener('click', async (e) => {
    const btn = e.target.closest('.menu-bottom-btn');
    if (!btn || !currentMenuPost) return;

    const action = btn.dataset.action;

    const { postId, ownerId, postElement } = currentMenuPost;

    if (action === 'cancel') {
      fecharMenuBottom();
      return;
    }

    if (action === 'delete') {
      fecharMenuBottom();
      handleDeletarPost(postId, ownerId, postElement);
    }

    if (action === 'report') {
      fecharMenuBottom();
      await handleDenunciarPost(postId, ownerId);
    }

    if (action === 'archive') {
      fecharMenuBottom();
    }
  });
}

// =====================
// DELETE CORRIGIDO
// =====================

async function handleDeletarPost(postId, ownerId, postElement) {
  if (!postId) return;

  const user = auth.currentUser;
  if (!user || user.uid !== ownerId) return;

  try {
    const el = postElement || document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (el) {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      el.style.opacity = '0';
      el.style.transform = 'translateY(-16px)';
      setTimeout(() => el.remove(), 300);
    }

    limparCacheFeed();

    await Promise.all([
      deleteDoc(doc(db, "posts", postId)),
      deleteDoc(doc(db, "users", ownerId, "posts", postId))
    ]);

  } catch (err) {
    console.error("Erro ao apagar post:", err);
  }
}

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
      const btnMore = e.target.closest(".more-options-button");
      const commentSubmit = e.target.closest('.comment-submit');

      // CURTIR POST
      if (btnLike) {
        const uid = auth.currentUser?.uid;
        const postId = btnLike.dataset.id;
        if (uid && postId) {
          await toggleLikePost(uid, postId, btnLike);
        } else {
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
        abrirModalComentarios(postId, uid);
      }

      // 👤 LINK PARA PERFIL
const userInfo = e.target.closest('.user-info');
      if (userInfo && !e.target.closest('.more-options-button')) {
        const userNameLink = userInfo.querySelector('.user-name-link');
        if (userNameLink) {
          const uid = userNameLink.dataset.username;
          if (uid) {
            window.location.href = `profile.html?userid=${encodeURIComponent(uid)}`;
          }
        }
        return;
      }

      // ⋮ MENU 3 PONTINHOS
      if (btnMore) {
        const postCard = btnMore.closest(".post-card");
        const postId = postCard.querySelector('.btn-like')?.dataset.id;
        const ownerId = postCard.querySelector('.btn-like')?.dataset.username;
        if (postId && ownerId) {
          abrirMenuBottom(postId, ownerId, postCard);
        }
      }

      
      // ✉️ ENVIAR COMENTÁRIO VIA BOTÃO (fallback inline - raramente usado)
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
      window.location.href = `profile.html?userid=${encodeURIComponent(uid)}`;
    }
  }
});


// ===================
// ATUALIZAR DATAS AUTOMATICAMENTE
// ===================
function atualizarDatasAutomaticamente() {
  setInterval(() => {
    // Atualiza datas relativas no feed (.post-date-mobile)
    document.querySelectorAll('.post-date-mobile').forEach(dateElement => {
      const postCard = dateElement.closest('.post-card');
      if (postCard) {
        const likeBtn = postCard.querySelector('.btn-like');
        if (likeBtn) {
          const postId = likeBtn.dataset.id;
          const item = allItems.find(i => i.postid === postId || i.bubbleid === postId);
          if (item && item.create) {
            dateElement.textContent = formatarDataRelativa(item.create);
          }
        }
      }
    });
  }, 60000);
}


// ===================
// SISTEMA DE TIPOS DE POST
// ===================
let currentPostType = 'post';
let postImageFile = null;

function inicializarSistemaTipoPost() {
  // Contador de caracteres (igual ao original)
  document.querySelectorAll('.np-text-input').forEach(textarea => {
    textarea.addEventListener('input', (e) => {
      const counter = e.target.parentElement.querySelector('.char-counter');
      if (counter) {
        const max     = parseInt(textarea.getAttribute('maxlength'));
        const current = e.target.value.length;
        counter.textContent = `${current}/${max}`;
        counter.classList.toggle('limit', current >= max * 0.9);
      }
    });
  });

  // Upload de imagem POST (igual ao original)
  const postFileArea = document.getElementById('post-file-input');
  if (postFileArea) {
    postFileArea.addEventListener('click', () => {
      const input   = document.createElement('input');
      input.type    = 'file';
      input.accept  = 'image/*';
      input.onchange = (e) => handlePostImageUpload(e.target.files[0]);
      input.click();
    });
  }

  // Remover imagem POST (igual ao original)
  document.querySelector('.remove-image-post')?.addEventListener('click', () => {
    postImageFile = null;
    const preview = document.querySelector('.image-preview-post');
    if (preview) preview.style.display = 'none';
  });

  // -------------------------------------------------------
  // BOTÃO "POST" — envia texto + imagem
  // -------------------------------------------------------
  document.getElementById('btn-post')?.addEventListener('click', async () => {
    const user  = auth.currentUser;
    const texto = document.querySelector('.np-text-input').value.trim();
    await enviarPost(user, texto, postImageFile);
  });

  // -------------------------------------------------------
  // BOTÃO "NOTA" — envia só texto, ignora imagem
  // -------------------------------------------------------
  document.getElementById('btn-bubble')?.addEventListener('click', async () => {
    const user  = auth.currentUser;
    const texto = document.querySelector('.np-text-input').value.trim();
    await enviarBubble(user, texto);
  });
}

function handlePostImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
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

  postImageFile  = null;

  const previewPost  = document.querySelector('.image-preview-post');
  if (previewPost)  previewPost.style.display  = 'none';

  const postFileArea = document.getElementById('post-file-input');
  if (postFileArea) postFileArea.style.display = '';
}

async function enviarPublicacao() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    return;
  }

  const activeContent = document.querySelector('.post-content-type.active');
  const textarea = activeContent.querySelector('.np-text-input');
  const texto = textarea ? textarea.value.trim() : '';

  if (currentPostType === 'post') {
    await enviarPost(usuarioLogado, texto, postImageFile);
  } else if (currentPostType === 'bubble') {
    await enviarBubble(usuarioLogado, texto);
  }
}

async function enviarPost(user, texto, imageFile) {
  if (!texto && !imageFile) {
    alert('Escreva algo ou adicione uma imagem!');
    return;
  }
 
  // Fecha o modal na hora
  const postLayer = document.getElementById('postLayer');
  if (postLayer) postLayer.classList.remove('active');
  document.body.style.overflow = '';
  limparInputsPost();
 
  // Inicia barra em 0%
  const bar = criarBarraPost();
  avancarBarra(bar, 10); // começa com 10% imediatamente
 
  try {
    const postId = gerarIdUnico('post');
    let urlImagem = '';
    let deleteUrlImagem = '';
 
    if (imageFile) {
      avancarBarra(bar, 30); // 30% — iniciando upload
      const uploadResult = await uploadImagemPost(imageFile, user.uid);
      if (!uploadResult.success) {
        removerBarra(bar);
        alert('Erro no upload: ' + uploadResult.error);
        return;
      }
      urlImagem       = uploadResult.url;
      deleteUrlImagem = uploadResult.deleteUrl;
      avancarBarra(bar, 70); // 70% — upload concluído
    } else {
      avancarBarra(bar, 60); // sem imagem, vai direto pra 60%
    }
 
    const postData = {
      content:      texto,
      img:          urlImagem,
      imgDeleteUrl: deleteUrlImagem,
      likes:        0,
      saves:        0,
      comentarios:  0,
      postid:       postId,
      creatorid:    user.uid,
      reports:      0,
      visible:      true,
      create:       serverTimestamp()
    };
 
    avancarBarra(bar, 85); // 85% — salvando
    await setDoc(doc(db, 'posts', postId), postData);
    await setDoc(doc(db, 'users', user.uid, 'posts', postId), postData);
 
    // ✅ ATIVIDADE — novo post
    triggerNovoPost(postId).catch(console.warn);
 
    avancarBarra(bar, 100); // 100% — salvo!
    setTimeout(() => removerBarra(bar), 400);
 
    feed.innerHTML   = '';
    lastPostSnapshot = null;
    hasMorePosts     = true;
    loading          = false;
    limparCacheFeed();
    await loadPosts();
 
  } catch (error) {
    console.error('Erro ao enviar post:', error);
    removerBarra(bar);
    alert('Erro ao enviar post: ' + error.message);
  }
}

async function enviarBubble(user, texto) {
  if (!texto) {
    alert('Escreva algo para a nota!');
    return;
  }
 
  // Fecha o modal na hora
  const postLayer = document.getElementById('postLayer');
  if (postLayer) postLayer.classList.remove('active');
  document.body.style.overflow = '';
  limparInputsPost();
 
  // Inicia barra em 0%
  const bar = criarBarraPost();
  avancarBarra(bar, 20);
 
  try {
    const bubbleId = gerarIdUnico('bubble');
 
    avancarBarra(bar, 60); // salvando
    await setDoc(doc(db, 'bubbles', bubbleId), {
      content:   texto,
      bubbleid:  bubbleId,
      creatorid: user.uid,
      create:    serverTimestamp(),
      musicUrl:  ''
    });
 

    triggerNovoBubble(bubbleId).catch(console.warn);
 
    avancarBarra(bar, 100); // pronto
    setTimeout(() => removerBarra(bar), 400);
 
    feed.innerHTML   = '';
    lastPostSnapshot = null;
    hasMorePosts     = true;
    loading          = false;
    limparCacheFeed();
    await loadPosts();
 
  } catch (error) {
    console.error('Erro ao enviar nota:', error);
    removerBarra(bar);
    alert('Erro ao enviar nota: ' + error.message);
  }
}

// ===================
// BARRA DE PROGRESSO DO POST (0% → 100%)
// ===================
function criarBarraPost() {
  // injeta o CSS uma única vez
  if (!document.getElementById('plb-style')) {
    const s = document.createElement('style');
    s.id = 'plb-style';
    s.textContent = `
      #post-loading-bar {
        position: fixed;
        bottom: 80px;
        left: 0;
        width: 100%;
        height: 3px;
        background: var(--bg-primary);
        z-index: 99997;
      }
      #post-loading-bar .plb-inner {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, #4A90E2, #4A90E2);
        transition: width 0.4s ease;
      }
    `;
    document.head.appendChild(s);
  }

  // remove barra antiga se existir
  document.getElementById('post-loading-bar')?.remove();

  const bar = document.createElement('div');
  bar.id = 'post-loading-bar';
  bar.innerHTML = '<div class="plb-inner"></div>';
  document.body.appendChild(bar);
  return bar;
}

function avancarBarra(bar, porcentagem) {
  const inner = bar?.querySelector('.plb-inner');
  if (inner) inner.style.width = porcentagem + '%';
}

function removerBarra(bar) {
  if (bar) {
    avancarBarra(bar, 100);
    setTimeout(() => bar.remove(), 400);
  }
}

// ===================
// INICIALIZAÇÃO
// ===================

window.addEventListener("DOMContentLoaded", async () => {
  feed       = document.getElementById('feed');
  loadMoreBtn = document.getElementById('load-more-btn');
  postInput  = document.querySelector('.post-box input[type="text"]');
  postButton = document.querySelector('.post-button');

  carregarFotoPerfil(null);

  const user = await verificarLogin();
  if (!user) {
    console.error('❌ Usuário não autenticado');
    return;
  }

  carregarFotoPerfil(user);
  criarInputImagem();
  await atualizarGreeting(user);
  configurarPostLayer();
  inicializarSistemaTipoPost();
  configurarEventListeners();
  configurarListenersMenuBottom();
  configurarScrollInfinito();
  await loadPosts();
  atualizarDatasAutomaticamente();
});




// ==============================
// CLEANUP QUANDO PÁGINA É DEIXADA
// ==============================
window.addEventListener('beforeunload', () => {
  pararSincronizacaoBackground();
});

window.addEventListener('pagehide', () => {
  pararSincronizacaoBackground();
});


function carregarFotoPerfil(user) {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = './src/img/default.jpg';

  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto && navPic) {
    navPic.src = cachedPhoto;
  }

  if (!user) {
    if (navPic) navPic.src = defaultPic;
    localStorage.removeItem('user_photo_cache');
    return;
  }

  const userId = user.uid;
  (async () => {
    try {
      const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
      const userMediaSnap = await getDoc(userMediaRef);

      if (userMediaSnap.exists()) {
        const userPhoto = userMediaSnap.data().userphoto || defaultPic;

        if (userPhoto !== cachedPhoto && navPic) {
          navPic.src = userPhoto;
          localStorage.setItem('user_photo_cache', userPhoto);
        }
      } else {
        if (navPic) navPic.src = defaultPic;
        localStorage.removeItem('user_photo_cache');
      }
    } catch (error) {
      console.error('Erro ao buscar foto:', error);
      if (!cachedPhoto && navPic) navPic.src = defaultPic;
    }
  })();
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await registerPushNotifications(user.uid); 
      listenForegroundMessages();
    } catch(e) {
      console.warn("[FCM] Falha ao registrar notificações:", e);
    }
  }
});
