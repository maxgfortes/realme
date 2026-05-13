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

import { registerPushNotifications, listenForegroundMessages } from "../../services/notifications-push.js";
import { triggerNovoPost, triggerNovoComentario } from '../../components/activitie-creator.js';

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
const CACHE_CONFIG = {
  POSTS_TTL: 8 * 60 * 1000,
  USERS_TTL: 20 * 60 * 1000,
  CHECK_UPDATE_INTERVAL: 2 * 60 * 1000,
  MAX_CACHED_POSTS: 100
};

let loading = false;
let hasMorePosts = true;
let lastPostSnapshot = null;
let allItems = [];
let cacheCheckTimer = null;

let feed = null;
let loadMoreBtn = null;
let postInput = null;
let postButton = null;

// ============================================================
// CACHE DO FEED
// ============================================================

function getPostsCache() {
  try {
    const cached = localStorage.getItem('feed_posts_cache');
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
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

function setPostsCache(posts) {
  try {
    const postsParaCache = posts.slice(0, CACHE_CONFIG.MAX_CACHED_POSTS);
    
    localStorage.setItem('feed_posts_cache', JSON.stringify({
      timestamp: Date.now(),
      posts: postsParaCache
    }));
    } catch (e) {
    console.warn('Erro ao salvar cache de posts:', e);
  }
}

function limparCacheFeed() {
  try {
    localStorage.removeItem('feed_posts_cache');
  } catch (e) {
    console.warn('Erro ao limpar cache:', e);
  }
}

function iniciarSincronizacaoBackground() {
  if (cacheCheckTimer) clearInterval(cacheCheckTimer);
  
  cacheCheckTimer = setInterval(async () => {
    try {
      const usuarioLogado = auth.currentUser;
      if (!usuarioLogado) return;

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

      if (ultimoEmCache && postMaisRecente.id !== ultimoEmCache.postid) {
        limparCacheFeed();
      }
    } catch (e) {
      console.warn('Erro ao sincronizar background:', e);
    }
  }, CACHE_CONFIG.CHECK_UPDATE_INTERVAL);
}

function pararSincronizacaoBackground() {
  if (cacheCheckTimer) {
    clearInterval(cacheCheckTimer);
    cacheCheckTimer = null;
  }
}


// ============================================================
// FORMATAÇÃO DE TEXTO
// ============================================================

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


// ============================================================
// AUTH
// ============================================================

function verificarLogin() {
  return new Promise((resolve) => {
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

// ============================================================
// UTILITÁRIOS
// ============================================================

function gerarIdUnico(prefixo = 'id') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000);
  return `${prefixo}-${timestamp}${random}`;
}

async function buscarDadosUsuarioPorUid(uid) {
  try {
    const userRef = doc(db, "users", uid);
    const docSnap = await getDoc(userRef);
    if (!docSnap.exists()) {
      return null;
    }
    const userData = docSnap.data();

    let extraData = {};

    let userphoto = '';
    try {
      const photoRef = doc(db, "users", uid, "user-infos", "user-media");
      const photoSnap = await getDoc(photoRef);
      if (photoSnap.exists()) {
        userphoto = photoSnap.data().userphoto || '';
      }
    } catch (e) {
    }

    const resultado = {
      userphoto,
      username: userData.username || extraData.username || '',
      displayname: userData.displayname || extraData.displayname || '',
      name: userData.name || extraData.name || '',
      surname: userData.surname || extraData.surname || '',
      verified: userData.verified || extraData.verified || false
    };

    const fullname = `${resultado.name} ${resultado.surname}`.trim();
    resultado.fullname = fullname;

    return resultado;
  } catch (error) {
    return null;
  }
}

// ============================================================
// SCROLL INFINITO
// ============================================================

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

// ============================================================
// CACHE DE COMENTÁRIOS
// ============================================================

const COMENTARIOS_CACHE_TTL = 8 * 60 * 1000; 
const COMENTARIOS_CACHE_PREFIX = 'coments_cache_';
const COMENTARIOS_CACHE_MAX_POSTS = 30;

function _coments_getKey(postId) {
  return COMENTARIOS_CACHE_PREFIX + postId;
}

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

function setComentariosCache(postId, comentarios) {
  try {
    const serializados = comentarios.map(c => ({
      ...c,
      create: (c.create && c.create.seconds) ? c.create.seconds * 1000 : c.create
    }));

    localStorage.setItem(_coments_getKey(postId), JSON.stringify({
      timestamp: Date.now(),
      comentarios: serializados
    }));

    _coments_limparExcesso();
  } catch (e) {
    console.warn('Erro ao salvar cache de comentários:', e);
  }
}

function invalidarCacheComentarios(postId) {
  try {
    localStorage.removeItem(_coments_getKey(postId));
  } catch {}
}

function _coments_limparExcesso() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(COMENTARIOS_CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length <= COMENTARIOS_CACHE_MAX_POSTS) return;

    const comTimestamp = keys.map(k => {
      try { return { k, t: JSON.parse(localStorage.getItem(k)).timestamp }; }
      catch { return { k, t: 0 }; }
    });
    comTimestamp.sort((a, b) => a.t - b.t);
    const excesso = comTimestamp.slice(0, comTimestamp.length - COMENTARIOS_CACHE_MAX_POSTS);
    excesso.forEach(({ k }) => localStorage.removeItem(k));
  } catch {}
}

// ============================================================
// COMENTÁRIOS
// ============================================================

async function carregarComentarios(postId) {
  try {
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

function renderListaComentarios(comentarios, container) {
  container.innerHTML = '';
  if (comentarios.length === 0) {
    container.innerHTML = '<div class="no-comments"><div class="no-comments-title">Ainda não há nenhum comentario</div><div class="no-comments-sub">Inicie a conversa</div></div>';
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
    renderListaComentarios(cached, container);
    if (comentariosCacheExpirado(postId)) {
      carregarComentarios(postId).then(novos => {
        setComentariosCache(postId, novos);
        renderListaComentarios(novos, container);
      }).catch(() => {});
    }
    return;
  }
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


async function adicionarComentario(uid, postId, conteudo) {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) return;
  try {
    const comentarioId = gerarIdUnico('comentid');
    const comentarioData = {
      content: conteudo,
      create: serverTimestamp(),
      senderid: usuarioLogado.uid,
      report: 0
    };
    const postComentRef = doc(db, 'posts', postId, 'coments', comentarioId);
    await setDoc(postComentRef, comentarioData);
    return true;
  } catch (error) {
    console.error("Erro ao adicionar comentario:", error);
    return false;
  }
}

// ============================================================
// DATA RELATIVA
// ============================================================

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



function buildPostMediaHTML(postData) {
  const imgs = Array.isArray(postData.imgs) && postData.imgs.length > 0
    ? postData.imgs
    : (postData.img && postData.img.trim() !== '' ? [postData.img] : []);
 
  if (imgs.length === 0) return '';
 
  if (imgs.length === 1) {
    return `
      <div class="post-image">
        <img src="${imgs[0]}" loading="lazy" decoding="async" style="width:100%;height:auto;display:block;">
      </div>
    `;
  }
 
  const slides = imgs.map(url => `
    <div class="post-carousel-slide">
      <img src="${url}" loading="lazy" decoding="async" alt="">
    </div>
  `).join('');
 
  const dots = imgs.map((_, i) => `
    <div class="post-carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></div>
  `).join('');
 
  return `
    <div class="post-carousel" data-total="${imgs.length}">
      <div class="post-carousel-track">
        ${slides}
      </div>
    </div>
    <div class="post-carousel-dots">
      ${dots}
    </div>
  `;
}
 
 
// ============================================================
// CARROSSEL
// ============================================================

function inicializarCarrossel(postEl) {
  const carousel = postEl.querySelector('.post-carousel');
  if (!carousel) return;
 
  const track  = carousel.querySelector('.post-carousel-track');
  const total  = parseInt(carousel.dataset.total, 10);
 
  const dotsContainer = postEl.querySelector('.post-carousel-dots');
  const dots = dotsContainer ? dotsContainer.querySelectorAll('.post-carousel-dot') : [];
 
  let current   = 0;
  let startX    = 0;
  let isDragging = false;
  let movedX    = 0;
 
  function goTo(index) {
    if (index < 0 || index >= total) return;
    current = index;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
  }
 
  carousel.addEventListener('touchstart', e => {
    startX    = e.touches[0].clientX;
    movedX    = 0;
    isDragging = true;
    track.style.transition = 'none';
  }, { passive: true });
 
  carousel.addEventListener('touchmove', e => {
    if (!isDragging) return;
    movedX = e.touches[0].clientX - startX;
    track.style.transform = `translateX(calc(-${current * 100}% + ${movedX}px))`;
  }, { passive: true });
 
  carousel.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    track.style.transition = '';
 
    const threshold = carousel.offsetWidth * 0.2;
    if (movedX < -threshold) {
      goTo(current + 1);
    } else if (movedX > threshold) {
      goTo(current - 1);
    } else {
      goTo(current);
    }
    movedX = 0;
  });
 
  carousel.addEventListener('mousedown', e => {
    startX     = e.clientX;
    movedX     = 0;
    isDragging = true;
    track.style.transition = 'none';
    e.preventDefault();
  });
 
  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    movedX = e.clientX - startX;
    track.style.transform = `translateX(calc(-${current * 100}% + ${movedX}px))`;
  });
 
  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    track.style.transition = '';
 
    const threshold = carousel.offsetWidth * 0.2;
    if (movedX < -threshold) {
      goTo(current + 1);
    } else if (movedX > threshold) {
      goTo(current - 1);
    } else {
      goTo(current);
    }
    movedX = 0;
  });
 
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      track.style.transition = '';
      goTo(parseInt(dot.dataset.index, 10));
    });
  });

