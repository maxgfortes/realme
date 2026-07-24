import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc,
  updateDoc, setDoc, serverTimestamp, where,
  deleteDoc, query, orderBy, limit, startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

const POSTS_LIMIT = 12;

const CACHE = {
  POSTS_TTL: 8 * 60 * 1000,
  USERS_TTL: 30 * 60 * 1000,
  SYNC_INTERVAL: 2 * 60 * 1000,
  MAX_POSTS: 100,
  COMMENTS_TTL: 8 * 60 * 1000,
  MAX_COMMENT_POSTS: 30
};

const IMGBB_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
const IMGBB_MAX_SIZE = 32 * 1024 * 1024;
const MAX_IMAGES = 12;
const DEFAULT_AVATAR = '../public/img/default.jpg';

let loading = false;
let hasMorePosts = true;
let lastPostSnapshot = null;
let allItems = [];
let syncTimer = null;
let postImageFiles = [];
let currentMenuPost = null;
let cachedFriendUids = null;
let selectedMentions = [];
let mentionFriendsList = [];

let feed = null;
let loadMoreBtn = null;
let postInput = null;
let postButton = null;

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed.value === undefined || parsed.value === null) {
      return null;
    }
    return parsed.value;
  } catch (error) {
    return null;
  }
}

function cacheSet(key, value, ttl) {
  const finalTtl = ttl ? ttl : CACHE.USERS_TTL;
  try {
    const payload = { time: Date.now(), value: value, ttl: finalTtl };
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (error) {
    console.warn('Não foi possível salvar no cache:', key);
  }
}

function cacheExpired(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return true;
    }
    const parsed = JSON.parse(raw);
    const ttl = parsed.ttl ? parsed.ttl : CACHE.USERS_TTL;
    const idade = Date.now() - parsed.time;
    return idade > ttl;
  } catch (error) {
    return true;
  }
}

function cacheRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('Não foi possível remover do cache:', key);
  }
}

const POSTS_CACHE_KEY = 'feed_posts_cache';

function getPostsCache() {
  try {
    const raw = localStorage.getItem(POSTS_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    const idade = Date.now() - parsed.timestamp;
    if (idade > CACHE.POSTS_TTL) {
      cacheRemove(POSTS_CACHE_KEY);
      return null;
    }
    return parsed.posts;
  } catch (error) {
    return null;
  }
}

function setPostsCache(posts) {
  try {
    const postsLimitados = posts.slice(0, CACHE.MAX_POSTS);
    const payload = { timestamp: Date.now(), posts: postsLimitados };
    localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Não foi possível salvar o cache de posts');
  }
}

function clearPostsCache() {
  cacheRemove(POSTS_CACHE_KEY);
}

function startSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
  }

  syncTimer = setInterval(async () => {
    if (!auth.currentUser) {
      return;
    }

    try {
      const ultimoPostQuery = query(collection(db, 'posts'), orderBy('create', 'desc'), limit(1));
      const snap = await getDocs(ultimoPostQuery);
      if (snap.empty) {
        return;
      }

      const postsEmCache = getPostsCache();
      const cachedList = postsEmCache ? postsEmCache : [];
      const ultimoPostCache = cachedList.find(p => p.tipo === 'post');

      if (ultimoPostCache && snap.docs[0].id !== ultimoPostCache.postid) {
        clearPostsCache();
      }
    } catch (error) {
      console.warn('Falha ao sincronizar posts em segundo plano:', error);
    }
  }, CACHE.SYNC_INTERVAL);
}

function stopSync() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

function commentCacheKey(postId) {
  return `coments_cache_${postId}`;
}

function getCommentsCache(postId) {
  try {
    const raw = localStorage.getItem(commentCacheKey(postId));
    if (!raw) {
      return null;
    }
    return JSON.parse(raw).comentarios;
  } catch (error) {
    return null;
  }
}

function setCommentsCache(postId, comentarios) {
  try {
    const serializados = comentarios.map(comentario => {
      let create = comentario.create;
      if (comentario.create && comentario.create.seconds) {
        create = comentario.create.seconds * 1000;
      }
      return Object.assign({}, comentario, { create: create });
    });

    const payload = { timestamp: Date.now(), comentarios: serializados };
    localStorage.setItem(commentCacheKey(postId), JSON.stringify(payload));
    pruneCommentsCache();
  } catch (error) {
    console.warn('Não foi possível salvar o cache de comentários');
  }
}

function invalidateCommentsCache(postId) {
  cacheRemove(commentCacheKey(postId));
}

function isCommentsCacheExpired(postId) {
  try {
    const raw = localStorage.getItem(commentCacheKey(postId));
    if (!raw) {
      return true;
    }
    const parsed = JSON.parse(raw);
    return Date.now() - parsed.timestamp > CACHE.COMMENTS_TTL;
  } catch (error) {
    return true;
  }
}

function pruneCommentsCache() {
  try {
    const prefixo = 'coments_cache_';
    const chaves = [];

    for (let i = 0; i < localStorage.length; i++) {
      const chave = localStorage.key(i);
      if (chave && chave.startsWith(prefixo)) {
        chaves.push(chave);
      }
    }

    if (chaves.length <= CACHE.MAX_COMMENT_POSTS) {
      return;
    }

    const comTimestamp = chaves.map(chave => {
      try {
        const parsed = JSON.parse(localStorage.getItem(chave));
        return { chave: chave, tempo: parsed.timestamp };
      } catch (error) {
        return { chave: chave, tempo: 0 };
      }
    });

    comTimestamp.sort((a, b) => a.tempo - b.tempo);

    const quantidadeParaRemover = comTimestamp.length - CACHE.MAX_COMMENT_POSTS;
    for (let i = 0; i < quantidadeParaRemover; i++) {
      cacheRemove(comTimestamp[i].chave);
    }
  } catch (error) {
    console.warn('Falha ao limpar cache antigo de comentários');
  }
}

async function fetchUser(uidDoUsuario) {
  try {
    const userSnap = await getDoc(doc(db, 'users', uidDoUsuario));
    if (!userSnap.exists()) {
      return null;
    }

    const data = userSnap.data();
    let userphoto = '';

    try {
      const mediaSnap = await getDoc(doc(db, 'users', uidDoUsuario, 'user-infos', 'user-media'));
      if (mediaSnap.exists() && mediaSnap.data().userphoto) {
        userphoto = mediaSnap.data().userphoto;
      }
    } catch (error) {
      console.warn('Falha ao buscar foto do usuário:', uidDoUsuario);
    }

    const name = data.name ? data.name : '';
    const surname = data.surname ? data.surname : '';

    return {
      userphoto: userphoto,
      username: data.username ? data.username : '',
      displayname: data.displayname ? data.displayname : '',
      name: name,
      surname: surname,
      fullname: `${name} ${surname}`.trim(),
      verified: data.verified ? data.verified : false
    };
  } catch (error) {
    return null;
  }
}

async function getUserCached(uidDoUsuario) {
  const chave = `user_cache_${uidDoUsuario}`;
  const isSelf = auth.currentUser && auth.currentUser.uid === uidDoUsuario;

  if (isSelf) {
    if (!cacheExpired(chave)) {
      return cacheGet(chave);
    }
    const dadosAtualizados = await fetchUser(uidDoUsuario);
    if (dadosAtualizados) {
      cacheSet(chave, dadosAtualizados, CACHE.USERS_TTL);
    }
    return dadosAtualizados;
  }

  const dadosEmCache = cacheGet(chave);
  if (dadosEmCache) {
    if (cacheExpired(chave)) {
      fetchUser(uidDoUsuario).then(dados => {
        if (dados) {
          cacheSet(chave, dados, CACHE.USERS_TTL);
        }
      }).catch(() => {});
    }
    return dadosEmCache;
  }

  const dados = await fetchUser(uidDoUsuario);
  if (dados) {
    cacheSet(chave, dados, CACHE.USERS_TTL);
  }
  return dados;
}

function waitForAuth() {
  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      unsub();
      console.warn('[Auth] Timeout aguardando autenticação');
      resolve(null);
    }, 8000);

    const unsub = onAuthStateChanged(auth, user => {
      clearTimeout(timeout);
      unsub();
      if (!user) {
        setTimeout(() => { window.location.href = 'login.html'; }, 2000);
      }
      resolve(user ? user : null);
    });
  });
}

function getAuthUser() {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      resolve(user ? user : null);
    });
    setTimeout(() => resolve(null), 5000);
  });
}

