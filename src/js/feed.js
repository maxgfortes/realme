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

// Configuração do Firebase
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


const feed = document.getElementById('feed');
const loadMoreBtn = document.getElementById('load-more-btn');
const postInput = document.querySelector('.post-box input[type="text"]');
const postButton = document.querySelector('.post-button');


// ConfiguraÃ§Ãµes
const POSTS_LIMIT = 10;
let loading = false;
let hasMorePosts = true;

// Lista de domÃ­nios maliciosos conhecidos
const DOMINIOS_MALICIOSOS = [
  'bit.ly', 'tinyurl.com', 'goo.gl', 'ow.ly', 't.co',
  'phishing-example.com', 'malware-site.net', 'scam-website.org'
];

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
      // Buscar apenas os 5 posts mais recentes para verificar se há novidades
      const q = query(
        collection(db, 'posts'),
        orderBy('create', 'desc'),
        limit(5)
      );
      
      const snapshot = await getDocs(q);
      const postsRecentes = snapshot.docs.map(doc => ({
        ...doc.data(),
        postid: doc.id,
        tipo: 'post'
      }));
      
      // Comparar com cache e atualizar se houver mudanças
      const cacheAtual = getPostsCache() || [];
      const postsNoCache = cacheAtual.filter(p => p.tipo === 'post');
      
      if (postsRecentes.length > 0 && postsNoCache.length > 0) {
        const novoPostId = postsRecentes[0].postid;
        const ultimoPostEmCacheId = postsNoCache[0].postid;
        
        if (novoPostId !== ultimoPostEmCacheId) {
          // Buscar todos os posts novos e atualizar cache
          const todosOsPostsQuery = query(
            collection(db, 'posts'),
            orderBy('create', 'desc'),
            limit(CACHE_CONFIG.MAX_CACHED_POSTS)
          );
          
          const todosCacheSnapshot = await getDocs(todosOsPostsQuery);
          const todosOsPosts = todosCacheSnapshot.docs.map(doc => ({
            ...doc.data(),
            postid: doc.id,
            tipo: 'post'
          }));
          
          setPostsCache(todosOsPosts);
        }
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
// VERIFICAR LOGIN COM AUTH
// ===================
function verificarLogin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
        resolve(null);
      } else {
        resolve(user);
      }
      // NÃO chamar loadPosts() aqui - deixar para DOMContentLoaded
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
      username: userData.username || '',
      displayname: userData.displayname || '',
      name: userData.name || '',  // 🆕 Adiciona campo name para fallback
      verified: userData.verified || false
    };
    

    
    return resultado;
  } catch (error) {
    console.error("❌ Erro ao buscar dados do usuário:", error);
    return null;
  }
}