carousel.addEventListener('dblclick', async (e) => {
  e.preventDefault();
  _animarCoracaoLike(carousel, e);
  const btnLike = postEl.querySelector('.btn-like');
  if (btnLike) btnLike.click();
});
}

// ============================================================
// RENDER POST
// ============================================================

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
      ${buildPostMediaHTML(postData)}
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
        </div>
      </div>
      <div class="post-footer-infos">
        <div class="post-footer-box" >
          <div class="post-footer-label">
            <svg class="liked-by-svg" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 456.549"><path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/></svg>
            <p class="post-liked-by" style="min-height:28px;visibility:hidden;"></p>
        ${postData._feedTipo === 'amigoDosAmigos' && postData._sugeridoPor
          ? `<p class="post-sugerido-por"><i class="fas fa-user-friends"></i> Sugerido por <strong>@${postData._sugeridoPor}</strong></p>`
          : ''}
          </div>
        </div>
      </div>
    </div>
  `;
  feed.appendChild(postEl);
  inicializarCarrossel(postEl);

  const usuarioLogado = auth.currentUser;

  if (usuarioLogado) {
    gerarTextoCurtidoPor(postData.postid, usuarioLogado.uid).then(info => {
      const footer = postEl.querySelector(".post-liked-by");

      if (!footer) return;

      if (info.total === 0) {
        footer.style.visibility = "hidden";
      } else {


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
        footer.innerHTML = textoHTML;
        footer.style.visibility = "visible";
      }
    });
  }

  buscarUsuarioCached(postData.creatorid).then(userData => {
    if (userData) {
      const avatar = postEl.querySelector('.avatar');
      const nome = postEl.querySelector('.user-name-link');
      const username = postEl.querySelector('.post-username');
      if (avatar) avatar.src = userData.userphoto || './src/img/default.jpg';
      if (nome) {
        nome.textContent = userData.username || userData.displayname || userData.name || '...';
        if (userData.verified) {
          nome.innerHTML = `${nome.textContent} <i class="fas fa-check-circle" style="margin-left: 2px; font-size: 0.8em; color: #4A90E2;"></i>`;
        }
      }
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

// ============================================================
// FEED
// ============================================================

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
  const amigosDosAmigos = new Map();
  try {
    const promises = amigosUids.slice(0, 20).map(async amigoUid => {
      try {
        const snap = await getDocs(collection(db, `users/${amigoUid}/friends`));
        const userData = await buscarUsuarioCached(amigoUid);
        const usernameAmigo = userData?.username || amigoUid;
        snap.docs.forEach(d => {
          const idAmigoDosAmigos = d.id;
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
  return amigosDosAmigos;
}

function toSeconds(ts) {
  if (!ts) return 0;
  if (typeof ts === 'object' && ts.seconds) return ts.seconds;
  return new Date(ts).getTime() / 1000;
}

function ordenarCronologico(posts) {
  return posts.sort((a, b) => toSeconds(b.create) - toSeconds(a.create));
}

async function montarFeedProporcional(uid, todosOsPosts, amigosUids, amigosDosAmigosMap) {
  const postsAmigos = [];
  const postsAmigosDosAmigos = [];
  const postsDescoberta = [];

  for (const post of todosOsPosts) {
    if (!post || post.visible === false) continue;
    const criadorId = post.creatorid;
    if (criadorId === uid) {
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

  ordenarCronologico(postsAmigos);
  ordenarCronologico(postsAmigosDosAmigos);
  ordenarCronologico(postsDescoberta);

  const resultado = [];
  let iA = 0, iAA = 0, iD = 0;
  const total = todosOsPosts.filter(p => p && p.visible !== false).length;

  while (resultado.length < total) {
    const lote = [];

    for (let i = 0; i < 6 && iA < postsAmigos.length; i++, iA++) {
      lote.push(postsAmigos[iA]);
    }
    for (let i = 0; i < 3 && iAA < postsAmigosDosAmigos.length; i++, iAA++) {
      lote.push(postsAmigosDosAmigos[iAA]);
    }
    for (let i = 0; i < 1 && iD < postsDescoberta.length; i++, iD++) {
      lote.push(postsDescoberta[iD]);
    }

    if (lote.length === 0) break;

    ordenarCronologico(lote);
    resultado.push(...lote);
  }

  return resultado;
}

async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;

  const isFirstLoad = !feed || feed.children.length === 0;
  if (isFirstLoad) {
    const postsEmCache = getPostsCache();

    if (postsEmCache) {
      allItems = [...postsEmCache];
      ordenarCronologico(allItems);
      for (const item of allItems) {
        renderPost(item, feed);
      }
    }
  }

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
      const postsProporcional = await montarFeedProporcional(uid, postsRaw, amigosUids, amigosDosAmigosMap);

      setPostsCache(postsProporcional);

      allItems = [...postsProporcional];
      ordenarCronologico(allItems);

      feed.innerHTML = '';
      for (const item of allItems) {
        renderPost(item, feed);
      }

      iniciarSincronizacaoBackground();
    } else {
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
    if (loadMoreBtn) loadMoreBtn.textContent = 'Erro ao carregar';
    const ind = document.getElementById('scroll-loading-indicator');
    if (ind) ind.remove();
  }

  loading = false;
}

async function sendPost() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    return;
  }
  
  const texto = postInput.value.trim();
  if (!texto) {
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


// ============================================================
// LIKES
// ============================================================

async function contarComentarios(postId) {
  const comentariosRef = collection(db, 'posts', postId, 'coments');
  const snapshot = await getDocs(comentariosRef);
  return snapshot.size;
}


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
      await updateDoc(likerRef, {
        like: false,
        timestamp: Date.now()
      });

      element.classList.remove("liked");
      spanCurtidas.textContent = Math.max(0, curtidasAtuais - 1);
    } else {
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
    atualizarCurtidoPorDepoisDoLike(element, postId);

  } catch (error) {
    console.error("Erro ao curtir/descurtir:", error);
  }
}

async function atualizarCurtidoPorDepoisDoLike(btn, postId) {
  const usuarioLogado = auth.currentUser;
  const footerBox = btn.closest(".post-card").querySelector(".post-footer-box");
  const footer = btn.closest(".post-card").querySelector(".post-liked-by");

  if (!footerBox || !footer || !usuarioLogado) return;

  const info = await gerarTextoCurtidoPor(postId, usuarioLogado.uid);

  if (info.total === 0) {
    footerBox.style.display = "none";
    footer.innerHTML = "";
    return;
  }

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
            ${index > 0 ? 'margin-left: -6px;' : ''}
          "
        />
      `;
    });
    fotosHTML += '</div>';
  }

  let textoHTML = '<span>Curtido por ';

  if (info.usernames.length === 1) {
    textoHTML += `<strong>${info.usernames[0]}</strong>`;
  } else if (info.usernames.length >= 2) {
    textoHTML += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
  }

  const outros = info.total - info.usernames.length;
  if (outros === 1) {
    textoHTML += ` e outra <strong>1 pessoa</strong>`;
  } else if (outros > 1) {
    textoHTML += ` e outras <strong>${outros} pessoas</strong>`;
  }

  textoHTML += '</span>';

  footer.style.display = "flex";
  footer.style.alignItems = "center";
  footer.style.gap = "8px";
  footer.innerHTML = fotosHTML + textoHTML;

  footerBox.style.display = "flex";
}