function generateId(prefixo) {
  const prefixoFinal = prefixo ? prefixo : 'id';
  const numeroAleatorio = Math.floor(Math.random() * 1000000);
  return `${prefixoFinal}-${Date.now()}${numeroAleatorio}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function toSeconds(timestamp) {
  if (!timestamp) {
    return 0;
  }
  if (timestamp.seconds) {
    return timestamp.seconds;
  }
  return new Date(timestamp).getTime() / 1000;
}

function sortChronological(lista) {
  lista.sort((a, b) => toSeconds(b.create) - toSeconds(a.create));
  return lista;
}

function resolvePhoto() {
  for (let i = 0; i < arguments.length; i++) {
    const candidato = arguments[i];
    if (candidato && typeof candidato === 'string') {
      try {
        new URL(candidato);
        return candidato;
      } catch (error) {
        continue;
      }
    }
  }
  return DEFAULT_AVATAR;
}

function formatRelativeDate(data) {
  if (!data) {
    return 'Data não disponível';
  }

  try {
    let date;
    if (data.seconds) {
      date = new Date(data.seconds * 1000);
    } else {
      date = new Date(data);
    }

    const diferenca = Date.now() - date.getTime();
    const minutos = Math.floor(diferenca / 60000);
    const horas = Math.floor(diferenca / 3600000);
    const dias = Math.floor(diferenca / 86400000);
    const semanas = Math.floor(dias / 7);
    const meses = Math.floor(dias / 30);
    const anos = Math.floor(dias / 365);

    if (minutos < 1) {
      return 'Agora mesmo';
    }
    if (minutos < 60) {
      return `há ${minutos} minuto${minutos !== 1 ? 's' : ''}`;
    }
    if (horas < 24) {
      return `há ${horas} hora${horas !== 1 ? 's' : ''}`;
    }
    if (dias < 7) {
      return `há ${dias} dia${dias !== 1 ? 's' : ''}`;
    }
    if (semanas < 4) {
      return `há ${semanas} semana${semanas !== 1 ? 's' : ''}`;
    }
    if (meses < 12) {
      return `há ${meses} mês${meses !== 1 ? 'es' : ''}`;
    }
    return `há ${anos} ano${anos !== 1 ? 's' : ''}`;
  } catch (error) {
    return 'Data inválida';
  }
}

function formatText(text) {
  if (!text) {
    return '';
  }
  const comHashtag = text.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  const comMencao = comHashtag.replace(/@([a-z0-9._]+)/g, (match, username) => {
    return `<a href="profile?u=${username}" class="mention">@${username}</a>`;
  });
  return comMencao;
}

function setupInfiniteScroll() {
  document.addEventListener('scroll', async (event) => {
    const alvo = event.target;
    let scrollTop, alturaVisivel, alturaTotal;

    if (alvo === document || alvo === document.documentElement || alvo === document.body) {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      alturaVisivel = window.innerHeight;
      alturaTotal = document.documentElement.scrollHeight;
    } else if (alvo.scrollHeight > alvo.clientHeight) {
      scrollTop = alvo.scrollTop;
      alturaVisivel = alvo.clientHeight;
      alturaTotal = alvo.scrollHeight;
    } else {
      return;
    }

    const chegouPertoDoFim = scrollTop + alturaVisivel >= alturaTotal - 2200;
    if (!chegouPertoDoFim) {
      return;
    }

    const feedEl = document.getElementById('feed');
    if (!feedEl) {
      return;
    }

    const feedVisivel = window.getComputedStyle(feedEl).display !== 'none';
    if (feedVisivel && !loading && hasMorePosts) {
      await loadPosts();
    }
  }, true);
}

async function getLikedByInfo(postId, currentUid) {
  const likersSnap = await getDocs(collection(db, `posts/${postId}/likers`));

  const likers = [];
  likersSnap.docs.forEach(docSnap => {
    if (docSnap.data().like === true) {
      likers.push({ uid: docSnap.id, timestamp: docSnap.data().timestamp ? docSnap.data().timestamp : 0 });
    }
  });

  const total = likers.length;
  if (total === 0) {
    return { usernames: [], total: 0, fotos: [] };
  }

  if (total === 1 && likers[0].uid === currentUid) {
    const eu = await getUserCached(currentUid);
    const fotoDoEu = eu && eu.userphoto ? eu.userphoto : DEFAULT_AVATAR;
    return { usernames: ['você'], total: total, fotos: [fotoDoEu] };
  }

  const outros = likers.filter(l => l.uid !== currentUid).sort((a, b) => b.timestamp - a.timestamp);
  if (outros.length === 0) {
    return { usernames: ['você'], total: total, fotos: [] };
  }

  const amigosSnap = await getDocs(collection(db, `users/${currentUid}/friends`));
  const uidsDeAmigos = amigosSnap.docs.map(docSnap => docSnap.id);

  const amigosQueCurtiram = outros.filter(l => uidsDeAmigos.includes(l.uid));
  const restoQueCurtiram = outros.filter(l => !uidsDeAmigos.includes(l.uid));
  const paraMostrar = amigosQueCurtiram.concat(restoQueCurtiram).slice(0, 2);

  const dadosDosUsuarios = await Promise.all(paraMostrar.map(pessoa => getUserCached(pessoa.uid)));

  return {
    usernames: dadosDosUsuarios.map(dados => {
      if (dados && dados.username) return dados.username;
      if (dados && dados.displayname) return dados.displayname;
      return 'usuário';
    }),
    fotos: dadosDosUsuarios.map(dados => dados && dados.userphoto ? dados.userphoto : DEFAULT_AVATAR),
    total: total
  };
}

async function updateLikedByFooter(postEl, postId) {
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  const footer = postEl.querySelector('.post-liked-by');
  const footerBox = postEl.querySelector('.post-footer-box');
  if (!footer) {
    return;
  }

  let info;
  try {
    info = await getLikedByInfo(postId, user.uid);
  } catch (error) {
    console.warn('[LikedBy] Falha ao carregar curtidas:', error);
    return;
  }

  const likeSpan = postEl.querySelector('.btn-like span');
  if (likeSpan) {
    likeSpan.textContent = info.total;
  }

  if (info.total === 0) {
    if (footerBox) {
      footerBox.style.display = 'none';
    }
    footer.innerHTML = '';
    footer.style.visibility = 'hidden';
    return;
  }

  let fotosHTML = '';
  if (info.fotos.length > 0) {
    const imagensHTML = info.fotos.map((foto, index) => {
      const margem = index > 0 ? 'margin-left:-6px;' : '';
      return `<img src="${foto}" alt="Avatar" style="width:20px;height:20px;border-radius:50%;object-fit:cover;${margem}">`;
    }).join('');
    fotosHTML = `<div style="display:flex;">${imagensHTML}</div>`;
  }

  let texto = '<span>Curtido por ';
  if (info.usernames.length === 1) {
    texto += `<strong>${info.usernames[0]}</strong>`;
  } else if (info.usernames.length >= 2) {
    texto += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
  }

  const outrosRestantes = info.total - info.usernames.length;
  if (outrosRestantes === 1) {
    texto += ` e outra <strong>1 pessoa</strong>`;
  } else if (outrosRestantes > 1) {
    texto += ` e outras <strong>${outrosRestantes} pessoas</strong>`;
  }
  texto += '</span>';

  footer.style.cssText = 'display:flex;align-items:center;gap:8px;visibility:visible;';
  footer.innerHTML = fotosHTML + texto;
  if (footerBox) {
    footerBox.style.display = 'flex';
  }
}

async function countComments(postId) {
  const snap = await getDocs(collection(db, 'posts', postId, 'coments'));
  return snap.size;
}

async function toggleLike(uidDoUsuario, postId, botao) {
  const likerRef = doc(db, `posts/${postId}/likers/${uidDoUsuario}`);

  try {
    const likerSnap = await getDoc(likerRef);
    const span = botao.querySelector('span');
    const contagemAtual = parseInt(span.textContent) || 0;
    const jaCurtiu = likerSnap.exists() && likerSnap.data().like === true;

    if (jaCurtiu) {
      await updateDoc(likerRef, { like: false, timestamp: Date.now() });
      botao.classList.remove('liked');
      span.textContent = Math.max(0, contagemAtual - 1);
    } else {
      if (likerSnap.exists()) {
        await updateDoc(likerRef, { uid: uidDoUsuario, like: true, timestamp: Date.now() });
      } else {
        await setDoc(likerRef, { uid: uidDoUsuario, like: true, timestamp: Date.now() });
      }
      botao.classList.add('liked');
      span.textContent = contagemAtual + 1;
    }

    const card = botao.closest('.post-card');
    if (card) {
      updateLikedByFooter(card, postId);
    }
  } catch (error) {
    console.error('Erro ao curtir/descurtir:', error);
  }
}

async function fetchComments(postId) {
  try {
    const comentariosQuery = query(collection(db, 'posts', postId, 'coments'), orderBy('create', 'desc'));
    const snap = await getDocs(comentariosQuery);

    const comentarios = await Promise.all(snap.docs.map(async docSnap => {
      const dados = docSnap.data();
      const userData = await getUserCached(dados.senderid);
      return Object.assign({ id: docSnap.id, userData: userData }, dados);
    }));

    return comentarios;
  } catch (error) {
    return [];
  }
}

function renderCommentsList(comentarios, container) {
  if (comentarios.length === 0) {
    container.innerHTML = '<div class="no-comments"><div class="no-comments-title">Ainda não há nenhum comentario</div><div class="no-comments-sub">Inicie a conversa</div></div>';
    return;
  }

  const html = comentarios.map(comentario => {
    const userData = comentario.userData;
    let nome = comentario.senderid;
    if (userData && userData.displayname) nome = userData.displayname;
    else if (userData && userData.username) nome = userData.username;

    const username = userData && userData.username ? userData.username : '';
    const foto = resolvePhoto(userData ? userData.userphoto : null);

    let selo = '';
    if (userData && userData.verified) {
      selo = '<i class="fas fa-check-circle" style="margin-left:4px;font-size:0.85em;color:var(--verified-blue)"></i>';
    }

    return `
      <div class="comentario-item">
        <div class="comentario-header">
          <img src="${foto}" alt="Avatar" class="comentario-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
          <div class="comentario-meta">
            <strong class="comentario-nome" data-username="${comentario.senderid}">${username}${selo}</strong>
            <small class="comentario-data">${formatRelativeDate(comentario.create)}</small>
          </div>
        </div>
        <div class="comentario-conteudo">${formatText(comentario.content)}</div>
      </div>`;
  }).join('');

  container.innerHTML = html;
}

async function renderComments(postId, container) {
  const comentariosEmCache = getCommentsCache(postId);

  if (comentariosEmCache) {
    renderCommentsList(comentariosEmCache, container);

    if (isCommentsCacheExpired(postId)) {
      fetchComments(postId).then(comentariosAtualizados => {
        setCommentsCache(postId, comentariosAtualizados);
        renderCommentsList(comentariosAtualizados, container);
      }).catch(() => {});
    }
    return;
  }

  container.innerHTML = '<p class="no-comments" style="opacity:0.5">Carregando comentários...</p>';
  const comentarios = await fetchComments(postId);
  setCommentsCache(postId, comentarios);
  renderCommentsList(comentarios, container);
}

async function addComment(postId, content) {
  const user = auth.currentUser;
  if (!user) {
    return false;
  }

  try {
    const novoComentarioId = generateId('comentid');
    await setDoc(doc(db, 'posts', postId, 'coments', novoComentarioId), {
      content: content,
      create: serverTimestamp(),
      senderid: user.uid,
      report: 0
    });
    return true;
  } catch (error) {
    console.error('Erro ao adicionar comentário:', error);
    return false;
  }
}

function buildMediaHTML(postData) {
  let imagens = [];

  if (Array.isArray(postData.imgs) && postData.imgs.length > 0) {
    imagens = postData.imgs;
  } else if (postData.img && postData.img.trim()) {
    imagens = [postData.img];
  }

  if (imagens.length === 0) {
    return '';
  }

  if (imagens.length === 1) {
    return `<div class="post-image"><img src="${imagens[0]}" loading="lazy" decoding="async" style="width:100%;height:auto;display:block;"></div>`;
  }

  const slides = imagens.map(url => `<div class="post-carousel-slide"><img src="${url}" loading="lazy" decoding="async" alt=""></div>`).join('');
  const pontos = imagens.map((imagem, index) => {
    const classeAtiva = index === 0 ? ' active' : '';
    return `<div class="post-carousel-dot${classeAtiva}" data-index="${index}"></div>`;
  }).join('');

  return `
    <div class="post-carousel" data-total="${imagens.length}">
      <div class="post-carousel-track">${slides}</div>
    </div>
    <div class="post-carousel-dots">${pontos}</div>`;
}


function initCarousel(postEl) {
  const carousel = postEl.querySelector('.post-carousel');
  if (!carousel) {
    return;
  }

  const track = carousel.querySelector('.post-carousel-track');
  const total = parseInt(carousel.dataset.total, 10);
  const dots = postEl.querySelectorAll('.post-carousel-dot');

  let atual = 0;
  let posicaoInicialX = 0;
  let distanciaMovida = 0;
  let arrastando = false;

  function irParaSlide(indice) {
    if (indice < 0 || indice >= total) {
      return;
    }
    atual = indice;
    track.style.transform = `translateX(-${atual * 100}%)`;
    dots.forEach((dot, indiceDot) => {
      dot.classList.toggle('active', indiceDot === atual);
    });
  }

  function terminarArrasto() {
    if (!arrastando) {
      return;
    }
    arrastando = false;
    track.style.transition = '';

    const limiar = carousel.offsetWidth * 0.2;
    if (distanciaMovida < -limiar) {
      irParaSlide(atual + 1);
    } else if (distanciaMovida > limiar) {
      irParaSlide(atual - 1);
    } else {
      irParaSlide(atual);
    }
    distanciaMovida = 0;
  }

  carousel.addEventListener('touchstart', evento => {
    posicaoInicialX = evento.touches[0].clientX;
    distanciaMovida = 0;
    arrastando = true;
    track.style.transition = 'none';
  }, { passive: true });

  carousel.addEventListener('touchmove', evento => {
    if (!arrastando) {
      return;
    }
    distanciaMovida = evento.touches[0].clientX - posicaoInicialX;
    track.style.transform = `translateX(calc(-${atual * 100}% + ${distanciaMovida}px))`;
  }, { passive: true });

  carousel.addEventListener('touchend', terminarArrasto);

  carousel.addEventListener('mousedown', evento => {
    posicaoInicialX = evento.clientX;
    distanciaMovida = 0;
    arrastando = true;
    track.style.transition = 'none';
    evento.preventDefault();
  });

  window.addEventListener('mousemove', evento => {
    if (!arrastando) {
      return;
    }
    distanciaMovida = evento.clientX - posicaoInicialX;
    track.style.transform = `translateX(calc(-${atual * 100}% + ${distanciaMovida}px))`;
  });

  window.addEventListener('mouseup', terminarArrasto);

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      track.style.transition = '';
      irParaSlide(parseInt(dot.dataset.index, 10));
    });
  });

  carousel.addEventListener('dblclick', evento => {
    evento.preventDefault();
    animateHeartLike(carousel, evento);
    const botaoLike = postEl.querySelector('.btn-like');
    if (botaoLike) {
      botaoLike.click();
    }
  });
}

function renderPost(postData, container) {
  if (postData.visible === false) {
    return;
  }

  const mediaHTML = buildMediaHTML(postData);

  let sugeridoPorHTML = '';
  if (postData._feedTipo === 'amigoDosAmigos' && postData._sugeridoPor) {
    sugeridoPorHTML = `<p class="post-sugerido-por"><svg viewBox="0 0 24 24"><g><path d="M22.99 11.295l-6.986-2.13-.877-.326-.325-.88L12.67.975c-.092-.303-.372-.51-.688-.51-.316 0-.596.207-.688.51l-2.392 7.84-1.774.657-6.148 1.82c-.306.092-.515.372-.515.69 0 .32.21.6.515.69l7.956 2.358 2.356 7.956c.09.306.37.515.69.515.32 0 .6-.21.69-.514l1.822-6.15.656-1.773 7.84-2.392c.303-.09.51-.37.51-.687 0-.316-.207-.596-.51-.688z" fill="#794BC4"></path></g></svg> Sugerido por <strong>${postData._sugeridoPor}</strong></p>`;
  }

  const postEl = document.createElement('div');
  postEl.className = 'post-card';
  postEl.dataset.postId = postData.postid;

  postEl.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="${DEFAULT_AVATAR}" alt="Foto do usuário" class="avatar" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="user-meta">
          <span class="user-name-link" data-username="${postData.creatorid}"></span>
          <small class="post-date">${formatRelativeDate(postData.create)}</small>
        </div>
      </div>
      <div class="left-space-options">
        <div class="more-options">
          <button class="more-options-button"><i class="fas fa-ellipsis-h"></i></button>
        </div>
      </div>
    </div>
    <div class="post-content">
      <div class="post-text">${formatText(postData.content || '')}</div>
      ${mediaHTML}
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="btn-like" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 456.549"><path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/></svg>
            <span>${postData.likes || 0}</span>
          </button>
          <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg id="Layer_1" data-name="Layer 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 122.97 122.88"><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/></svg>
            <span>${postData.comentarios || 0}</span>
          </button>
        </div>
      </div>
      <div class="post-footer-infos">
        <div class="post-footer-box">
          <div class="post-footer-label">
            <p class="post-liked-by" style="min-height:28px;visibility:hidden;"></p>
            ${sugeridoPorHTML}
          </div>
        </div>
      </div>
    </div>`;

  container.appendChild(postEl);
  initCarousel(postEl);

  const contadorComentarios = postEl.querySelector('.btn-comment span');
  if (contadorComentarios) {
    countComments(postData.postid).then(quantidade => {
      contadorComentarios.textContent = quantidade;
    }).catch(() => {});
  }

  getAuthUser().then(user => {
    if (!user) {
      return;
    }

    updateLikedByFooter(postEl, postData.postid);

    const likerRef = doc(db, `posts/${postData.postid}/likers/${user.uid}`);
    getDoc(likerRef).then(likerSnap => {
      if (likerSnap.exists() && likerSnap.data().like === true) {
        const botaoLike = postEl.querySelector('.btn-like');
        if (botaoLike) {
          botaoLike.classList.add('liked');
        }
      }
    }).catch(() => {});
  });

  getUserCached(postData.creatorid).then(async userData => {
    if (!userData) {
      return;
    }

    const avatar = postEl.querySelector('.avatar');
    const nameEl = postEl.querySelector('.user-name-link');

    if (avatar) {
      avatar.src = userData.userphoto ? userData.userphoto : DEFAULT_AVATAR;
    }
    if (!nameEl) {
      return;
    }

    let ownerUsername = '...';
    if (userData.username) ownerUsername = userData.username;
    else if (userData.displayname) ownerUsername = userData.displayname;
    else if (userData.name) ownerUsername = userData.name;

    let verifiedBadge = '';
    if (userData.verified) {
      verifiedBadge = ' <i class="fas fa-check-circle" style="margin-left:2px;font-size:0.8em;color:#4A90E2;"></i>';
    }

    let mentions = [];
    if (Array.isArray(postData.mentions)) {
      mentions = postData.mentions.filter(Boolean);
    }

    if (mentions.length === 0) {
      nameEl.innerHTML = `<strong>${ownerUsername}</strong>${verifiedBadge}`;
      return;
    }

    const MAX_SHOW = 2;
    const paraBuscar = mentions.slice(0, MAX_SHOW);
    const resolvidos = await Promise.all(paraBuscar.map(async uidMencionado => {
      const dadosMencionado = await getUserCached(uidMencionado);
      let nomeMencionado = '?';
      if (dadosMencionado && dadosMencionado.username) nomeMencionado = dadosMencionado.username;
      else if (dadosMencionado && dadosMencionado.displayname) nomeMencionado = dadosMencionado.displayname;
      else if (dadosMencionado && dadosMencionado.name) nomeMencionado = dadosMencionado.name;
      return { username: nomeMencionado, uid: uidMencionado };
    }));

    const extras = mentions.length - MAX_SHOW;

    const linksDeMencao = resolvidos.map(resolvido => {
      return `<strong><a href="profile.html?uid=${encodeURIComponent(resolvido.uid)}" class="mention-link" style="color:inherit;text-decoration:none;">${resolvido.username}</a></strong>`;
    });

    let mentionsPart = '';
    if (linksDeMencao.length === 1) {
      mentionsPart = linksDeMencao[0];
    } else {
      mentionsPart = linksDeMencao.join('<span style="font-weight:normal;">, </span>');
    }

    if (extras > 0) {
      const palavraPessoa = extras === 1 ? 'pessoa' : 'pessoas';
      mentionsPart += `<span style="font-weight:normal;"> e outras </span><strong>${extras}</strong><span style="font-weight:normal;"> ${palavraPessoa}</span>`;
    }

    nameEl.innerHTML = `<strong>${ownerUsername}</strong>${verifiedBadge}` +
      `<span style="font-weight:normal;font-size:0.9em;"> estava com </span>` +
      mentionsPart;
  });
}