function configurarScrollInfinito() {
  // Detecta scroll em qualquer elemento da página
  document.addEventListener('scroll', async (e) => {
    let scrollTop, windowHeight, documentHeight;
    const target = e.target;
    
    // Para document/window/body
    if (target === document || target === document.documentElement || target === document.body) {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      windowHeight = window.innerHeight;
      documentHeight = document.documentElement.scrollHeight;
    } 
    // Para qualquer elemento com scroll (como welcome-container)
    else if (target.scrollHeight > target.clientHeight) {
      scrollTop = target.scrollTop;
      windowHeight = target.clientHeight;
      documentHeight = target.scrollHeight;
    } else {
      return; // Não tem scroll, ignora
    }

    // Definir uma margem para carregar antes de chegar ao fim
    const threshold = 300;

    if (scrollTop + windowHeight >= documentHeight - threshold) {
      
      // Verifica qual DIV de feed está visível no momento
      const divFirebase = document.getElementById('feed');
      const divMastodon = document.getElementById('feed2');

      // Lógica para o Feed do Firebase (ID: feed)
      if (divFirebase && window.getComputedStyle(divFirebase).display !== 'none') {
        if (!loading && hasMorePosts) {
          await loadPosts();
        }
      }

      // Lógica para o Feed do Mastodon (ID: feed2)
      if (divMastodon && window.getComputedStyle(divMastodon).display !== 'none') {
        if (!loadingMastodon) {
          await carregarFeedMastodon(true); 
        }
      }
    }
  }, true); // true = captura eventos de scroll de todos os elementos
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
    container.innerHTML = '<p class="no-comments">Nenhum comentario ainda.</p>';
    return;
  }
  comentarios.forEach(comentario => {
    const nomeParaExibir = comentario.userData?.displayname || comentario.userData?.username || comentario.senderid;
    const usernameParaExibir = comentario.userData?.username ? `${comentario.userData.username}` : '';
    const fotoUsuario = comentario.userData?.userphoto || obterFotoPerfil(comentario.userData, null);
    const conteudoFormatado = formatarHashtags(comentario.content);
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
        <img src="./src/img/default.jpg" alt="Avatar do usuário" class="avatar"
             onerror="this.src='./src/img/default.jpg'" />
        <div class="user-meta-bubble">
          <strong class="user-name-link" data-username="${bubbleData.creatorid}"></strong>
          <small class="bullet">•</small>
          <small class="post-date-bubble">${formatarDataRelativa(bubbleData.create)}</small>
        </div>
      </div>
    </div>
    <div class="bubble-content">
      <div class="bubble-text">
        <p>${formatarHashtags(bubbleData.content || '')}</p>
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
  
  // Buscar dados do usuário via cache
  buscarUsuarioCached(bubbleData.creatorid).then(userData => {
    if (userData) {
      const avatar = bubbleEl.querySelector('.avatar');
      const nome = bubbleEl.querySelector('.user-name-link');
      
      if (avatar) avatar.src = userData.userphoto || './src/img/default.jpg';
      if (nome) {
        nome.textContent = userData.username || bubbleData.creatorid;
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
        <div class="more-options">
          <button class="more-options-button">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
      </div>
    </div>
    <div class="post-content">
      <div class="post-text">${formatarHashtags(postData.content || '')}</div>
      ${
        (postData.img && postData.img.trim() !== "")
          ? `
            <div class="post-image">
              <img src="${postData.img}" loading="lazy" decoding="async" onclick="abrirModalImagem('${postData.img}')" style="width:100%;height:auto;display:block;">
            </div>
          `
          : (postData.urlVideo && postData.urlVideo.trim() !== "")
          ? `
            <div class="post-video">
              <video src="${postData.urlVideo}"
                     muted
                     playsinline
                     controls
                     preload="metadata"></video>
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
        <p class="post-liked-by"><strong class="liked-by-username"></strong></p>
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
        footer.style.display = "flex";
        footer.style.alignItems = "center";
        footer.style.gap = "8px";

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

        // Monta o texto
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

        footer.innerHTML = fotosHTML + textoHTML;
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
        nome.textContent = userData.username || postData.creatorid;
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

async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;
  
  // ESTRATÉGIA CACHE-FIRST: Render desde cache primero
  const isFirstLoad = !feed || feed.children.length === 0;
  
  if (isFirstLoad) {
      
    // Tentar carregar do cache imediatamente
    const postsEmCache = getPostsCache();
    const bubblesEmCache = getBubblesCache();
    
    if (postsEmCache || bubblesEmCache) {
          
      allItems = [];
      
      if (bubblesEmCache) {
        bubblesEmCache.forEach(bubble => {
          allItems.push(bubble);
        });
      }
      
      if (postsEmCache) {
        postsEmCache.forEach(post => {
          allItems.push(post);
        });
      }
      
      // Ordenar itens
      allItems.sort((a, b) => {
        let dataA = a.create;
        let dataB = b.create;
        if (typeof dataA === 'object' && dataA.seconds) dataA = dataA.seconds;
        else dataA = new Date(dataA).getTime() / 1000;
        if (typeof dataB === 'object' && dataB.seconds) dataB = dataB.seconds;
        else dataB = new Date(dataB).getTime() / 1000;
        return dataB - dataA;
      });
      
      // Renderizar do cache imediatamente
      for (const item of allItems) {
        if (item.tipo === 'bubble') {
          renderizarBubble(item, feed);
        } else {
          renderPost(item, feed);
        }
      }
        } else {
      // NÃO há cache - feed fica vazio enquanto carrega
    }
  }
  
  // Indicador de carregamento para scroll infinito (só mostra após primeira carga)
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
    loadMoreBtn.textContent = isFirstLoad ? "Carregando..." : "Carregando mais...";
  }

  try {
      
    // PRIMEIRA CARGA: carrega bubbles do servidor
    if (!lastPostSnapshot) {
      const bubbles = await carregarBubbles();
          
      // Salvar bubbles em cache
      setBubblesCache(bubbles);
      
      // Se não foi primeira carga via cache, adicionar bubbles
      if (isFirstLoad && (!getBubblesCache() || allItems.length === 0)) {
        bubbles.forEach(bubble => {
          allItems.push(bubble);
        });
      }
    }

    // Busca lote de posts ordenados por data
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
      if (loadingIndicator) loadingIndicator.remove();
      loading = false;
      return;
    }

    lastPostSnapshot = postsSnapshot.docs[postsSnapshot.docs.length - 1];

    // Coleta posts do servidor
    const postsParaAdicionar = [];
    for (const postDoc of postsSnapshot.docs) {
      const postData = postDoc.data();
      postsParaAdicionar.push({
        ...postData,
        postid: postDoc.id
      });
    }

    // Ordenar por segurança
    postsParaAdicionar.sort((a, b) => {
      let dataA = a.create;
      let dataB = b.create;
      if (typeof dataA === 'object' && dataA.seconds) dataA = dataA.seconds;
      else dataA = new Date(dataA).getTime() / 1000;
      if (typeof dataB === 'object' && dataB.seconds) dataB = dataB.seconds;
      else dataB = new Date(dataB).getTime() / 1000;
      return dataB - dataA;
    });

    // PRIMEIRA CARGA: renderiza tudo
    if (isFirstLoad) {
          
      // Limpar allItems e recarregar com dados do servidor
      allItems = [];

      // Reusar bubbles já carregados (evita segunda query ao Firestore)
      const bubblesAtuais = await carregarBubbles();
      setBubblesCache(bubblesAtuais);
      bubblesAtuais.forEach(bubble => allItems.push(bubble));
      
      // Salvar todos os posts em cache
      postsParaAdicionar.forEach(post => {
        allItems.push({ ...post, tipo: 'post' });
      });
      setPostsCache(postsParaAdicionar);
      
      // Ordenar final
      allItems.sort((a, b) => {
        let dataA = a.create;
        let dataB = b.create;
        if (typeof dataA === 'object' && dataA.seconds) dataA = dataA.seconds;
        else dataA = new Date(dataA).getTime() / 1000;
        if (typeof dataB === 'object' && dataB.seconds) dataB = dataB.seconds;
        else dataB = new Date(dataB).getTime() / 1000;
        return dataB - dataA;
      });
      
      // Limpar feed e renderizar de novo (garante dados atualizados)
      feed.innerHTML = '';
      
      for (const item of allItems) {
        if (item.tipo === 'bubble') {
          renderizarBubble(item, feed);
        } else {
          renderPost(item, feed);
        }
      }
          
      // Configurar auto-pause e limites de vídeo após renderização completa
      configurarAutoPauseVideos();
      configurarLimiteRepeticoes();
      
      // Iniciar sincronização em background
      iniciarSincronizacaoBackground();
    } 
    // SCROLL INFINITO: adiciona apenas os novos posts
    else {
          
      // Salvar novos posts em cache (append)
      const cacheAtual = getPostsCache() || [];
      const postsComCache = [...cacheAtual, ...postsParaAdicionar];
      setPostsCache(postsComCache);
      
      for (const post of postsParaAdicionar) {
        renderPost(post, feed);
      }
      // Re-registrar vídeos novos no IntersectionObserver
      configurarAutoPauseVideos();
      configurarLimiteRepeticoes();
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
    
    if (loadingIndicator) loadingIndicator.remove();
    } catch (error) {
    console.error("❌ Erro ao carregar posts:", error);
    if (loadMoreBtn) {
      loadMoreBtn.textContent = "Erro ao carregar";
    }
    const loadingIndicator = document.getElementById('scroll-loading-indicator');
    if (loadingIndicator) loadingIndicator.remove();
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
      urlVideo: '',
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
    footer.style.display = "none";
    return;
  }

  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "8px";

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

  // Monta o texto
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

  footer.innerHTML = fotosHTML + textoHTML;
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

//Saudação

async function atualizarGreeting() {
  const user = auth.currentUser;
  if (!user) return;

  const uid = user.uid;

  // Cache
  const cacheKey = `user_cache_${uid}`;
  const photoKey = `user_photo_${uid}`;

  let userData = getCache(cacheKey);
  const cachedPhoto = getCache(photoKey);

  if (!userData) {
    userData = { displayname: '', userphoto: cachedPhoto || null };
  }

  // Saudação
  const saudacao = getSaudacao();

  // Nome
  const nome = getNome(userData);

  updateUI({ saudacao, nome, userData, user, cachedPhoto });

  // Atualização em background
  if (!userData.displayname) {
    atualizarDados(uid, cacheKey, photoKey);
  }
}

// ==============================
// HELPERS
// ==============================

function getSaudacao() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function getNome(data) {
  return data?.displayname || data?.name || data?.username || 'Usuário';
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

async function atualizarDados(uid, cacheKey, photoKey) {
  try {
    const dados = await buscarDadosUsuarioPorUid(uid);
    if (!dados) return;

    setCache(cacheKey, dados);

    if (dados.userphoto) {
      setCache(photoKey, dados.userphoto);
    }

    const usernameEl = document.getElementById('username');
    if (usernameEl) usernameEl.textContent = getNome(dados);

    const fotoEl = document.querySelector('.user-welcome img');
    if (fotoEl && dados.userphoto) {
      fotoEl.src = dados.userphoto;
    }

  } catch (e) {
    console.warn('Erro ao atualizar usuário:', e);
  }
}

// ===================
// CONFIGURAR LINKS
// ===================
function configurarLinks() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  const urlPerfil = `profile.html?userid=${encodeURIComponent(usuarioLogado.uid)}`;
  const linkSidebar = document.getElementById('linkPerfilSidebar');
  const linkMobile = document.getElementById('linkPerfilMobile');
  if (linkSidebar) linkSidebar.href = urlPerfil;
  if (linkMobile) linkMobile.href = urlPerfil;
  const btnsSair = document.querySelectorAll('#btnSair');
  btnsSair.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.signOut().then(() => {
        window.location.href = 'index.html';
      });
    });
  });
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
  const topBtn = document.querySelector('.navbar-top .top-btn');
  if (topBtn) topBtn.addEventListener('click', () => abrirLayer('post'));

  // Botão "Como foi o seu dia?" / "Criar post"
  const npBtn = document.getElementById('openPostLayer');
  if (npBtn) npBtn.addEventListener('click', () => abrirLayer('post'));

  // Input de texto antigo (.post-box input) — clicar também abre
  const postBoxInput = document.querySelector('.post-box input');
  if (postBoxInput) {
    postBoxInput.addEventListener('focus', () => {
      postBoxInput.blur();
      abrirLayer('post');
    });
  }

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
let storyImageFile = null;

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

function handleStoryImageUpload(file) {
  if (!file || !file.type.startsWith('image/')) {
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

  postImageFile  = null;
  storyImageFile = null;

  const previewPost  = document.querySelector('.image-preview-post');
  const previewStory = document.querySelector('.image-preview-story');
  if (previewPost)  previewPost.style.display  = 'none';
  if (previewStory) previewStory.style.display = 'none';

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
  } else if (currentPostType === 'story') {
    await enviarStory(usuarioLogado, storyImageFile);
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
      urlVideo:     '',
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
 
    // ✅ ATIVIDADE — novo bubble
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
  const user = await verificarLogin();
  if (!user) {
    console.error('❌ Usuário não autenticado');
    return;
  }
  criarInputImagem();
  criarInputVideo();
  await atualizarGreeting();
  configurarLinks();
  configurarPostLayer();
  inicializarSistemaTipoPost();
  configurarEventListeners();
  configurarListenersMenuBottom();
  configurarScrollInfinito();
  await loadPosts();
  atualizarDatasAutomaticamente();
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

// ==============================
// CLEANUP QUANDO PÁGINA É DEIXADA
// ==============================
window.addEventListener('beforeunload', () => {
  pararSincronizacaoBackground();
});

window.addEventListener('pagehide', () => {
  pararSincronizacaoBackground();
});


function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = './src/icon/default.jpg';

  // Carregamento imediato do cache
  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto) {
    navPic.src = cachedPhoto;
  }

  // Validação em segundo plano
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userId = user.uid;
      try {
        const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
        const userMediaSnap = await getDoc(userMediaRef);

        if (userMediaSnap.exists()) {
          const userPhoto = userMediaSnap.data().userphoto || defaultPic;

          if (userPhoto !== cachedPhoto) {
            navPic.src = userPhoto;
            localStorage.setItem('user_photo_cache', userPhoto);
          }
        } else {
          navPic.src = defaultPic;
          localStorage.removeItem('user_photo_cache');
        }
      } catch (error) {
        console.error('Erro ao buscar foto:', error);
        if (!cachedPhoto) navPic.src = defaultPic;
      }
    } else {
      navPic.src = defaultPic;
      localStorage.removeItem('user_photo_cache');
    }
  
  });
}

document.addEventListener('DOMContentLoaded', carregarFotoPerfil);




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