async function gerarTextoCurtidoPor(postId, usuarioLogadoUid) {
  const likersRef = collection(db, `posts/${postId}/likers`);
  const likersSnap = await getDocs(likersRef);

  const likersTotal = [];
  likersSnap.forEach(d => {
    if (d.data().like === true) {
      likersTotal.push({ uid: d.id, timestamp: d.data().timestamp || 0 });
    }
  });

  const total = likersTotal.length;
  if (total === 0) return { usernames: [], total: 0, fotos: [] };

  if (total === 1 && likersTotal[0].uid === usuarioLogadoUid) {
    const meusDados = await buscarUsuarioCached(usuarioLogadoUid);
    return {
      usernames: ["você"],
      total,
      fotos: [meusDados?.userphoto || './src/img/default.jpg']
    };
  }

  const likersExibicao = likersTotal.filter(l => l.uid !== usuarioLogadoUid);
  if (likersExibicao.length === 0) return { usernames: ["você"], total, fotos: [] };

  likersExibicao.sort((a, b) => b.timestamp - a.timestamp);

  const amigosSnap = await getDocs(collection(db, `users/${usuarioLogadoUid}/friends`));
  const amigosUid = amigosSnap.docs.map(d => d.id);

  const amigosQueCurtiram = likersExibicao.filter(l => amigosUid.includes(l.uid));
  const outrosQueCurtiram = likersExibicao.filter(l => !amigosUid.includes(l.uid));

  const pessoasParaMostrar = [
    ...amigosQueCurtiram.slice(0, 2),
    ...outrosQueCurtiram.slice(0, 2 - Math.min(2, amigosQueCurtiram.length))
  ].slice(0, 2);

  const dadosPessoas = await Promise.all(
    pessoasParaMostrar.map(p => buscarUsuarioCached(p.uid))
  );

  const usernames = dadosPessoas.map(d => d?.username || d?.displayname || "usuário");
  const fotos = dadosPessoas.map(d => d?.userphoto || './src/img/default.jpg');

  return { usernames, total, fotos };
}