function animateHeartLike(carousel, evento) {
  const rect = carousel.getBoundingClientRect();
  const coracao = document.createElement('div');
  coracao.innerHTML = '❤️';
  const posicaoX = evento.clientX - rect.left;
  const posicaoY = evento.clientY - rect.top;
  coracao.style.cssText = `position:absolute;left:${posicaoX}px;top:${posicaoY}px;pointer-events:none;font-size:50px;animation:floatHeart 1.5s ease-out forwards;z-index:1000;`;

  if (!document.getElementById('heart-animation-style')) {
    const estilo = document.createElement('style');
    estilo.id = 'heart-animation-style';
    estilo.textContent = `@keyframes floatHeart{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-100px) scale(0.8)}}`;
    document.head.appendChild(estilo);
  }

  carousel.style.position = 'relative';
  carousel.appendChild(coracao);
  setTimeout(() => coracao.remove(), 1500);
}

async function fetchFriends(uidDoUsuario) {
  try {
    const snap = await getDocs(collection(db, `users/${uidDoUsuario}/friends`));
    return snap.docs.map(docSnap => docSnap.id);
  } catch (error) {
    return [];
  }
}

async function fetchFriendsOfFriends(uidDoUsuario, uidsDeAmigos) {
  const mapaDeSugestoes = new Map();
  const amigosLimitados = uidsDeAmigos.slice(0, 20);

  await Promise.all(amigosLimitados.map(async uidDoAmigo => {
    try {
      const [snapAmigosDoAmigo, dadosDoAmigo] = await Promise.all([
        getDocs(collection(db, `users/${uidDoAmigo}/friends`)),
        getUserCached(uidDoAmigo)
      ]);

      let nomeDoAmigo = uidDoAmigo;
      if (dadosDoAmigo && dadosDoAmigo.username) {
        nomeDoAmigo = dadosDoAmigo.username;
      }

      snapAmigosDoAmigo.docs.forEach(docSnap => {
        const candidatoUid = docSnap.id;
        const jaEhAmigo = uidsDeAmigos.includes(candidatoUid);
        const jaEstaNoMapa = mapaDeSugestoes.has(candidatoUid);

        if (candidatoUid !== uidDoUsuario && !jaEhAmigo && !jaEstaNoMapa) {
          mapaDeSugestoes.set(candidatoUid, nomeDoAmigo);
        }
      });
    } catch (error) {
      console.warn('Falha ao buscar amigos de amigo:', uidDoAmigo);
    }
  }));

  return mapaDeSugestoes;
}

function buildChronologicalFeed(uidDoUsuario, posts, uidsDeAmigos, mapaDeSugestoes) {
  const grupos = { amigos: [], amigosDeAmigos: [], descoberta: [] };

  for (const post of posts) {
    if (!post || post.visible === false) {
      continue;
    }

    const criadorId = post.creatorid;

    if (criadorId === uidDoUsuario || uidsDeAmigos.includes(criadorId)) {
      grupos.amigos.push(Object.assign({}, post, { _feedTipo: 'amigo' }));
    } else if (mapaDeSugestoes.has(criadorId)) {
      grupos.amigosDeAmigos.push(Object.assign({}, post, {
        _feedTipo: 'amigoDosAmigos',
        _sugeridoPor: mapaDeSugestoes.get(criadorId)
      }));
    } else {
      grupos.descoberta.push(Object.assign({}, post, { _feedTipo: 'descoberta' }));
    }
  }

  sortChronological(grupos.amigos);
  sortChronological(grupos.amigosDeAmigos);
  sortChronological(grupos.descoberta);

  const resultado = [];
  let indiceAmigos = 0;
  let indiceAmigosDeAmigos = 0;
  let indiceDescoberta = 0;
  const totalDePosts = posts.filter(post => post && post.visible !== false).length;

  while (resultado.length < totalDePosts) {
    const lote = [];

    for (let i = 0; i < 6 && indiceAmigos < grupos.amigos.length; i++, indiceAmigos++) {
      lote.push(grupos.amigos[indiceAmigos]);
    }
    for (let i = 0; i < 3 && indiceAmigosDeAmigos < grupos.amigosDeAmigos.length; i++, indiceAmigosDeAmigos++) {
      lote.push(grupos.amigosDeAmigos[indiceAmigosDeAmigos]);
    }
    for (let i = 0; i < 1 && indiceDescoberta < grupos.descoberta.length; i++, indiceDescoberta++) {
      lote.push(grupos.descoberta[indiceDescoberta]);
    }

    if (lote.length === 0) {
      break;
    }

    sortChronological(lote);
    resultado.push(...lote);
  }

  return resultado;
}

async function loadPosts() {
  if (loading || !hasMorePosts) {
    return;
  }
  loading = true;

  const isFirst = feed.children.length === 0;

  if (isFirst) {
    const postsEmCache = getPostsCache();
    if (postsEmCache) {
      allItems = sortChronological(postsEmCache.slice());
      allItems.forEach(post => renderPost(post, feed));
    }
  }

  let indicador = document.getElementById('scroll-loading-indicator');
  if (!isFirst && !indicador) {
    indicador = document.createElement('div');
    indicador.id = 'scroll-loading-indicator';
    indicador.style.cssText = 'text-align:center;padding:20px;color:#888;font-size:14px;';
    indicador.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando mais...';
    feed.appendChild(indicador);
  }

  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = isFirst ? 'Carregando...' : 'Carregando mais...';
  }

  try {
    let user = auth.currentUser;
    if (!user) {
      user = await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, usuarioAtual => {
          unsub();
          resolve(usuarioAtual);
        });
      });
    }

    if (!user) {
      loading = false;
      return;
    }

    const currentUid = user.uid;

    let postsQuery;
    if (lastPostSnapshot) {
      postsQuery = query(collection(db, 'posts'), orderBy('create', 'desc'), startAfter(lastPostSnapshot), limit(POSTS_LIMIT));
    } else {
      postsQuery = query(collection(db, 'posts'), orderBy('create', 'desc'), limit(POSTS_LIMIT));
    }

    let promessaDeAmigos;
    if (cachedFriendUids !== null) {
      promessaDeAmigos = Promise.resolve(cachedFriendUids);
    } else {
      promessaDeAmigos = fetchFriends(currentUid);
    }

    const [postsSnap, uidsDeAmigos] = await Promise.all([getDocs(postsQuery), promessaDeAmigos]);

    if (!cachedFriendUids) {
      cachedFriendUids = uidsDeAmigos;
    }

    if (postsSnap.empty) {
      hasMorePosts = false;
      if (loadMoreBtn) {
        loadMoreBtn.textContent = 'Não há mais posts';
        loadMoreBtn.disabled = true;
      }
      if (indicador) {
        indicador.remove();
      }
      loading = false;
      return;
    }

    lastPostSnapshot = postsSnap.docs[postsSnap.docs.length - 1];
    const postsBrutos = postsSnap.docs.map(docSnap => {
      return Object.assign({}, docSnap.data(), { postid: docSnap.id, tipo: 'post' });
    });

    let mapaDeSugestoes = new Map();
    if (uidsDeAmigos.length > 0) {
      mapaDeSugestoes = await fetchFriendsOfFriends(currentUid, uidsDeAmigos);
    }

    const postsOrdenados = buildChronologicalFeed(currentUid, postsBrutos, uidsDeAmigos, mapaDeSugestoes);

    if (isFirst) {
      setPostsCache(postsOrdenados);
      allItems = sortChronological(postsOrdenados.slice());
      feed.innerHTML = '';
      allItems.forEach(post => renderPost(post, feed));
      startSync();
    } else {
      const cacheAtual = getPostsCache();
      const listaAtual = cacheAtual ? cacheAtual : [];
      setPostsCache(sortChronological(listaAtual.concat(postsOrdenados)));
      postsOrdenados.forEach(post => renderPost(post, feed));
    }

    const acabouAPagina = postsSnap.size < POSTS_LIMIT;
    hasMorePosts = !acabouAPagina;

    if (loadMoreBtn) {
      loadMoreBtn.textContent = acabouAPagina ? 'Não há mais posts' : 'Carregar mais';
      loadMoreBtn.disabled = acabouAPagina;
    }
  } catch (error) {
    console.error('Erro ao carregar posts:', error);
    if (loadMoreBtn) {
      loadMoreBtn.textContent = 'Erro ao carregar';
    }
    const indicadorDeErro = document.getElementById('scroll-loading-indicator');
    if (indicadorDeErro) {
      indicadorDeErro.remove();
    }
  }

  const indicadorFinal = document.getElementById('scroll-loading-indicator');
  if (indicadorFinal) {
    indicadorFinal.remove();
  }
  loading = false;
}