// ============================================================
// PERFIL
// ============================================================

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

// ============================================================
// CACHE DE USUÁRIOS
// ============================================================

const CACHE_USER_TIME = 1000 * 60 * 30;

function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw);
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



async function buscarUsuarioCached(uid) {
  const key = `user_cache_${uid}`;

  const ehProprioUsuario = auth.currentUser && auth.currentUser.uid === uid;
  if (ehProprioUsuario) {
    if (!isCacheExpirado(key)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try { return JSON.parse(raw).value; } catch {}
      }
    }
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
      buscarDadosUsuarioPorUid(uid).then(dados => {
        if (dados) setCache(key, dados);
      }).catch(() => {});
    }
    return stale;
  }

  const dados = await buscarDadosUsuarioPorUid(uid);
  if (dados) setCache(key, dados);
  return dados;
}

// ============================================================
// SAUDAÇÃO
// ============================================================

async function atualizarGreeting(userParam) {
  const user = userParam || auth.currentUser;
  if (!user) return;

  const uid = user.uid;
  const cacheKey = `user_cache_${uid}`;
  const photoKey = `user_photo_${uid}`;

  const saudacao = getSaudacao();
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) greetingEl.textContent = saudacao;

  try { localStorage.removeItem(cacheKey); } catch {}

  const userData = await buscarDadosUsuarioPorUid(uid);

  if (userData) {
    setCache(cacheKey, userData);
    if (userData.userphoto) setCache(photoKey, userData.userphoto);
  }

  const cachedPhoto = userData?.userphoto || getCache(photoKey);
  updateUI({ saudacao, nome: getNome(userData), userData, user, cachedPhoto });
}

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
// POST LAYER
// ============================================================