function resetFeed() {
  feed.innerHTML = '';
  lastPostSnapshot = null;
  hasMorePosts = true;
  loading = false;
  cachedFriendUids = null;
  clearPostsCache();
}

function compressImage(file, maxWidth, quality) {
  const larguraMaxima = maxWidth ? maxWidth : 1920;
  const qualidade = quality ? quality : 0.8;

  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = reject;

    leitor.onload = evento => {
      const imagem = new Image();
      imagem.onerror = reject;

      imagem.onload = () => {
        let largura = imagem.width;
        let altura = imagem.height;

        if (largura > larguraMaxima) {
          altura = (altura * larguraMaxima) / largura;
          largura = larguraMaxima;
        }

        const canvas = document.createElement('canvas');
        canvas.width = largura;
        canvas.height = altura;
        canvas.getContext('2d').drawImage(imagem, 0, 0, largura, altura);

        canvas.toBlob(blob => {
          const arquivoComprimido = new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() });
          resolve(arquivoComprimido);
        }, 'image/jpeg', qualidade);
      };

      imagem.src = evento.target.result;
    };

    leitor.readAsDataURL(file);
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(file);
  });
}

async function uploadImage(file, userId) {
  try {
    if (!file) {
      throw new Error('Nenhum arquivo selecionado.');
    }
    if (!IMGBB_TYPES.includes(file.type)) {
      throw new Error('Tipo de arquivo não suportado.');
    }
    if (file.size > IMGBB_MAX_SIZE) {
      throw new Error('Arquivo muito grande. Máximo 32MB.');
    }

    let arquivoParaEnviar = file;
    const precisaComprimir = file.type !== 'image/gif' && file.size > 2 * 1024 * 1024;
    if (precisaComprimir) {
      arquivoParaEnviar = await compressImage(file);
    }

    const resultadoBase64 = await fileToBase64(arquivoParaEnviar);
    const base64 = resultadoBase64.split(',')[1];

    const formulario = new FormData();
    formulario.append('image', base64);
    formulario.append('name', `post_${userId}_${Date.now()}`);

    const resposta = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formulario
    });

    if (!resposta.ok) {
      throw new Error('Erro na conexão com o ImgBB');
    }

    const dados = await resposta.json();
    if (!dados.success) {
      const mensagemDeErro = dados.error && dados.error.message ? dados.error.message : 'Erro ao fazer upload';
      throw new Error(mensagemDeErro);
    }

    return { success: true, url: dados.data.url, deleteUrl: dados.data.delete_url };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function uploadWithRetry(file, userId, tentativas) {
  const totalDeTentativas = tentativas ? tentativas : 3;

  for (let tentativa = 0; tentativa < totalDeTentativas; tentativa++) {
    if (tentativa > 0) {
      await sleep(1000 * tentativa);
    }

    const resultado = await uploadImage(file, userId);
    if (resultado.success) {
      return resultado;
    }
  }

  return { success: false, error: 'Falhou após várias tentativas' };
}

function createProgressBar() {
  if (!document.getElementById('plb-style')) {
    const estilo = document.createElement('style');
    estilo.id = 'plb-style';
    estilo.textContent = `#post-loading-bar{position:fixed;bottom:80px;left:0;width:100%;height:3px;background:var(--bg-primary);z-index:99997}#post-loading-bar .plb-inner{height:100%;width:0%;background:linear-gradient(90deg,#4A90E2,#4A90E2);transition:width 0.4s ease}`;
    document.head.appendChild(estilo);
  }

  const barraAntiga = document.getElementById('post-loading-bar');
  if (barraAntiga) {
    barraAntiga.remove();
  }

  const barra = document.createElement('div');
  barra.id = 'post-loading-bar';
  barra.innerHTML = '<div class="plb-inner"></div>';
  document.body.appendChild(barra);
  return barra;
}

function advanceBar(barra, porcentagem) {
  if (!barra) {
    return;
  }
  const parteInterna = barra.querySelector('.plb-inner');
  if (parteInterna) {
    parteInterna.style.width = porcentagem + '%';
  }
}

function removeBar(barra) {
  if (!barra) {
    return;
  }
  advanceBar(barra, 100);
  setTimeout(() => barra.remove(), 400);
}

async function submitPost(user, text, imageFiles) {
  let arquivos = [];
  if (Array.isArray(imageFiles)) {
    arquivos = imageFiles.filter(Boolean);
  } else if (imageFiles) {
    arquivos = [imageFiles];
  }

  if (!text && arquivos.length === 0) {
    alert('Escreva algo ou adicione uma imagem!');
    return;
  }

  const postLayer = document.getElementById('postLayer');
  if (postLayer) {
    postLayer.classList.remove('active');
  }
  const feedPage = document.getElementById('feedPage');
  if (feedPage) {
    feedPage.classList.remove('closed');
  }
  document.body.style.overflow = '';

  const mentionsSnapshot = selectedMentions.slice();
  clearPostInputs();

  const barra = createProgressBar();
  advanceBar(barra, 10);

  try {
    const postId = generateId('post');
    const urls = [];
    const deleteUrls = [];

    if (arquivos.length > 0) {
      const incrementoPorArquivo = 50 / arquivos.length;

      for (let i = 0; i < arquivos.length; i++) {
        advanceBar(barra, 10 + incrementoPorArquivo * i);
        if (i > 0) {
          await sleep(800);
        }

        const resultado = await uploadWithRetry(arquivos[i], user.uid);
        if (!resultado.success) {
          removeBar(barra);
          alert('Erro no upload: ' + resultado.error);
          return;
        }

        urls.push(resultado.url);
        deleteUrls.push(resultado.deleteUrl);
      }

      advanceBar(barra, 70);
    } else {
      advanceBar(barra, 60);
    }

    const inputDeLocalizacao = document.getElementById('add-location');
    let localizacao = '';
    if (inputDeLocalizacao && inputDeLocalizacao.value) {
      localizacao = inputDeLocalizacao.value.trim();
      inputDeLocalizacao.value = '';
    }

    const postData = {
      content: text,
      img: urls.length === 1 ? urls[0] : '',
      imgs: urls.length > 1 ? urls : [],
      imgDeleteUrl: deleteUrls.length === 1 ? deleteUrls[0] : '',
      imgDeleteUrls: deleteUrls.length > 1 ? deleteUrls : [],
      likes: 0,
      saves: 0,
      comentarios: 0,
      postid: postId,
      creatorid: user.uid,
      reports: 0,
      visible: true,
      create: serverTimestamp(),
      mentions: mentionsSnapshot.map(mencao => mencao.uid)
    };

    if (localizacao) {
      postData.location = localizacao;
    }

    advanceBar(barra, 85);
    await setDoc(doc(db, 'posts', postId), postData);

    triggerNovoPost(postId).catch(error => console.warn('Falha ao notificar novo post:', error));

    advanceBar(barra, 100);
    setTimeout(() => removeBar(barra), 400);

    resetFeed();
    await loadPosts();
  } catch (error) {
    console.error('Erro ao enviar post:', error);
    removeBar(barra);
    alert('Erro ao enviar post: ' + error.message);
  }
}

async function handleSendPost() {
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  const conteudoAtivo = document.querySelector('.post-content-type.active');
  let textarea = null;
  if (conteudoAtivo) {
    textarea = conteudoAtivo.querySelector('.np-text-input');
  }
  if (!textarea) {
    textarea = document.querySelector('.np-text-input');
  }

  const texto = textarea && textarea.value ? textarea.value.trim() : '';
  await submitPost(user, texto, postImageFiles);
}