function configurarPostLayer() {
  const postLayer = document.getElementById('postLayer');
  const closeBtn  = document.getElementById('closeLayerBtn');
  const feedPage = document.getElementById('feedPage');

  if (!postLayer) return;

  function abrirLayer(tipoPadrao = 'post') {
    document.querySelectorAll('.post-type-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.post-content-type').forEach(c => c.classList.remove('active'));
    const tab = document.querySelector(`.post-type-tab[data-type="${tipoPadrao}"]`);
    const content = document.querySelector(`.post-content-type[data-type="${tipoPadrao}"]`);
    if (tab) tab.classList.add('active');
    if (content) content.classList.add('active');

    const user = auth.currentUser;
    if (user) {
      buscarUsuarioCached(user.uid).then(dados => {
        const avatar = postLayer.querySelector('.np-avatar');
        const usernameEl = postLayer.querySelector('.np-username');
        if (avatar && dados?.userphoto) avatar.src = dados.userphoto;
        if (usernameEl) usernameEl.textContent = dados?.username || dados?.displayname || '';
      });
    }

    postLayer.classList.add('active');
    feedPage.classList.add('closed')
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      const textarea = postLayer.querySelector('.post-content-type.active .np-text-input');
      if (textarea) textarea.focus();
    }, 150);
  }

  function fecharLayer() {
    postLayer.classList.remove('active');
    feedPage.classList.remove('closed');
    document.body.style.overflow = '';
    limparInputsPost();
    document.querySelector('.image-preview-container')?.remove();
  }

  if (closeBtn) closeBtn.addEventListener('click', fecharLayer);

  postLayer.addEventListener('click', (e) => {
    if (e.target === postLayer) fecharLayer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && postLayer.classList.contains('active')) fecharLayer();
  });

  const topBtn = document.getElementById('openPostLayerNav');
  if (topBtn) topBtn.addEventListener('click', () => abrirLayer('post'));

  const npBtn = document.getElementById('openPostLayer');
  if (npBtn) npBtn.addEventListener('click', () => abrirLayer('post'));

  const sidebarCriar = document.querySelector('.sidebar .postmodal');
  if (sidebarCriar) {
    sidebarCriar.removeAttribute('onclick');
    sidebarCriar.addEventListener('click', (e) => {
      e.preventDefault();
      abrirLayer('post');
    });
  }

  window.abrirPostModal  = () => abrirLayer('post');
  window.fecharPostModal = fecharLayer;
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
    fileInputLayer.accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp';
    fileInputLayer.style.display = 'none';
    document.body.appendChild(fileInputLayer);
  }

  function selecionarArquivo() { fileInputLayer.click(); }

  function aplicarPreview(file) {
    if (!file) return;
    if (!IMGBB_TIPOS_SUPORTADOS.includes(file.type)) return;
    adicionarImagemCarrosel(file);
  }

  if (postFileArea) {
    postFileArea.addEventListener('click', selecionarArquivo);
  }

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
      Array.from(e.dataTransfer.files).forEach(f => aplicarPreview(f));
    });
  }

  fileInputLayer.addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(f => aplicarPreview(f));
    fileInputLayer.value = '';
  });
}

// ============================================================
// UPLOAD DE IMAGEM
// ============================================================

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

const IMGBB_TIPOS_SUPORTADOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const IMGBB_MAX_SIZE = 32 * 1024 * 1024;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadComRetry(file, userId, tentativas = 3) {
  for (let t = 0; t < tentativas; t++) {
    if (t > 0) await sleep(1000 * t);
    const result = await uploadImagemPost(file, userId);
    if (result.success) return result;
  }
  return { success: false, error: 'Falhou após várias tentativas' };
}

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
  
  let imagePreview = postArea.nextElementSibling;
  if (imagePreview && imagePreview.classList.contains('image-preview-container')) {
    imagePreview.remove();
  }
  
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
  fileBtn.addEventListener('click', () => {
    fileInput.click();
  });
}


// ============================================================
// MODAL DE COMENTÁRIOS
// ============================================================

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
  
  const scrollY = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width = '100%';
  document.body.style.top = `-${scrollY}px`;
  
  modal.offsetHeight;
  
  requestAnimationFrame(() => {
    modal.classList.add('active');
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      fecharModalComentarios();
    }
  });

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
    
    if (deltaY > 0) {
      modalContent.style.transform = `translateY(${deltaY}px)`;
      const opacity = Math.max(0, 1 - (deltaY / 300));
      modal.style.backgroundColor = `rgba(0, 0, 0, ${opacity * 0.5})`;
    }
  };

  const handleTouchEnd = (e) => {
    if (!isDragging) return;
    isDragging = false;
    
    const deltaY = currentY - startY;
    modalContent.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    
    if (deltaY > 150) {
      fecharModalComentarios();
    } else {
      modalContent.style.transform = 'translateY(0)';
      modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    }
  };

  modalGrab.addEventListener('touchstart', handleTouchStart);
  modalGrab.addEventListener('touchmove', handleTouchMove);
  modalGrab.addEventListener('touchend', handleTouchEnd);
  
  header.addEventListener('touchstart', handleTouchStart);
  header.addEventListener('touchmove', handleTouchMove);
  header.addEventListener('touchend', handleTouchEnd);

  const commentsList = modal.querySelector('.comments-list-mobile');
  await renderizarComentarios(creatorId, postId, commentsList);
  
const btnComment = document.querySelector(`.btn-comment[data-id="${postId}"]`);
if (btnComment) {
  const total = await contarComentarios(postId);
  const span = btnComment.querySelector('span');
  if (span) span.textContent = total;
}
  
  modal.querySelector('.comment-submit-mobile').addEventListener('click', async (e) => {
    e.preventDefault();
    const input = modal.querySelector('.comment-input-mobile');
    const conteudo = input.value.trim();
    if (conteudo) {
      const sucesso = await adicionarComentario(creatorId, postId, conteudo);
      if (sucesso) {
        triggerNovoComentario(postId, creatorId).catch(console.warn);
        input.value = '';
        invalidarCacheComentarios(postId);
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
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }, 300);
  }
}

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

  menuLayer.addEventListener('click', (e) => {
    if (e.target === menuLayer) fecharMenuBottom();
  });

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

// ============================================================
// MENU BOTTOM / AÇÕES DO POST
// ============================================================

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

// ============================================================
// EVENT LISTENERS
// ============================================================

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
  
  if (feed) {
    feed.addEventListener('click', async (e) => {
      const btnLike = e.target.closest('.btn-like');
      const btnReport = e.target.closest('.btn-report');
      const btnComment = e.target.closest('.btn-comment');
      const userNameLink = e.target.closest('.user-name-link');
      const btnMore = e.target.closest(".more-options-button");
      const commentSubmit = e.target.closest('.comment-submit');

      if (btnLike) {
        const uid = auth.currentUser?.uid;
        const postId = btnLike.dataset.id;
        if (uid && postId) {
          await toggleLikePost(uid, postId, btnLike);
        }
      }

      if (btnComment) {
        const postId = btnComment.dataset.id;
        const uid = btnComment.dataset.username;
        abrirModalComentarios(postId, uid);
      }

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

      if (btnMore) {
        const postCard = btnMore.closest(".post-card");
        const postId = postCard.querySelector('.btn-like')?.dataset.id;
        const ownerId = postCard.querySelector('.btn-like')?.dataset.username;
        if (postId && ownerId) {
          abrirMenuBottom(postId, ownerId, postCard);
        }
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
        }
      }
    });
  }
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('comentario-nome')) {
    const uid = e.target.dataset.username;
    if (uid) {
      window.location.href = `profile.html?userid=${encodeURIComponent(uid)}`;
    }
  }
});


// ============================================================
// ATUALIZAÇÃO DE DATAS
// ============================================================