async function openCommentsModal(postId, creatorId) {
  const modalAntigo = document.querySelector('.mobile-comments-modal');
  if (modalAntigo) {
    modalAntigo.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'mobile-comments-modal';
  modal.innerHTML = `
    <div class="mobile-comments-content">
      <div class="modal-comments-header">
        <div class="modal-grab"></div>
      </div>
      <div class="modal-comments-list-container">
        <div class="comments-list-mobile" data-post-id="${postId}"></div>
      </div>
      <div class="mobile-comment-form-container">
        <div class="comment-form">
          <input type="text" class="comment-input-mobile" placeholder="Escreva um comentário..." data-post-id="${postId}">
          <button class="comment-submit-mobile" data-post-id="${postId}">
            <svg xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 404 511.5"><path fill-rule="nonzero" d="m219.24 72.97.54 438.53h-34.95l-.55-442.88L25.77 241.96 0 218.39 199.73 0 404 222.89l-25.77 23.58z"/></svg>
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);

  const posicaoDeScroll = window.scrollY;
  Object.assign(document.body.style, {
    overflow: 'hidden',
    position: 'fixed',
    width: '100%',
    top: `-${posicaoDeScroll}px`
  });

  requestAnimationFrame(() => modal.classList.add('active'));

  modal.addEventListener('click', evento => {
    if (evento.target === modal) {
      closeCommentsModal();
    }
  });

  const conteudo = modal.querySelector('.mobile-comments-content');
  const alcaDeArrasto = modal.querySelector('.modal-grab');
  const cabecalho = modal.querySelector('.modal-comments-header');

  let posicaoInicialY = 0;
  let posicaoAtualY = 0;
  let arrastandoModal = false;

  function iniciarArrasto(evento) {
    posicaoInicialY = evento.touches[0].clientY;
    arrastandoModal = true;
    conteudo.style.transition = 'none';
  }

  function moverArrasto(evento) {
    if (!arrastandoModal) {
      return;
    }
    posicaoAtualY = evento.touches[0].clientY;
    const diferenca = posicaoAtualY - posicaoInicialY;
    if (diferenca > 0) {
      conteudo.style.transform = `translateY(${diferenca}px)`;
      modal.style.backgroundColor = `rgba(0,0,0,${Math.max(0, 1 - diferenca / 300) * 0.5})`;
    }
  }

  function terminarArrasto() {
    if (!arrastandoModal) {
      return;
    }
    arrastandoModal = false;
    conteudo.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';

    if (posicaoAtualY - posicaoInicialY > 150) {
      closeCommentsModal();
    } else {
      conteudo.style.transform = 'translateY(0)';
      modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
    }
  }

  [alcaDeArrasto, cabecalho].forEach(elemento => {
    elemento.addEventListener('touchstart', iniciarArrasto);
    elemento.addEventListener('touchmove', moverArrasto);
    elemento.addEventListener('touchend', terminarArrasto);
  });

  const listaDeComentarios = modal.querySelector('.comments-list-mobile');
  await renderComments(postId, listaDeComentarios);

  async function enviarComentario(input) {
    const texto = input.value.trim();
    if (!texto) {
      return;
    }

    const sucesso = await addComment(postId, texto);
    if (sucesso) {
      triggerNovoComentario(postId, creatorId).catch(error => console.warn('Falha ao notificar comentário:', error));
      input.value = '';
      invalidateCommentsCache(postId);
      await renderComments(postId, listaDeComentarios);

      const spanContador = document.querySelector(`.btn-comment[data-id="${postId}"] span`);
      if (spanContador) {
        spanContador.textContent = await countComments(postId);
      }
    }
  }

  const botaoEnviar = modal.querySelector('.comment-submit-mobile');
  const inputDeComentario = modal.querySelector('.comment-input-mobile');

  botaoEnviar.addEventListener('click', () => enviarComentario(inputDeComentario));
  inputDeComentario.addEventListener('keypress', evento => {
    if (evento.key === 'Enter') {
      evento.preventDefault();
      enviarComentario(evento.target);
    }
  });
}

function closeCommentsModal() {
  const modal = document.querySelector('.mobile-comments-modal');
  if (!modal) {
    return;
  }

  const conteudo = modal.querySelector('.mobile-comments-content');
  conteudo.style.transition = 'transform 0.3s ease';
  conteudo.style.transform = 'translateY(100%)';
  modal.style.opacity = '0';

  setTimeout(() => {
    const scrollGuardado = document.body.style.top;
    modal.remove();
    Object.assign(document.body.style, { position: '', top: '', width: '', overflow: '' });
    const valorDoScroll = scrollGuardado ? parseInt(scrollGuardado) : 0;
    window.scrollTo(0, valorDoScroll * -1);
  }, 300);
}

window.fecharModalComentarios = closeCommentsModal;

function openBottomMenu(postId, ownerId, postElement) {
  const menu = document.querySelector('.menu-bottom-layer');
  const user = auth.currentUser;
  if (!menu || !user) {
    return;
  }

  currentMenuPost = { postId: postId, ownerId: ownerId, postElement: postElement ? postElement : null };
  const isOwn = user.uid === ownerId;

  menu.querySelectorAll('.menu-bottom-btn').forEach(botao => {
    const acao = botao.dataset.action;

    if (acao === 'delete') {
      botao.style.display = isOwn ? 'block' : 'none';
    } else if (acao === 'report') {
      botao.style.display = isOwn ? 'none' : 'block';
    } else {
      botao.style.display = 'block';
    }
  });

  menu.classList.add('active');
  document.body.classList.add('menu-bottom-open');
}

function closeBottomMenu() {
  const menu = document.querySelector('.menu-bottom-layer');
  if (!menu) {
    return;
  }

  menu.classList.add('closing');
  setTimeout(() => {
    menu.classList.remove('active', 'closing');
    document.body.classList.remove('menu-bottom-open');
    currentMenuPost = null;
  }, 300);
}

function setupBottomMenuListeners() {
  const menu = document.querySelector('.menu-bottom-layer');
  if (!menu) {
    return;
  }

  menu.addEventListener('click', async evento => {
    if (evento.target === menu) {
      closeBottomMenu();
      return;
    }

    const botao = evento.target.closest('.menu-bottom-btn');
    if (!botao || !currentMenuPost) {
      return;
    }

    const postId = currentMenuPost.postId;
    const ownerId = currentMenuPost.ownerId;
    const postElement = currentMenuPost.postElement;
    const acao = botao.dataset.action;

    closeBottomMenu();

    if (acao === 'delete') {
      await handleDeletePost(postId, ownerId, postElement);
    }
    if (acao === 'report') {
      await handleReportPost(postId, ownerId);
    }
  });
}

async function deleteAllDocsInSubcollection(caminho) {
  const snap = await getDocs(collection(db, caminho));
  const exclusoes = snap.docs.map(docSnap => deleteDoc(doc(db, caminho, docSnap.id)));
  await Promise.all(exclusoes);
}

async function handleDeletePost(postId, ownerId, postElement) {
  const user = auth.currentUser;
  if (!user || user.uid !== ownerId || !postId) {
    return;
  }

  let elemento = postElement;
  if (!elemento) {
    elemento = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  }

  if (elemento) {
    Object.assign(elemento.style, {
      transition: 'opacity 0.3s ease,transform 0.3s ease',
      opacity: '0',
      transform: 'translateY(-16px)'
    });
    setTimeout(() => elemento.remove(), 300);
  }

  clearPostsCache();
  allItems = allItems.filter(item => item.postid !== postId);

  try {
    await deleteAllDocsInSubcollection(`posts/${postId}/likers`);
    await deleteAllDocsInSubcollection(`posts/${postId}/coments`);

    await Promise.all([
      deleteDoc(doc(db, 'posts', postId)),
      deleteDoc(doc(db, 'users', ownerId, 'posts', postId))
    ]);
  } catch (error) {
    console.error('Erro ao excluir post:', error);
  }
}

async function handleReportPost(postId, ownerId, reason) {
  const user = auth.currentUser;
  if (!user) {
    return;
  }

  const motivoFinal = reason ? reason : 'other';

  try {
    const reportId = `report_${Date.now()}`;
    await setDoc(doc(db, 'reports', reportId), {
      reportId: reportId,
      type: 'post',
      targetId: postId,
      targetOwnerId: ownerId,
      reportedBy: user.uid,
      reason: motivoFinal,
      timestamp: serverTimestamp(),
      status: 'pending'
    });
    alert('Denúncia enviada com sucesso!');
  } catch (error) {
    console.error('Erro ao denunciar:', error);
    alert('Erro ao enviar denúncia');
  }
}

async function loadMentionFriends() {
  const user = auth.currentUser;
  if (!user) {
    return [];
  }

  if (mentionFriendsList.length > 0) {
    return mentionFriendsList;
  }

  try {
    const snap = await getDocs(collection(db, `users/${user.uid}/friends`));
    const uids = snap.docs.map(docSnap => docSnap.id);

    const perfis = await Promise.all(uids.map(async uidDoAmigo => {
      const dados = await getUserCached(uidDoAmigo);
      if (!dados) {
        return null;
      }
      let username = uidDoAmigo;
      if (dados.username) username = dados.username;
      else if (dados.displayname) username = dados.displayname;

      return {
        uid: uidDoAmigo,
        username: username,
        userphoto: dados.userphoto ? dados.userphoto : DEFAULT_AVATAR
      };
    }));

    mentionFriendsList = perfis.filter(Boolean).sort((a, b) => a.username.localeCompare(b.username));
  } catch (error) {
    mentionFriendsList = [];
  }

  return mentionFriendsList;
}

function renderMentionList(amigos, termoDeBusca) {
  const linha = document.querySelector('.users-list-modal-row');
  if (!linha) {
    return;
  }

  const busca = termoDeBusca ? termoDeBusca : '';
  let filtrados = amigos;

  if (busca) {
    filtrados = amigos.filter(amigo => amigo.username.toLowerCase().includes(busca.toLowerCase()));
  }

  linha.innerHTML = '';

  if (filtrados.length === 0) {
    const mensagem = busca ? 'Nenhum amigo encontrado' : 'Você ainda não tem amigos para mencionar';
    linha.innerHTML = `<div style="text-align:center;padding:32px 16px;color:#555;font-size:14px;">${mensagem}</div>`;
    return;
  }

  filtrados.forEach(amigo => {
    const estaSelecionado = selectedMentions.some(mencao => mencao.uid === amigo.uid);

    const caixa = document.createElement('div');
    caixa.className = 'user-list-box';
    caixa.dataset.uid = amigo.uid;
    caixa.innerHTML = `
      <div class="user-list-img">
        <img src="${amigo.userphoto}" alt="${amigo.username}" class="user-list-avatar" onerror="this.src='${DEFAULT_AVATAR}'">
        <div class="selected-dot${estaSelecionado ? ' active' : ''}">
          <svg fill="#212327" viewBox="-3.13 -3.13 84.63 84.63" xmlns="http://www.w3.org/2000/svg" stroke="#212327" stroke-width="3.13476">
            <path d="M78.049,19.015L29.458,67.606c-0.428,0.428-1.121,0.428-1.548,0L0.32,40.015c-0.427-0.426-0.427-1.119,0-1.547l6.704-6.704c0.428-0.427,1.121-0.427,1.548,0l20.113,20.112l41.113-41.113c0.429-0.427,1.12-0.427,1.548,0l6.703,6.704C78.477,17.894,78.477,18.586,78.049,19.015z"/>
          </svg>
        </div>
      </div>
      <div class="user-list-info">
        <div class="user-list-name">${amigo.username}</div>
      </div>`;

    caixa.addEventListener('click', () => {
      const indice = selectedMentions.findIndex(mencao => mencao.uid === amigo.uid);
      const pontoSelecionado = caixa.querySelector('.selected-dot');

      if (indice >= 0) {
        selectedMentions.splice(indice, 1);
        pontoSelecionado.classList.remove('active');
      } else {
        selectedMentions.push(amigo);
        pontoSelecionado.classList.add('active');
      }
    });

    linha.appendChild(caixa);
  });
}

function updateMentionBtnDot() {
  const botao = document.getElementById('btnMention');
  if (!botao) {
    return;
  }
  const ponto = botao.querySelector('.np-btn-dot');
  if (ponto) {
    ponto.style.display = selectedMentions.length > 0 ? 'block' : 'none';
  }
}

function setupMentionModal() {
  const overlay = document.getElementById('overlayMention');
  const botaoAbrir = document.getElementById('btnMention');
  const botaoConfirmar = document.getElementById('confirm-mention');
  const botaoCancelar = document.getElementById('cancel-mention');
  const inputDeBusca = document.getElementById('search-mention');

  if (!overlay || !botaoAbrir) {
    return;
  }

  if (!botaoAbrir.querySelector('.np-btn-dot')) {
    const ponto = document.createElement('span');
    ponto.className = 'np-btn-dot';
    botaoAbrir.style.position = 'relative';
    botaoAbrir.appendChild(ponto);
  }

  botaoAbrir.addEventListener('click', async () => {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    const linha = document.querySelector('.users-list-modal-row');
    if (linha) {
      linha.innerHTML = `<div style="text-align:center;padding:40px;color:#555;"><i class="fas fa-spinner fa-spin" style="font-size:22px;"></i></div>`;
    }

    const amigos = await loadMentionFriends();
    if (inputDeBusca) {
      inputDeBusca.value = '';
    }
    renderMentionList(amigos);
  });

  if (inputDeBusca) {
    inputDeBusca.addEventListener('input', () => {
      renderMentionList(mentionFriendsList, inputDeBusca.value);
    });
  }

  if (botaoConfirmar) {
    botaoConfirmar.addEventListener('click', () => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
      updateMentionBtnDot();
    });
  }

  if (botaoCancelar) {
    botaoCancelar.addEventListener('click', () => {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  overlay.addEventListener('click', evento => {
    if (evento.target === overlay) {
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }
  });
}

function clearPostInputs() {
  document.querySelectorAll('.np-text-input').forEach(input => {
    input.value = '';
    const contador = input.parentElement ? input.parentElement.querySelector('.char-counter') : null;
    if (contador) {
      contador.textContent = `0/${input.getAttribute('maxlength')}`;
      contador.classList.remove('limit');
    }
  });

  postImageFiles = [];
  renderCarouselPreviews();

  const inputDeLocalizacao = document.getElementById('add-location');
  if (inputDeLocalizacao) {
    inputDeLocalizacao.value = '';
  }

  const botaoLocal = document.getElementById('btnLocal');
  if (botaoLocal) {
    const ponto = botaoLocal.querySelector('.np-btn-dot');
    if (ponto) {
      ponto.style.display = 'none';
    }
  }

  const areaDeArquivo = document.getElementById('post-file-input');
  if (areaDeArquivo) {
    areaDeArquivo.style.display = '';
  }

  selectedMentions = [];
  updateMentionBtnDot();
}

function addImageToCarousel(file) {
  if (!file || !file.type.startsWith('image/')) {
    return;
  }
  if (postImageFiles.length >= MAX_IMAGES) {
    alert(`Máximo de ${MAX_IMAGES} imagens atingido.`);
    return;
  }
  postImageFiles.push(file);
  renderCarouselPreviews();
}

function renderCarouselPreviews() {
  const carrossel = document.querySelector('.image-preview-carrosel');
  if (!carrossel) {
    return;
  }

  carrossel.innerHTML = '';

  if (postImageFiles.length === 0) {
    carrossel.classList.remove('visible');
    return;
  }

  carrossel.classList.add('visible');

  postImageFiles.forEach((file, indice) => {
    const div = document.createElement('div');
    div.className = 'img-preview';
    div.dataset.index = indice;
    div.innerHTML = `<img src="" alt="Preview ${indice + 1}"><button class="remove-image" type="button"><i class="fas fa-times"></i></button>`;
    carrossel.appendChild(div);

    const leitor = new FileReader();
    leitor.onload = evento => {
      div.querySelector('img').src = evento.target.result;
    };
    leitor.readAsDataURL(file);
  });

  const botaoAdicionar = document.getElementById('np-add-img');
  if (botaoAdicionar) {
    if (postImageFiles.length >= MAX_IMAGES) {
      botaoAdicionar.textContent = `Máximo atingido (${MAX_IMAGES})`;
    } else {
      botaoAdicionar.textContent = `Adicionar Imagem (${postImageFiles.length}/${MAX_IMAGES})`;
    }
  }
}

function setupPostLayer() {
  const camada = document.getElementById('postLayer');
  if (!camada) {
    return;
  }

  const paginaDoFeed = document.getElementById('feedPage');

  function abrirCamada(tipo) {
    const tipoFinal = tipo ? tipo : 'post';

    document.querySelectorAll('.post-type-tab').forEach(aba => aba.classList.remove('active'));
    document.querySelectorAll('.post-content-type').forEach(conteudo => conteudo.classList.remove('active'));

    const abaAtiva = document.querySelector(`.post-type-tab[data-type="${tipoFinal}"]`);
    if (abaAtiva) {
      abaAtiva.classList.add('active');
    }

    const conteudoAtivo = document.querySelector(`.post-content-type[data-type="${tipoFinal}"]`);
    if (conteudoAtivo) {
      conteudoAtivo.classList.add('active');
    }

    const user = auth.currentUser;
    if (user) {
      getUserCached(user.uid).then(dados => {
        const avatar = camada.querySelector('.np-avatar');
        const nomeEl = camada.querySelector('.np-username');

        if (avatar && dados && dados.userphoto) {
          avatar.src = dados.userphoto;
        }
        if (nomeEl) {
          let nome = '';
          if (dados && dados.username) nome = dados.username;
          else if (dados && dados.displayname) nome = dados.displayname;
          nomeEl.textContent = nome;
        }
      });
    }

    camada.classList.add('active');
    if (paginaDoFeed) {
      paginaDoFeed.classList.add('closed');
    }
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
      const areaAtiva = camada.querySelector('.post-content-type.active .np-text-input');
      if (areaAtiva) {
        areaAtiva.focus();
      }
    }, 150);
  }

  function fecharCamada() {
    camada.classList.remove('active');
    if (paginaDoFeed) {
      paginaDoFeed.classList.remove('closed');
    }
    document.body.style.overflow = '';
    clearPostInputs();

    const previewDeImagem = document.querySelector('.image-preview-container');
    if (previewDeImagem) {
      previewDeImagem.remove();
    }
  }

  const botaoFechar = document.getElementById('closeLayerBtn');
  if (botaoFechar) {
    botaoFechar.addEventListener('click', fecharCamada);
  }

  camada.addEventListener('click', evento => {
    if (evento.target === camada) {
      fecharCamada();
    }
  });

  document.addEventListener('keydown', evento => {
    if (evento.key === 'Escape' && camada.classList.contains('active')) {
      fecharCamada();
    }
  });

  const botaoAbrirNav = document.getElementById('openPostLayerNav');
  if (botaoAbrirNav) {
    botaoAbrirNav.addEventListener('click', () => abrirCamada('post'));
  }

  const botaoAbrir = document.getElementById('openPostLayer');
  if (botaoAbrir) {
    botaoAbrir.addEventListener('click', () => abrirCamada('post'));
  }

  const botaoDaSidebar = document.querySelector('.sidebar .postmodal');
  if (botaoDaSidebar) {
    botaoDaSidebar.removeAttribute('onclick');
    botaoDaSidebar.addEventListener('click', evento => {
      evento.preventDefault();
      abrirCamada('post');
    });
  }

  window.abrirPostModal = () => abrirCamada('post');
  window.fecharPostModal = fecharCamada;

  let inputDeArquivo = document.getElementById('post-layer-file-input');
  if (!inputDeArquivo) {
    inputDeArquivo = document.createElement('input');
    inputDeArquivo.type = 'file';
    inputDeArquivo.id = 'post-layer-file-input';
    inputDeArquivo.accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp';
    inputDeArquivo.style.display = 'none';
    document.body.appendChild(inputDeArquivo);
  }

  function aplicarPreview(file) {
    if (!file || !IMGBB_TYPES.includes(file.type)) {
      return;
    }
    addImageToCarousel(file);
  }

  const botaoDeArquivo = document.getElementById('post-file-input');
  if (botaoDeArquivo) {
    botaoDeArquivo.addEventListener('click', () => inputDeArquivo.click());
  }

  let caixaDeArquivo = null;
  if (botaoDeArquivo) {
    caixaDeArquivo = botaoDeArquivo.closest('.file-box');
  }
  if (!caixaDeArquivo) {
    caixaDeArquivo = botaoDeArquivo;
  }

  if (caixaDeArquivo) {
    caixaDeArquivo.addEventListener('dragover', evento => {
      evento.preventDefault();
      caixaDeArquivo.classList.add('drag-over');
    });

    caixaDeArquivo.addEventListener('dragleave', () => {
      caixaDeArquivo.classList.remove('drag-over');
    });

    caixaDeArquivo.addEventListener('drop', evento => {
      evento.preventDefault();
      caixaDeArquivo.classList.remove('drag-over');
      Array.from(evento.dataTransfer.files).forEach(aplicarPreview);
    });
  }

  inputDeArquivo.addEventListener('change', evento => {
    Array.from(evento.target.files).forEach(aplicarPreview);
    inputDeArquivo.value = '';
  });
}

function initPostTypeSystem() {
  document.querySelectorAll('.np-text-input').forEach(area => {
    area.addEventListener('input', () => {
      const contador = area.parentElement ? area.parentElement.querySelector('.char-counter') : null;
      if (!contador) {
        return;
      }
      const maximo = parseInt(area.getAttribute('maxlength'));
      contador.textContent = `${area.value.length}/${maximo}`;
      contador.classList.toggle('limit', area.value.length >= maximo * 0.9);
    });
  });

  const botaoAdicionarImagem = document.getElementById('np-add-img');
  if (botaoAdicionarImagem) {
    botaoAdicionarImagem.addEventListener('click', () => {
      if (postImageFiles.length >= MAX_IMAGES) {
        alert(`Máximo de ${MAX_IMAGES} imagens atingido.`);
        return;
      }

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.multiple = true;
      input.onchange = evento => Array.from(evento.target.files).forEach(addImageToCarousel);
      input.click();
    });
  }

  const carrosselDePreview = document.querySelector('.image-preview-carrosel');
  if (carrosselDePreview) {
    carrosselDePreview.addEventListener('click', evento => {
      const botaoRemover = evento.target.closest('.remove-image');
      if (!botaoRemover) {
        return;
      }

      const itemPai = botaoRemover.closest('.img-preview');
      const indice = itemPai ? parseInt(itemPai.dataset.index) : -1;

      if (indice >= 0) {
        postImageFiles.splice(indice, 1);
        renderCarouselPreviews();
      }
    });
  }

  const botaoPostar = document.getElementById('btn-post');
  if (botaoPostar) {
    botaoPostar.addEventListener('click', async () => {
      const user = auth.currentUser;
      const areaDeTexto = document.querySelector('.np-text-input');
      const texto = areaDeTexto && areaDeTexto.value ? areaDeTexto.value.trim() : '';
      await submitPost(user, texto, postImageFiles);
    });
  }
}

function loadProfilePhoto(user) {
  const fotoDaNav = document.getElementById('nav-pic');
  const fotoEmCache = localStorage.getItem('user_photo_cache');

  if (fotoEmCache && fotoDaNav) {
    fotoDaNav.src = fotoEmCache;
  }

  if (!user) {
    if (fotoDaNav) {
      fotoDaNav.src = DEFAULT_AVATAR;
    }
    localStorage.removeItem('user_photo_cache');
    return;
  }

  (async () => {
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/user-infos/user-media`));

      if (snap.exists()) {
        let foto = DEFAULT_AVATAR;
        if (snap.data().userphoto) {
          foto = snap.data().userphoto;
        }

        if (foto !== fotoEmCache && fotoDaNav) {
          fotoDaNav.src = foto;
          localStorage.setItem('user_photo_cache', foto);
        }
      } else {
        if (fotoDaNav) {
          fotoDaNav.src = DEFAULT_AVATAR;
        }
        localStorage.removeItem('user_photo_cache');
      }
    } catch (error) {
      if (!fotoEmCache && fotoDaNav) {
        fotoDaNav.src = DEFAULT_AVATAR;
      }
    }
  })();
}

function getGreeting() {
  const agora = new Date();
  const hora = agora.getHours();
  const minuto = agora.getMinutes();

  if (hora >= 6 && hora < 12) {
    return 'Bom dia';
  }
  if ((hora >= 13 && hora < 18) || (hora === 18 && minuto < 30)) {
    return 'Boa tarde';
  }
  return 'Boa noite';
}

async function updateGreeting(userParam) {
  const user = userParam ? userParam : auth.currentUser;
  if (!user) {
    return;
  }

  const saudacao = getGreeting();
  const elementoDeSaudacao = document.getElementById('greeting');
  if (elementoDeSaudacao) {
    elementoDeSaudacao.textContent = saudacao;
  }

  const chave = `user_cache_${user.uid}`;
  let dadosDoUsuario = cacheGet(chave);

  if (!dadosDoUsuario || cacheExpired(chave)) {
    if (!dadosDoUsuario) {
      dadosDoUsuario = await fetchUser(user.uid);
      if (dadosDoUsuario) {
        cacheSet(chave, dadosDoUsuario, CACHE.USERS_TTL);
      }
    } else {
      fetchUser(user.uid).then(dados => {
        if (dados) {
          cacheSet(chave, dados, CACHE.USERS_TTL);
        }
      }).catch(() => {});
    }
  }

  const elementoDeSaudacaoFinal = document.getElementById('greeting');
  const elementoDeUsername = document.getElementById('username');
  const elementoDeFoto = document.querySelector('.user-welcome img') || document.querySelector('.welcome-box img');

  let nome = '';
  if (dadosDoUsuario && dadosDoUsuario.username) nome = dadosDoUsuario.username;
  else if (dadosDoUsuario && dadosDoUsuario.displayname) nome = dadosDoUsuario.displayname;
  else if (dadosDoUsuario && dadosDoUsuario.name) nome = dadosDoUsuario.name;

  let foto = DEFAULT_AVATAR;
  if (dadosDoUsuario && dadosDoUsuario.userphoto) {
    foto = dadosDoUsuario.userphoto;
  } else {
    foto = resolvePhoto();
  }

  if (elementoDeSaudacaoFinal) {
    elementoDeSaudacaoFinal.textContent = saudacao;
  }
  if (elementoDeUsername) {
    elementoDeUsername.textContent = nome;
  }
  if (elementoDeFoto && foto !== DEFAULT_AVATAR) {
    elementoDeFoto.src = foto;
    elementoDeFoto.onerror = () => { elementoDeFoto.src = DEFAULT_AVATAR; };
  }
}