function atualizarDatasAutomaticamente() {
  setInterval(() => {
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

// ============================================================
// LOADING
// ============================================================

function mostrarLoading(mensagem) {
  const container = document.createElement('div');
  container.className = 'loading-overlay';
  container.id = 'loadingOverlay';
  container.innerHTML = `
    <div class="loading-content">
      <div class="spinner"></div>
      <p class="loading-text">${mensagem}</p>
    </div>
  `;
  document.body.appendChild(container);
  
  const style = document.createElement('style');
  style.textContent = `
    .loading-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .loading-content {
      text-align: center;
      color: #fff;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 4px solid rgba(255,255,255,0.3);
      border-top: 4px solid #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 15px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
  
  return {
    interval: setInterval(() => {}, 1000)
  };
}

function esconderLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.remove();
}

function atualizarTextoLoading(mensagem) {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    const text = overlay.querySelector('.loading-text');
    if (text) text.textContent = mensagem;
  }
}

// ============================================================
// ANIMAÇÃO DE CORAÇÃO (double tap)
// ============================================================

function _animarCoracaoLike(carousel, e) {
  const rect = carousel.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  
  const heart = document.createElement('div');
  heart.innerHTML = '❤️';
  heart.style.cssText = `
    position: absolute;
    left: ${x}px;
    top: ${y}px;
    pointer-events: none;
    font-size: 50px;
    animation: floatHeart 1.5s ease-out forwards;
    z-index: 1000;
  `;
  
  if (!document.getElementById('heart-animation-style')) {
    const style = document.createElement('style');
    style.id = 'heart-animation-style';
    style.textContent = `
      @keyframes floatHeart {
        0% { opacity: 1; transform: translateY(0) scale(1); }
        100% { opacity: 0; transform: translateY(-100px) scale(0.8); }
      }
    `;
    document.head.appendChild(style);
  }
  
  carousel.style.position = 'relative';
  carousel.appendChild(heart);
  setTimeout(() => heart.remove(), 1500);
}


async function handleDenunciarPost(postId, ownerId, reason = 'other') {
  try {
    const user = auth.currentUser;
    if (!user) return;
    
    const reportId = `report_${Date.now()}`;
    const reportData = {
      reportId,
      type: 'post',
      targetId: postId,
      targetOwnerId: ownerId,
      reportedBy: user.uid,
      reason,
      timestamp: serverTimestamp(),
      status: 'pending'
    };
    
    await setDoc(doc(db, 'reports', reportId), reportData);
    alert('Denúncia enviada com sucesso!');
  } catch (error) {
    console.error('Erro ao denunciar:', error);
    alert('Erro ao enviar denúncia');
  }
}

// ============================================================
// TIPOS DE POST
// ============================================================

let postImageFiles = [];
const MAX_IMAGES = 12;

function inicializarSistemaTipoPost() {
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

  const addImgBtn = document.getElementById('np-add-img');
  if (addImgBtn) {
    addImgBtn.addEventListener('click', () => {
      if (postImageFiles.length >= MAX_IMAGES) {
        alert(`Máximo de ${MAX_IMAGES} imagens atingido.`);
        return;
      }
      const input = document.createElement('input');
      input.type    = 'file';
      input.accept  = 'image/*';
      input.multiple = true;
      input.onchange = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(f => adicionarImagemCarrosel(f));
      };
      input.click();
    });
  }

  const carroselContainer = document.querySelector('.image-preview-carrosel');
  if (carroselContainer) {
    carroselContainer.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('.remove-image');
      if (!removeBtn) return;
      const imgPreview = removeBtn.closest('.img-preview');
      const index = parseInt(imgPreview?.dataset.index ?? '-1');
      if (index >= 0) {
        postImageFiles.splice(index, 1);
        renderizarPreviewsCarrosel();
      }
    });
  }

  document.getElementById('btnLocal')?.addEventListener('click', () => {
    const overlay = document.getElementById('overlayLocal');
    if (overlay) overlay.style.display = 'flex';
  });

  document.getElementById('confirm-local')?.addEventListener('click', () => {
    const overlay = document.getElementById('overlayLocal');
    if (overlay) overlay.style.display = 'none';
    const input = document.getElementById('add-location');
    const btnLocal = document.getElementById('btnLocal');
    if (btnLocal) {
      const dot = btnLocal.querySelector('.np-btn-dot');
      if (dot) dot.style.display = input?.value.trim() ? 'block' : 'none';
    }
  });

  document.getElementById('cancel-local')?.addEventListener('click', () => {
    const overlay = document.getElementById('overlayLocal');
    if (overlay) {
      overlay.style.display = 'none';
      const input = document.getElementById('add-location');
      if (input) input.value = '';
    }
  });

  document.getElementById('btn-post')?.addEventListener('click', async () => {
    const user  = auth.currentUser;
    const texto = document.querySelector('.np-text-input')?.value.trim() ?? '';
    await enviarPost(user, texto, postImageFiles);
  });
}

function adicionarImagemCarrosel(file) {
  if (!file || !file.type.startsWith('image/')) return;
  if (postImageFiles.length >= MAX_IMAGES) {
    alert(`Máximo de ${MAX_IMAGES} imagens atingido.`);
    return;
  }
  postImageFiles.push(file);
  renderizarPreviewsCarrosel();
}

function renderizarPreviewsCarrosel() {
  const carrosel = document.querySelector('.image-preview-carrosel');
  if (!carrosel) return;

  carrosel.innerHTML = '';

  if (postImageFiles.length === 0) {
    carrosel.classList.remove('visible');
    return;
  }

  carrosel.classList.add('visible');

  postImageFiles.forEach((file, index) => {
    const div = document.createElement('div');
    div.className = 'img-preview';
    div.dataset.index = index;
    div.innerHTML = `
      <img src="" alt="Preview ${index + 1}">
      <button class="remove-image" type="button"><i class="fas fa-times"></i></button>
    `;
    carrosel.appendChild(div);

    const reader = new FileReader();
    reader.onload = (e) => {
      div.querySelector('img').src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  const addImgBtn = document.getElementById('np-add-img');
  if (addImgBtn) {
    addImgBtn.textContent = postImageFiles.length >= MAX_IMAGES
      ? `Máximo atingido (${MAX_IMAGES})`
      : `Adicionar Imagem (${postImageFiles.length}/${MAX_IMAGES})`;
  }
}

function limparInputsPost() {
  document.querySelectorAll('.np-text-input').forEach(input => {
    input.value = '';
    const counter = input.parentElement?.querySelector('.char-counter');
    if (counter) {
      const max = input.getAttribute('maxlength');
      counter.textContent = `0/${max}`;
      counter.classList.remove('limit');
    }
  });

  postImageFiles = [];
  renderizarPreviewsCarrosel();

  const locationInput = document.getElementById('add-location');
  if (locationInput) locationInput.value = '';
  const btnLocal = document.getElementById('btnLocal');
  if (btnLocal) {
    const dot = btnLocal.querySelector('.np-btn-dot');
    if (dot) dot.style.display = 'none';
  }

  const postFileArea = document.getElementById('post-file-input');
  if (postFileArea) postFileArea.style.display = '';
}



async function enviarPublicacao() {
  const usuarioLogado = auth.currentUser;
  if (!usuarioLogado) {
    return;
  }

  const activeContent = document.querySelector('.post-content-type.active');
  const textarea = activeContent ? activeContent.querySelector('.np-text-input') : document.querySelector('.np-text-input');
  const texto = textarea ? textarea.value.trim() : '';

  await enviarPost(usuarioLogado, texto, postImageFiles);
}

async function enviarPost(user, texto, imageFiles) {
  const files = Array.isArray(imageFiles) ? imageFiles.filter(Boolean) : (imageFiles ? [imageFiles] : []);
  if (!texto && files.length === 0) {
    alert('Escreva algo ou adicione uma imagem!');
    return;
  }
 
  const postLayer = document.getElementById('postLayer');
  if (postLayer) postLayer.classList.remove('active');

  const feedPage = document.getElementById('feedPage');
  if (feedPage) feedPage.classList.remove('closed');

  document.body.style.overflow = '';
  limparInputsPost();
 
  const bar = criarBarraPost();
  avancarBarra(bar, 10);
 
  try {
    const postId = gerarIdUnico('post');
    const urls = [];
    const deleteUrls = [];
 
    if (files.length > 0) {
      const step = 50 / files.length;
      for (let i = 0; i < files.length; i++) {
        avancarBarra(bar, 10 + step * i);
        if (i > 0) await sleep(800);
        const uploadResult = await uploadComRetry(files[i], user.uid);
        if (!uploadResult.success) {
          removerBarra(bar);
          alert('Erro no upload: ' + uploadResult.error);
          return;
        }
        urls.push(uploadResult.url);
        deleteUrls.push(uploadResult.deleteUrl);
      }
      avancarBarra(bar, 70);
    } else {
      avancarBarra(bar, 60);
    }

    const locationInput = document.getElementById('add-location');
    const location = locationInput ? locationInput.value.trim() : '';
    if (locationInput) locationInput.value = '';
 
    const postData = {
      content:      texto,
      img:          urls.length === 1 ? urls[0] : '',
      imgs:         urls.length > 1 ? urls : [],
      imgDeleteUrl: deleteUrls.length === 1 ? deleteUrls[0] : '',
      imgDeleteUrls: deleteUrls.length > 1 ? deleteUrls : [],
      likes:        0,
      saves:        0,
      comentarios:  0,
      postid:       postId,
      creatorid:    user.uid,
      reports:      0,
      visible:      true,
      create:       serverTimestamp()
    };

    if (location) postData.location = location;
 
    avancarBarra(bar, 85);
    await setDoc(doc(db, 'posts', postId), postData);
    await setDoc(doc(db, 'users', user.uid, 'posts', postId), postData);
 
    triggerNovoPost(postId).catch(console.warn);
 
    avancarBarra(bar, 100);
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




// ============================================================
// BARRA DE PROGRESSO
// ============================================================

function criarBarraPost() {
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

// ============================================================
// INICIALIZAÇÃO
// ============================================================

window.addEventListener("DOMContentLoaded", async () => {
  feed       = document.getElementById('feed');
  loadMoreBtn = document.getElementById('load-more-btn');
  postInput  = document.querySelector('.post-box input[type="text"]');
  postButton = document.querySelector('.post-button');

  carregarFotoPerfil(null);

  const user = await verificarLogin();

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

window.addEventListener('beforeunload', () => {
  pararSincronizacaoBackground();
});

window.addEventListener('pagehide', () => {
  pararSincronizacaoBackground();
});

function carregarFotoPerfil(user) {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = '../public/img/default.jpg';

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