function setupEventListeners() {
  if (postButton) {
    postButton.addEventListener('click', handleSendPost);
  }

  if (postInput) {
    postInput.addEventListener('keypress', evento => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        handleSendPost();
      }
    });
  }

  if (feed) {
    feed.addEventListener('click', async evento => {
      const botaoLike = evento.target.closest('.btn-like');
      const botaoComentar = evento.target.closest('.btn-comment');
      const infoDoUsuario = evento.target.closest('.user-info');
      const botaoMais = evento.target.closest('.more-options-button');
      const envioDeComentario = evento.target.closest('.comment-submit');

      if (botaoLike) {
        const uidDoUsuario = auth.currentUser ? auth.currentUser.uid : null;
        if (uidDoUsuario) {
          await toggleLike(uidDoUsuario, botaoLike.dataset.id, botaoLike);
        }
      }

      if (botaoComentar) {
        openCommentsModal(botaoComentar.dataset.id, botaoComentar.dataset.username);
      }

      if (infoDoUsuario && !evento.target.closest('.more-options-button')) {
        const link = infoDoUsuario.querySelector('.user-name-link');
        if (link && link.dataset.username) {
          window.location.href = `profile.html?userid=${encodeURIComponent(link.dataset.username)}`;
        }
        return;
      }

      if (botaoMais) {
        const card = botaoMais.closest('.post-card');
        const botaoLikeDoCard = card ? card.querySelector('.btn-like') : null;
        const postId = botaoLikeDoCard ? botaoLikeDoCard.dataset.id : null;
        const ownerId = botaoLikeDoCard ? botaoLikeDoCard.dataset.username : null;

        if (postId && ownerId) {
          openBottomMenu(postId, ownerId, card);
        }
      }

      if (envioDeComentario) {
        const username = envioDeComentario.dataset.username;
        const postId = envioDeComentario.dataset.postId;
        const input = document.querySelector(`input[data-username="${username}"][data-post-id="${postId}"]`);

        if (input && input.value.trim()) {
          const sucesso = await addComment(postId, input.value.trim());
          if (sucesso) {
            input.value = '';
            const secaoDeComentarios = envioDeComentario.closest('.comments-section');
            const listaDeComentarios = secaoDeComentarios ? secaoDeComentarios.querySelector('.comments-list') : null;
            await renderComments(postId, listaDeComentarios);
          }
        }
      }
    });
  }

  document.addEventListener('click', evento => {
    if (evento.target.classList.contains('comentario-nome') && evento.target.dataset.username) {
      window.location.href = `profile.html?userid=${encodeURIComponent(evento.target.dataset.username)}`;
    }
  });
}

function autoUpdateDates() {
  setInterval(() => {
    document.querySelectorAll('.post-date-mobile').forEach(elemento => {
      const card = elemento.closest('.post-card');
      const botaoLike = card ? card.querySelector('.btn-like') : null;
      if (!botaoLike) {
        return;
      }

      const item = allItems.find(itemDoFeed => itemDoFeed.postid === botaoLike.dataset.id);
      if (item && item.create) {
        elemento.textContent = formatRelativeDate(item.create);
      }
    });
  }, 60000);
}

window.addEventListener('DOMContentLoaded', async () => {
  feed = document.getElementById('feed');
  loadMoreBtn = document.getElementById('load-more-btn');
  postInput = document.querySelector('.post-box input[type="text"]');
  postButton = document.querySelector('.post-button');

  loadProfilePhoto(null);

  const user = await waitForAuth();

  loadProfilePhoto(user);
  await updateGreeting(user);
  setupPostLayer();
  initPostTypeSystem();
  setupMentionModal();
  setupEventListeners();
  setupBottomMenuListeners();
  setupInfiniteScroll();
  await loadPosts();
  autoUpdateDates();
});

window.addEventListener('beforeunload', stopSync);
window.addEventListener('pagehide', stopSync);

onAuthStateChanged(auth, async user => {
  if (!user) {
    return;
  }

  try {
    await registerPushNotifications(user.uid);
    listenForegroundMessages();
  } catch (error) {
    console.warn('[FCM] Falha ao registrar notificações:', error);
  }
});