// ============================================================
// IMPORTS FIREBASE
// ============================================================
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
import {
  toggleSalvarPost,
  verificarSeEstaSalvo
} from './save-posts.js';


// ============================================================
// CONFIGURAÇÃO DO FIREBASE
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

const IMGBB_API_KEY = 'fc8497dcdf559dc9cbff97378c82344c';


// ============================================================
// VARIÁVEIS GLOBAIS
// ============================================================
const feed        = document.getElementById('feed');
const loadMoreBtn = document.getElementById('load-more-btn');

const POSTS_LIMIT = 10;
let lastPostSnapshot = null;
let allItems         = [];
let loading          = false;
let hasMorePosts     = true;

// guarda a imagem que o usuário selecionou no modal
let imagemSelecionada = null;


// ============================================================
// CACHE
// ============================================================
const CACHE_CONFIG = {
  POSTS_TTL:             5  * 60 * 1000,
  BUBBLES_TTL:           3  * 60 * 1000,
  CHECK_UPDATE_INTERVAL: 2  * 60 * 1000,
  MAX_CACHED_POSTS:      100,
  MAX_CACHED_BUBBLES:    50
};
const CACHE_USER_TIME = 10 * 60 * 1000;
let cacheCheckTimer   = null;

function getPostsCache() {
  try {
    const cached = localStorage.getItem('feed_posts_cache');
    if (!cached) return null;
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_CONFIG.POSTS_TTL) {
      localStorage.removeItem('feed_posts_cache');
      return null;
    }
    return data.posts;
  } catch { return null; }
}

function setPostsCache(posts) {
  try {
    localStorage.setItem('feed_posts_cache', JSON.stringify({
      timestamp: Date.now(),
      posts: posts.slice(0, CACHE_CONFIG.MAX_CACHED_POSTS)
    }));
  } catch {}
}

function getBubblesCache() {
  try {
    const cached = localStorage.getItem('feed_bubbles_cache');
    if (!cached) return null;
    const data = JSON.parse(cached);
    if (Date.now() - data.timestamp > CACHE_CONFIG.BUBBLES_TTL) {
      localStorage.removeItem('feed_bubbles_cache');
      return null;
    }
    const agora = Date.now();
    return data.bubbles.filter(b => {
      const t = (typeof b.create === 'object' && b.create.seconds)
        ? b.create.seconds * 1000
        : new Date(b.create).getTime();
      return (agora - t) / 3600000 < 24;
    });
  } catch { return null; }
}

function setBubblesCache(bubbles) {
  try {
    localStorage.setItem('feed_bubbles_cache', JSON.stringify({
      timestamp: Date.now(),
      bubbles: bubbles.slice(0, CACHE_CONFIG.MAX_CACHED_BUBBLES)
    }));
  } catch {}
}

function limparCacheFeed() {
  try {
    localStorage.removeItem('feed_posts_cache');
    localStorage.removeItem('feed_bubbles_cache');
  } catch {}
}

function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (Date.now() - data.time > CACHE_USER_TIME) { localStorage.removeItem(key); return null; }
    return data.value;
  } catch { return null; }
}

function setCache(key, value) {
  try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), value })); } catch {}
}


// ============================================================
// SINCRONIZAÇÃO EM BACKGROUND
// ============================================================
function iniciarSincronizacaoBackground() {
  if (cacheCheckTimer) clearInterval(cacheCheckTimer);
  cacheCheckTimer = setInterval(async () => {
    try {
      const snap     = await getDocs(query(collection(db, 'posts'), orderBy('create', 'desc'), limit(5)));
      const recentes = snap.docs.map(d => ({ ...d.data(), postid: d.id }));
      const cache    = (getPostsCache() || []).filter(p => p.tipo === 'post');
      if (recentes.length && cache.length && recentes[0].postid !== cache[0].postid) {
        const todos = await getDocs(query(collection(db, 'posts'), orderBy('create', 'desc'), limit(CACHE_CONFIG.MAX_CACHED_POSTS)));
        setPostsCache(todos.docs.map(d => ({ ...d.data(), postid: d.id, tipo: 'post' })));
      }
    } catch {}
  }, CACHE_CONFIG.CHECK_UPDATE_INTERVAL);
}

function pararSincronizacaoBackground() {
  if (cacheCheckTimer) { clearInterval(cacheCheckTimer); cacheCheckTimer = null; }
}


// ============================================================
// UTILITÁRIOS
// ============================================================
function formatarHashtags(texto) {
  return texto.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
}

function formatarDataRelativa(data) {
  if (!data) return '';
  try {
    const date = (typeof data === 'object' && data.seconds)
      ? new Date(data.seconds * 1000)
      : new Date(data);
    const diff = Date.now() - date.getTime();
    const min  = Math.floor(diff / 60000);
    const h    = Math.floor(diff / 3600000);
    const d    = Math.floor(diff / 86400000);
    if (min < 1)  return 'Agora mesmo';
    if (min < 60) return `há ${min}min`;
    if (h   < 24) return `há ${h}h`;
    if (d   < 7)  return `há ${d}d`;
    return date.toLocaleDateString('pt-BR');
  } catch { return ''; }
}

function gerarIdUnico(prefixo = 'id') {
  return `${prefixo}-${Date.now()}${Math.floor(Math.random() * 1000000)}`;
}

function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}


// ============================================================
// VERIFICAR LOGIN
// ============================================================
function verificarLogin() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) { window.location.href = 'login.html'; resolve(null); }
      else resolve(user);
    });
  });
}


// ============================================================
// BUSCAR DADOS DO USUÁRIO
// ============================================================
async function buscarDadosUsuarioPorUid(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const u = snap.data();
    let userphoto = '';
    try {
      const ps = await getDoc(doc(db, 'users', uid, 'user-infos', 'user-media'));
      if (ps.exists()) userphoto = ps.data().userphoto || '';
    } catch {}
    return {
      userphoto,
      username:    u.username    || '',
      displayname: u.displayname || '',
      name:        u.name        || '',
      verified:    u.verified    || false
    };
  } catch { return null; }
}

async function buscarUsuarioCached(uid) {
  const key   = `user_cache_${uid}`;
  const cache = getCache(key);
  if (cache) return cache;
  const dados = await buscarDadosUsuarioPorUid(uid);
  if (dados) setCache(key, dados);
  return dados;
}


// ============================================================
// GREETING
// ============================================================
async function atualizarGreeting() {
  const user = auth.currentUser;
  if (!user) return;

  const hora     = new Date().getHours();
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';

  const greetingEl = document.getElementById('greeting');
  const usernameEl = document.getElementById('username');
  const fotoEl     = document.querySelector('.user-welcome img');

  if (greetingEl) greetingEl.textContent = saudacao;

  const cached      = getCache(`user_cache_${user.uid}`);
  const cachedPhoto = getCache(`user_photo_${user.uid}`);

  if (cached) {
    if (usernameEl) usernameEl.textContent = cached.displayname || cached.username || 'Usuário';
    if (fotoEl && cachedPhoto) fotoEl.src = cachedPhoto;
  }

  const dados = await buscarDadosUsuarioPorUid(user.uid);
  if (dados) {
    setCache(`user_cache_${user.uid}`, dados);
    if (dados.userphoto) setCache(`user_photo_${user.uid}`, dados.userphoto);
    if (usernameEl) usernameEl.textContent = dados.displayname || dados.username || 'Usuário';
    if (fotoEl && dados.userphoto) fotoEl.src = dados.userphoto;
  }
}


// ============================================================
// CONFIGURAR LINKS DE PERFIL / LOGOUT
// ============================================================
function configurarLinks() {
  const user = auth.currentUser;
  if (!user) return;

  const urlPerfil   = `profile.html?userid=${encodeURIComponent(user.uid)}`;
  const linkSidebar = document.getElementById('linkPerfilSidebar');
  const linkMobile  = document.getElementById('linkPerfilMobile');
  if (linkSidebar) linkSidebar.href = urlPerfil;
  if (linkMobile)  linkMobile.href  = urlPerfil;

  document.querySelectorAll('#btnSair').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      auth.signOut().then(() => { window.location.href = 'index.html'; });
    });
  });
}


// ============================================================
// FOTO NA NAVBAR
// ============================================================
function atualizarFotoNavbar() {
  onAuthStateChanged(auth, async (user) => {
    const navPic = document.getElementById('nav-pic');
    if (!navPic || !user) return;
    const cached = localStorage.getItem('user_photo_cache');
    if (cached) navPic.src = cached;
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/user-infos/user-media`));
      if (snap.exists()) {
        const foto = snap.data().userphoto || './src/icon/default.jpg';
        navPic.src = foto;
        localStorage.setItem('user_photo_cache', foto);
      }
    } catch {}
  });
}


// ============================================================
// UPLOAD DE IMAGEM (ImgBB)
// ============================================================
const IMGBB_TIPOS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

async function comprimirImagem(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })),
          'image/jpeg', quality
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
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

async function uploadImagemPost(file, userId) {
  try {
    if (!IMGBB_TIPOS.includes(file.type)) throw new Error('Tipo de arquivo não suportado.');
    let fileToUpload = file;
    if (file.type !== 'image/gif' && file.size > 2 * 1024 * 1024) {
      fileToUpload = await comprimirImagem(file);
    }
    const base64 = (await fileToBase64(fileToUpload)).split(',')[1];
    const fd = new FormData();
    fd.append('image', base64);
    fd.append('name', `post_${userId}_${Date.now()}`);
    const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: fd });
    const data = await res.json();
    if (data.success) return { success: true, url: data.data.url, deleteUrl: data.data.delete_url };
    throw new Error(data.error?.message || 'Erro ao fazer upload');
  } catch (e) {
    return { success: false, error: e.message };
  }
}


// ============================================================
// MODAL DE CRIAR POST
// ============================================================
function configurarModal() {

  // abre o modal
  function abrirModal() {
    document.getElementById('postLayer').classList.add('active');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.querySelector('.np-text-input')?.focus(), 150);
  }

  // fecha o modal e limpa tudo
  function fecharModal() {
    document.getElementById('postLayer').classList.remove('active');
    document.body.style.overflow = '';
    document.querySelector('.np-text-input').value = '';
    imagemSelecionada = null;
    const preview = document.querySelector('.image-preview-post');
    if (preview) { preview.style.display = 'none'; preview.querySelector('img').src = ''; }
  }

  // botões que abrem
  document.querySelector('.navbar-top .top-btn')?.addEventListener('click', abrirModal);
  document.getElementById('topPlusBtn')?.addEventListener('click', abrirModal);
  document.getElementById('openPostLayer')?.addEventListener('click', abrirModal);
  document.querySelector('.post-box input')?.addEventListener('focus', (e) => { e.target.blur(); abrirModal(); });
  document.querySelector('.sidebar .postmodal')?.addEventListener('click', (e) => { e.preventDefault(); abrirModal(); });

  // fechar
  document.getElementById('closeLayerBtn')?.addEventListener('click', fecharModal);

  // selecionar imagem
  document.getElementById('post-file-input')?.addEventListener('click', () => {
    const input   = document.createElement('input');
    input.type    = 'file';
    input.accept  = 'image/*';
    input.onchange = (e) => {
      const arquivo = e.target.files[0];
      if (!arquivo || !arquivo.type.startsWith('image/')) return;
      imagemSelecionada = arquivo;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const preview = document.querySelector('.image-preview-post');
        preview.querySelector('img').src = ev.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(arquivo);
    };
    input.click();
  });

  // remover imagem
  document.querySelector('.remove-image-post')?.addEventListener('click', () => {
    imagemSelecionada = null;
    const preview = document.querySelector('.image-preview-post');
    preview.style.display = 'none';
    preview.querySelector('img').src = '';
  });

  // -------------------------------------------------------
  // BOTÃO "POST" — envia texto + imagem
  // -------------------------------------------------------
  document.getElementById('btn-post')?.addEventListener('click', async () => {
    const user  = auth.currentUser;
    const texto = document.querySelector('.np-text-input').value.trim();

    // TODO: vamos fazer essa função juntos!
    // await enviarPost(user, texto, imagemSelecionada);
  });

  // -------------------------------------------------------
  // BOTÃO "NOTA" — envia só texto, ignora imagem
  // -------------------------------------------------------
  document.getElementById('btn-bubble')?.addEventListener('click', async () => {
    const user  = auth.currentUser;
    const texto = document.querySelector('.np-text-input').value.trim();

    // TODO: vamos fazer essa função juntos!
    // await enviarBubble(user, texto);
  });

  window.abrirPostModal  = abrirModal;
  window.fecharPostModal = fecharModal;
}


// ============================================================
// ENVIAR POST (texto + imagem opcional)
// ============================================================
async function enviarPost(user, texto, imageFile) {
  if (!texto && !imageFile) {
    alert('Escreva algo ou adicione uma imagem!');
    return;
  }

  const loadingInfo = mostrarLoading('Enviando post...');

  try {
    const postId = gerarIdUnico('post');
    let urlImagem = '', deleteUrlImagem = '';

    if (imageFile) {
      atualizarTextoLoading('Fazendo upload da imagem...');
      const result = await uploadImagemPost(imageFile, user.uid);
      if (!result.success) {
        clearInterval(loadingInfo.interval); esconderLoading();
        alert('Erro no upload: ' + result.error); return;
      }
      urlImagem       = result.url;
      deleteUrlImagem = result.deleteUrl;
    }

    atualizarTextoLoading('Salvando post...');

    const postData = {
      content: texto, img: urlImagem, imgDeleteUrl: deleteUrlImagem,
      urlVideo: '', likes: 0, saves: 0, comentarios: 0,
      postid: postId, creatorid: user.uid, reports: 0,
      visible: true, create: serverTimestamp()
    };

    await setDoc(doc(db, 'posts', postId), postData);
    await setDoc(doc(db, 'users', user.uid, 'posts', postId), postData);

    clearInterval(loadingInfo.interval); esconderLoading();
    document.getElementById('closeLayerBtn').click();
    feed.innerHTML = ''; lastPostSnapshot = null; hasMorePosts = true; loading = false;
    limparCacheFeed();
    await loadPosts();

  } catch (error) {
    console.error('Erro ao enviar post:', error);
    clearInterval(loadingInfo.interval); esconderLoading();
    alert('Erro ao enviar post: ' + error.message);
  }
}


// ============================================================
// ENVIAR NOTA / BUBBLE (só texto, dura 24h)
// ============================================================
async function enviarBubble(user, texto) {
  if (!texto) { alert('Escreva algo para a nota!'); return; }

  const loadingInfo = mostrarLoading('Enviando nota...');

  try {
    const bubbleId = gerarIdUnico('bubble');
    await setDoc(doc(db, 'bubbles', bubbleId), {
      content: texto, bubbleid: bubbleId, creatorid: user.uid,
      create: serverTimestamp(), musicUrl: ''
    });

    clearInterval(loadingInfo.interval); esconderLoading();
    document.getElementById('closeLayerBtn').click();
    feed.innerHTML = ''; lastPostSnapshot = null; hasMorePosts = true; loading = false;
    limparCacheFeed();
    await loadPosts();

  } catch (error) {
    console.error('Erro ao enviar nota:', error);
    clearInterval(loadingInfo.interval); esconderLoading();
    alert('Erro ao enviar nota: ' + error.message);
  }
}


// ============================================================
// CARREGAR BUBBLES (notas 24h)
// ============================================================
function bubbleEstaValido(createTimestamp) {
  const t = (typeof createTimestamp === 'object' && createTimestamp.seconds)
    ? createTimestamp.seconds * 1000
    : new Date(createTimestamp).getTime();
  return (Date.now() - t) / 3600000 < 24;
}

async function carregarBubbles() {
  try {
    const snap = await getDocs(query(collection(db, 'bubbles'), orderBy('create', 'desc'), limit(50)));
    return snap.docs
      .map(d => ({ ...d.data(), bubbleid: d.id, tipo: 'bubble' }))
      .filter(b => bubbleEstaValido(b.create));
  } catch { return []; }
}


// ============================================================
// RENDERIZAR BUBBLE NO FEED
// ============================================================
function renderizarBubble(bubbleData, feedEl) {
  const el = document.createElement('div');
  el.className = 'bubble-container';
  el.innerHTML = `
    <div class="bubble-header">
      <div class="user-info-bubble">
        <img src="./src/icon/default.jpg" class="avatar" onerror="this.src='./src/icon/default.jpg'">
        <div class="user-meta-bubble">
          <strong class="user-name-link" data-username="${bubbleData.creatorid}"></strong>
          <small class="bullet">•</small>
          <small class="post-date-bubble">${formatarDataRelativa(bubbleData.create)}</small>
        </div>
      </div>
    </div>
    <div class="bubble-content">
      <div class="bubble-text"><p>${formatarHashtags(bubbleData.content || '')}</p></div>
      <div class="interaction">
        <button class="like-bubble" data-bubble-id="${bubbleData.bubbleid}" data-creator-id="${bubbleData.creatorid}">
          <i class="far fa-heart"></i> <span class="like-count">0</span>
        </button>
      </div>
    </div>
  `;
  feedEl.appendChild(el);

  buscarUsuarioCached(bubbleData.creatorid).then(u => {
    if (!u) return;
    const avatar = el.querySelector('.avatar');
    const nome   = el.querySelector('.user-name-link');
    if (avatar) avatar.src = u.userphoto || './src/icon/default.jpg';
    if (nome) {
      nome.textContent = u.username || bubbleData.creatorid;
      if (u.verified) nome.innerHTML += ' <i class="fas fa-check-circle" style="color:#4A90E2;font-size:.8em"></i>';
    }
  });

  const btnLike = el.querySelector('.like-bubble');
  const user    = auth.currentUser;
  if (btnLike && user) {
    getDoc(doc(db, `bubbles/${bubbleData.bubbleid}/likers/${user.uid}`)).then(s => {
      if (s.exists() && s.data().like) { btnLike.classList.add('liked'); btnLike.querySelector('i').className = 'fas fa-heart'; }
    });
    getDocs(query(collection(db, `bubbles/${bubbleData.bubbleid}/likers`), where('like', '==', true))).then(s => {
      const span = btnLike.querySelector('.like-count');
      if (span) span.textContent = s.size;
    });
    btnLike.addEventListener('click', () => toggleLikeBubble(bubbleData.bubbleid, btnLike));
  }
}


// ============================================================
// RENDERIZAR POST NO FEED
// ============================================================
function renderPost(postData, feedEl) {
  if (postData.visible === false) {
    const el = document.createElement('div');
    el.className = 'post-card post-oculto-aviso';
    el.innerHTML = `
      <div class="post-oculto-msg">
        <p>Este conteúdo foi denunciado por muitos usuários. Você ainda quer ver?</p>
        <button class="btn-ver-post" data-id="${postData.postid}">Ver mesmo assim</button>
      </div>
    `;
    feedEl.appendChild(el);
    return;
  }

  const deveBorrar = (postData.reports || 0) >= 7;
  const postEl = document.createElement('div');
  postEl.className = 'post-card' + (deveBorrar ? ' post-blur-wrapper' : '');
  postEl.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="./src/icon/default.jpg" class="avatar" onerror="this.src='./src/icon/default.jpg'">
        <div class="user-meta">
          <strong class="user-name-link" data-username="${postData.creatorid}"></strong>
          <small class="post-date-mobile">${formatarDataRelativa(postData.create)}</small>
        </div>
      </div>
      <div class="left-space-options">
        <div class="more-options">
          <button class="more-options-button"><i class="fas fa-ellipsis-h"></i></button>
        </div>
      </div>
    </div>
    <div class="post-content">
      <div class="post-text">${formatarHashtags(postData.content || '')}</div>
      ${postData.img     ? `<div class="post-image"><img src="${postData.img}" loading="lazy" onclick="abrirModalImagem('${postData.img}')"></div>` : ''}
      ${postData.urlVideo ? `<div class="post-video"><video src="${postData.urlVideo}" muted playsinline controls preload="metadata"></video></div>` : ''}
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="btn-like" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 456.549" width="20" height="20">
              <path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/>
            </svg> <span>${postData.likes || 0}</span>
          </button>
          <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg viewBox="0 0 122.97 122.88" width="20" height="20"><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/></svg>
            <span>${postData.comentarios || 0}</span>
          </button>
          <button class="btn-report" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <i class="fas fa-flag"></i>
          </button>
        </div>
        <div class="post-actions-right">
          <button class="btn-save" data-post-id="${postData.postid}" data-post-owner="${postData.creatorid}">
            <i class="far fa-bookmark"></i>
          </button>
        </div>
      </div>
      <div class="post-footer-infos">
        <p class="post-liked-by btn-abrir-curtidas" data-post-id="${postData.postid}" style="cursor:pointer;display:none"></p>
      </div>
      <div class="comments-section" style="display:none">
        <div class="comment-form">
          <input type="text" class="comment-input" placeholder="Escreva um comentário..."
                 data-username="${postData.creatorid}" data-post-id="${postData.postid}">
          <button class="comment-submit" data-username="${postData.creatorid}" data-post-id="${postData.postid}">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
        <div class="comments-area"><div class="comments-list"></div></div>
      </div>
    </div>
  `;
  feedEl.appendChild(postEl);

  // blur se tiver muitos reports
  if (deveBorrar) {
    const inner = document.createElement('div');
    inner.className = 'post-blur-overlay';
    while (postEl.firstChild) inner.appendChild(postEl.firstChild);
    postEl.appendChild(inner);
    const blurBtn = document.createElement('button');
    blurBtn.className   = 'post-blur-btn';
    blurBtn.textContent = '👁 Ver mesmo assim';
    blurBtn.addEventListener('click', () => {
      inner.classList.remove('post-blur-overlay');
      blurBtn.remove();
      postEl.classList.remove('post-blur-wrapper');
    });
    postEl.appendChild(blurBtn);
    return;
  }

  const user = auth.currentUser;

  // nome e foto
  buscarUsuarioCached(postData.creatorid).then(u => {
    if (!u) return;
    const avatar = postEl.querySelector('.avatar');
    const nome   = postEl.querySelector('.user-name-link');
    if (avatar) avatar.src = u.userphoto || './src/icon/default.jpg';
    if (nome) {
      nome.textContent = u.username || postData.creatorid;
      if (u.verified) nome.innerHTML += ' <i class="fas fa-check-circle" style="color:#4A90E2;font-size:.8em"></i>';
    }
  });

  // estado do like
  const btnLike = postEl.querySelector('.btn-like');
  if (btnLike && user) {
    getDoc(doc(db, `posts/${postData.postid}/likers/${user.uid}`)).then(s => {
      if (s.exists() && s.data().like) btnLike.classList.add('liked');
    });
  }

  // contagens
  contarLikes(postData.postid).then(n => { const s = btnLike?.querySelector('span'); if (s) s.textContent = n; });
  contarComentarios(postData.postid).then(n => { const s = postEl.querySelector('.btn-comment span'); if (s) s.textContent = n; });

  // curtido por
  if (user) {
    gerarTextoCurtidoPor(postData.postid, user.uid).then(info => {
      const footer = postEl.querySelector('.post-liked-by');
      if (!footer || info.total === 0) return;
      let html = '';
      if (info.fotos?.length) {
        html += '<div style="display:flex;margin-right:4px;">';
        info.fotos.forEach((f, i) => { html += `<img src="${f}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;${i > 0 ? 'margin-left:-8px' : ''}">`;});
        html += '</div>';
      }
      html += '<span>Curtido por ';
      if (info.usernames.length === 1) html += `<strong>${info.usernames[0]}</strong>`;
      else if (info.usernames.length >= 2) html += `<strong>${info.usernames[0]}</strong> e <strong>${info.usernames[1]}</strong>`;
      if (info.total > info.usernames.length) html += ` e outras ${info.total - info.usernames.length} pessoas`;
      html += '</span>';
      footer.innerHTML     = html;
      footer.style.display = 'flex';
    });
  }

  // salvar
  const btnSave = postEl.querySelector('.btn-save');
  if (btnSave) {
    verificarSeEstaSalvo(postData.postid).then(salvo => {
      if (salvo) { btnSave.classList.add('saved'); btnSave.querySelector('i').className = 'fas fa-bookmark'; }
    });
    btnSave.addEventListener('click', (e) => { e.stopPropagation(); toggleSalvarPost(postData.postid, postData.creatorid, btnSave); });
  }
}


// ============================================================
// CARREGAR POSTS NO FEED
// ============================================================
async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;

  const isFirstLoad = feed.children.length === 0;

  // renderiza do cache primeiro
  if (isFirstLoad) {
    const pc = getPostsCache(), bc = getBubblesCache();
    if (pc || bc) {
      allItems = [...(bc || []), ...(pc || [])];
      allItems.sort((a, b) => {
        const ta = (typeof a.create === 'object' && a.create?.seconds) ? a.create.seconds : new Date(a.create).getTime() / 1000;
        const tb = (typeof b.create === 'object' && b.create?.seconds) ? b.create.seconds : new Date(b.create).getTime() / 1000;
        return tb - ta;
      });
      allItems.forEach(item => item.tipo === 'bubble' ? renderizarBubble(item, feed) : renderPost(item, feed));
    }
  }

  try {
    if (!lastPostSnapshot) {
      const bubbles = await carregarBubbles();
      setBubblesCache(bubbles);
    }

    let q = query(collection(db, 'posts'), orderBy('create', 'desc'), limit(POSTS_LIMIT));
    if (lastPostSnapshot) q = query(collection(db, 'posts'), orderBy('create', 'desc'), startAfter(lastPostSnapshot), limit(POSTS_LIMIT));

    const snap = await getDocs(q);
    if (snap.empty) {
      hasMorePosts = false; loading = false;
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Não há mais posts'; loadMoreBtn.disabled = true; }
      return;
    }

    lastPostSnapshot = snap.docs[snap.docs.length - 1];
    const novos = snap.docs.map(d => ({ ...d.data(), postid: d.id, tipo: 'post' }));

    if (isFirstLoad) {
      feed.innerHTML = '';
      const bubbles = getBubblesCache() || [];
      allItems = [...bubbles, ...novos];
      allItems.sort((a, b) => {
        const ta = (typeof a.create === 'object' && a.create?.seconds) ? a.create.seconds : new Date(a.create).getTime() / 1000;
        const tb = (typeof b.create === 'object' && b.create?.seconds) ? b.create.seconds : new Date(b.create).getTime() / 1000;
        return tb - ta;
      });
      allItems.forEach(item => item.tipo === 'bubble' ? renderizarBubble(item, feed) : renderPost(item, feed));
      setPostsCache(novos);
      iniciarSincronizacaoBackground();
    } else {
      novos.forEach(p => renderPost(p, feed));
      setPostsCache([...(getPostsCache() || []), ...novos]);
    }

    if (snap.size < POSTS_LIMIT) {
      hasMorePosts = false;
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Não há mais posts'; loadMoreBtn.disabled = true; }
    } else {
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Carregar mais'; loadMoreBtn.disabled = false; }
    }

    configurarAutoPauseVideos();

  } catch (error) {
    console.error('Erro ao carregar posts:', error);
  }
  loading = false;
}


// ============================================================
// LIKES
// ============================================================
async function contarLikes(postId) {
  const snap = await getDocs(query(collection(db, 'posts', postId, 'likers'), where('like', '==', true)));
  return snap.size;
}

async function toggleLikePost(uid, postId, element) {
  const ref  = doc(db, `posts/${postId}/likers/${uid}`);
  const snap = await getDoc(ref);
  const span = element.querySelector('span');
  let total  = parseInt(span?.textContent) || 0;

  if (snap.exists() && snap.data().like === true) {
    await updateDoc(ref, { like: false, timestamp: Date.now() });
    element.classList.remove('liked');
    if (span) span.textContent = Math.max(0, total - 1);
  } else {
    if (snap.exists()) await updateDoc(ref, { like: true, timestamp: Date.now() });
    else await setDoc(ref, { uid, like: true, timestamp: Date.now() });
    element.classList.add('liked');
    if (span) span.textContent = total + 1;
  }
  atualizarCurtidoPorDepoisDoLike(element, postId);
}

async function toggleLikeBubble(bubbleId, btn) {
  const user = auth.currentUser;
  if (!user) return;
  const ref  = doc(db, `bubbles/${bubbleId}/likers/${user.uid}`);
  const snap = await getDoc(ref);
  if (snap.exists() && snap.data().like) {
    await deleteDoc(ref);
    btn.classList.remove('liked'); btn.querySelector('i').className = 'far fa-heart';
  } else {
    await setDoc(ref, { like: true, likein: serverTimestamp(), uid: user.uid });
    btn.classList.add('liked'); btn.querySelector('i').className = 'fas fa-heart';
  }
  const total = (await getDocs(query(collection(db, `bubbles/${bubbleId}/likers`), where('like', '==', true)))).size;
  const span  = btn.querySelector('.like-count');
  if (span) span.textContent = total;
}


// ============================================================
// "CURTIDO POR"
// ============================================================
async function gerarTextoCurtidoPor(postId, meuUid) {
  const snap   = await getDocs(collection(db, `posts/${postId}/likers`));
  const likers = [];
  snap.forEach(d => { if (d.data().like === true) likers.push({ uid: d.id, timestamp: d.data().timestamp || 0 }); });
  const total = likers.length;
  if (total === 0) return { usernames: [], total: 0, fotos: [] };

  if (total === 1 && likers[0].uid === meuUid) {
    const u = await buscarUsuarioCached(meuUid);
    return { usernames: ['você'], total, fotos: [u?.userphoto || './src/icon/default.jpg'] };
  }

  const exibir = likers.filter(l => l.uid !== meuUid).slice(0, 2);
  const usernames = [], fotos = [];
  for (const l of exibir) {
    const u = await buscarUsuarioCached(l.uid);
    usernames.push(u?.username || 'usuário');
    fotos.push(u?.userphoto || './src/icon/default.jpg');
  }
  return { usernames, total, fotos };
}

async function atualizarCurtidoPorDepoisDoLike(btn, postId) {
  const user   = auth.currentUser;
  const footer = btn.closest('.post-card')?.querySelector('.post-liked-by');
  if (!footer || !user) return;

  const info = await gerarTextoCurtidoPor(postId, user.uid);
  if (info.total === 0) { footer.style.display = 'none'; return; }

  let html = '';
  if (info.fotos?.length) {
    html += '<div style="display:flex;margin-right:4px;">';
    info.fotos.forEach((f, i) => { html += `<img src="${f}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;${i > 0 ? 'margin-left:-8px' : ''}">`;});
    html += '</div>';
  }
  html += '<span>Curtido por ';
  if (info.usernames.length === 1) html += `<strong>${info.usernames[0]}</strong>`;
  else if (info.usernames.length >= 2) html += `<strong>${info.usernames[0]}</strong> e <strong>${info.usernames[1]}</strong>`;
  if (info.total > info.usernames.length) html += ` e outras ${info.total - info.usernames.length} pessoas`;
  html += '</span>';
  footer.innerHTML     = html;
  footer.style.display = 'flex';
}


// ============================================================
// MODAL DE CURTIDAS
// ============================================================
async function abrirModalCurtidas(postId) {
  document.querySelector('.likes-modal-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.className = 'likes-modal-overlay';
  overlay.innerHTML = `
    <div class="likes-modal-content">
      <div class="likes-modal-header">
        <div class="likes-modal-grab"></div>
        <span class="likes-modal-title">Curtidas</span>
      </div>
      <div class="likes-modal-list">
        <div style="text-align:center;padding:30px;color:#888"><i class="fas fa-spinner fa-spin"></i></div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  try {
    const snap   = await getDocs(collection(db, `posts/${postId}/likers`));
    const likers = [];
    snap.forEach(d => { if (d.data().like === true) likers.push(d.id); });
    const list = overlay.querySelector('.likes-modal-list');
    list.innerHTML = '';
    if (!likers.length) { list.innerHTML = '<p style="text-align:center;color:#888;padding:30px">Nenhuma curtida ainda.</p>'; return; }
    for (const uid of likers) {
      const u    = await buscarUsuarioCached(uid);
      const page = isMobileDevice() ? 'pfmobile.html' : 'PF.html';
      const item = document.createElement('div');
      item.className = 'likes-modal-user';
      item.innerHTML = `
        <img src="${u?.userphoto || './src/icon/default.jpg'}" onerror="this.src='./src/icon/default.jpg'">
        <div class="likes-modal-user-info">
          <span class="likes-modal-user-display">${u?.displayname || u?.username || uid}</span>
          <span class="likes-modal-user-username">${u?.username ? '@' + u.username : ''}</span>
        </div>
      `;
      item.addEventListener('click', () => { window.location.href = `${page}?userid=${encodeURIComponent(uid)}`; });
      list.appendChild(item);
    }
  } catch {
    overlay.querySelector('.likes-modal-list').innerHTML = '<p style="text-align:center;color:#888;padding:30px">Erro ao carregar.</p>';
  }
}


// ============================================================
// COMENTÁRIOS
// ============================================================
async function carregarComentarios(postId) {
  const snap = await getDocs(query(collection(db, 'posts', postId, 'coments'), orderBy('create', 'asc')));
  const lista = [];
  for (const d of snap.docs) {
    const data = d.data();
    lista.push({ ...data, userData: await buscarUsuarioCached(data.senderid) });
  }
  return lista;
}

function _renderListaComentarios(lista, container) {
  container.innerHTML = '';
  if (!lista.length) { container.innerHTML = '<p class="no-comments">Nenhum comentário ainda.</p>'; return; }
  lista.forEach(c => {
    const nome  = c.userData?.displayname || c.userData?.username || c.senderid;
    const user  = c.userData?.username ? `@${c.userData.username}` : '';
    const foto  = c.userData?.userphoto || './src/icon/default.jpg';
    const badge = c.userData?.verified ? ' <i class="fas fa-check-circle" style="color:#4A90E2;font-size:.8em"></i>' : '';
    const el    = document.createElement('div');
    el.className = 'comentario-item';
    el.innerHTML = `
      <div class="comentario-header">
        <img src="${foto}" class="comentario-avatar" onerror="this.src='./src/icon/default.jpg'">
        <div class="comentario-meta">
          <strong class="comentario-nome" data-username="${c.senderid}">${nome}${badge}</strong>
          <small class="comentario-usuario">${user}</small>
          <small class="comentario-data">${formatarDataRelativa(c.create)}</small>
        </div>
      </div>
      <div class="comentario-conteudo">${formatarHashtags(c.content)}</div>
    `;
    container.appendChild(el);
  });
}

async function renderizarComentarios(uid, postId, container) {
  const cacheKey = `comments_${postId}`;
  const cached   = getCache(cacheKey);
  if (cached) _renderListaComentarios(cached, container);
  const loadingInfo = mostrarLoading('Carregando comentários...');
  try {
    const lista = await carregarComentarios(postId);
    try { localStorage.setItem(cacheKey, JSON.stringify({ time: Date.now(), value: lista })); } catch {}
    _renderListaComentarios(lista, container);
    clearInterval(loadingInfo.interval); esconderLoading();
  } catch {
    clearInterval(loadingInfo.interval); esconderLoading();
    if (!cached) container.innerHTML = '<p class="error-comments">Erro ao carregar comentários.</p>';
  }
}

async function adicionarComentario(uid, postId, conteudo) {
  const user = auth.currentUser;
  if (!user) return false;
  const loadingInfo = mostrarLoading('Enviando comentário...');
  try {
    const id   = gerarIdUnico('comentid');
    const data = { content: conteudo, create: serverTimestamp(), senderid: user.uid, report: 0 };
    await setDoc(doc(db, 'users', uid, 'posts', postId, 'coments', id), data);
    await setDoc(doc(db, 'posts', postId, 'coments', id), data);
    try { localStorage.removeItem(`comments_${postId}`); } catch {}
    clearInterval(loadingInfo.interval); esconderLoading();
    return true;
  } catch {
    clearInterval(loadingInfo.interval); esconderLoading();
    return false;
  }
}

async function contarComentarios(postId) {
  const snap = await getDocs(collection(db, 'posts', postId, 'coments'));
  return snap.size;
}


// ============================================================
// MODAL DE COMENTÁRIOS (MOBILE)
// ============================================================
async function abrirModalComentarios(postId, creatorId) {
  document.querySelector('.mobile-comments-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'mobile-comments-modal';
  modal.innerHTML = `
    <div class="mobile-comments-content">
      <div class="modal-comments-header">
        <div class="modal-grab"></div>
        <h3>Comentários</h3>
      </div>
      <div class="modal-comments-list-container">
        <div class="comments-list-mobile"></div>
      </div>
      <div class="mobile-comment-form-container">
        <div class="comment-form">
          <input type="text" class="comment-input-mobile" placeholder="Escreva um comentário...">
          <button class="comment-submit-mobile"><i class="fas fa-paper-plane"></i></button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  const scrollY = window.scrollY;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.width    = '100%';
  document.body.style.top      = `-${scrollY}px`;
  requestAnimationFrame(() => modal.classList.add('active'));
  modal.addEventListener('click', (e) => { if (e.target === modal) fecharModalComentarios(); });

  const list = modal.querySelector('.comments-list-mobile');
  await renderizarComentarios(creatorId, postId, list);

  const enviar = async () => {
    const input = modal.querySelector('.comment-input-mobile');
    if (!input.value.trim()) return;
    const ok = await adicionarComentario(creatorId, postId, input.value.trim());
    if (ok) { input.value = ''; await renderizarComentarios(creatorId, postId, list); }
  };
  modal.querySelector('.comment-submit-mobile').addEventListener('click', enviar);
  modal.querySelector('.comment-input-mobile').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); enviar(); } });
}

function fecharModalComentarios() {
  const modal = document.querySelector('.mobile-comments-modal');
  if (!modal) return;
  const content = modal.querySelector('.mobile-comments-content');
  content.style.transition = 'transform 0.3s ease';
  content.style.transform  = 'translateY(100%)';
  modal.style.opacity = '0';
  setTimeout(() => {
    modal.remove();
    const scrollY = document.body.style.top;
    document.body.style.position = '';
    document.body.style.top      = '';
    document.body.style.width    = '';
    document.body.style.overflow = '';
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }, 300);
}
window.fecharModalComentarios = fecharModalComentarios;


// ============================================================
// MENU BOTTOM (3 PONTINHOS)
// ============================================================
let currentMenuPostId      = null;
let currentMenuPostOwnerId = null;
let currentMenuPostElement = null;

function abrirMenuBottom(postId, ownerId, postElement = null) {
  const menuLayer  = document.querySelector('.menu-bottom-layer');
  const userLogado = auth.currentUser;
  if (!menuLayer || !userLogado) return;

  currentMenuPostId      = postId;
  currentMenuPostOwnerId = ownerId;
  currentMenuPostElement = postElement;

  const ehMeuPost = userLogado.uid === ownerId;
  menuLayer.querySelectorAll('.menu-options-box:first-child .menu-bottom-btn').forEach(btn => {
    const t = btn.textContent.trim();
    if (t === 'Apagar')    btn.style.display = ehMeuPost ? 'block' : 'none';
    if (t === 'Denunciar') btn.style.display = ehMeuPost ? 'none'  : 'block';
    if (t === 'Arquivar')  btn.style.display = 'block';
  });

  menuLayer.classList.add('active');
  document.body.classList.add('menu-bottom-open');
}

function fecharMenuBottom(limparIds = true) {
  const menuLayer = document.querySelector('.menu-bottom-layer');
  if (!menuLayer) return;
  menuLayer.classList.add('closing');
  setTimeout(() => {
    menuLayer.classList.remove('active', 'closing');
    document.body.classList.remove('menu-bottom-open');
    if (limparIds) { currentMenuPostId = null; currentMenuPostOwnerId = null; currentMenuPostElement = null; }
  }, 300);
}

function configurarListenersMenuBottom() {
  const menuLayer = document.querySelector('.menu-bottom-layer');
  if (!menuLayer) return;

  menuLayer.addEventListener('click', (e) => { if (e.target === menuLayer) fecharMenuBottom(); });

  menuLayer.addEventListener('click', async (e) => {
    const btn   = e.target.closest('.menu-bottom-btn');
    if (!btn) return;
    const texto = btn.textContent.trim();
    if (texto === 'Cancelar') { fecharMenuBottom(); return; }
    if (texto === 'Apagar')   { fecharMenuBottom(false); setTimeout(() => handleDeletarPost(), 350); return; }
    if (texto === 'Denunciar') { fecharMenuBottom(false); setTimeout(() => handleDenunciarPost(), 350); return; }
    if (texto === 'Arquivar') alert('Funcionalidade em breve!');
    fecharMenuBottom();
  });
}

async function handleDeletarPost() {
  if (!currentMenuPostId) return;
  const user = auth.currentUser;
  if (!user || user.uid !== currentMenuPostOwnerId) return;
  if (!confirm('Tem certeza que deseja apagar este post?')) return;

  try {
    await Promise.all([
      deleteDoc(doc(db, 'posts', currentMenuPostId)),
      deleteDoc(doc(db, 'users', currentMenuPostOwnerId, 'posts', currentMenuPostId))
    ]);
    const el = currentMenuPostElement || Array.from(document.querySelectorAll('.post-card'))
      .find(c => c.querySelector('.btn-like')?.dataset.id === currentMenuPostId);
    if (el) {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity    = '0';
      el.style.transform  = 'translateY(-20px)';
      setTimeout(() => el.remove(), 300);
    }
    limparCacheFeed();
    currentMenuPostId = null; currentMenuPostOwnerId = null; currentMenuPostElement = null;
  } catch (err) {
    console.error('Erro ao apagar post:', err);
    alert('Não foi possível apagar o post.');
  }
}

function handleDenunciarPost() {
  if (!currentMenuPostId) return;
  alert('Denúncia: funcionalidade em breve.');
  currentMenuPostId = null; currentMenuPostOwnerId = null; currentMenuPostElement = null;
}


// ============================================================
// MODAL DE IMAGEM AMPLIADA
// ============================================================
window.abrirModalImagem = function(url) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="window.fecharModalImagem()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <button class="modal-close" onclick="window.fecharModalImagem()"><i class="fas fa-times"></i></button>
        <img src="${url}" class="modal-image">
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
};
window.fecharModalImagem = function() {
  const modal = document.querySelector('.image-modal');
  if (modal) { modal.remove(); document.body.style.overflow = ''; }
};


// ============================================================
// SCROLL INFINITO
// ============================================================
function configurarScrollInfinito() {
  window.addEventListener('scroll', async () => {
    const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
    if (scrollTop + clientHeight >= scrollHeight - 300 && !loading && hasMorePosts) {
      await loadPosts();
    }
  });
}


// ============================================================
// VÍDEOS
// ============================================================
function configurarAutoPauseVideos() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const v = entry.target;
      if (entry.isIntersecting) { if (v.paused) v.play(); }
      else { if (!v.paused) v.pause(); }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('.post-video video').forEach(v => observer.observe(v));
}

document.addEventListener('click', (e) => {
  const v = e.target.closest('video');
  if (v) { if (v.paused) v.play(); else v.pause(); }
});


// ============================================================
// EVENT LISTENERS DO FEED
// ============================================================
function configurarEventListeners() {
  if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadPosts);
  if (!feed) return;

  feed.addEventListener('click', async (e) => {
    const btnLike     = e.target.closest('.btn-like');
    const btnComment  = e.target.closest('.btn-comment');
    const btnMore     = e.target.closest('.more-options-button');
    const btnCurtidas = e.target.closest('.btn-abrir-curtidas');
    const commentSubmit = e.target.closest('.comment-submit');

    if (btnLike) {
      const uid    = auth.currentUser?.uid;
      const postId = btnLike.dataset.id;
      if (uid && postId) await toggleLikePost(uid, postId, btnLike);
    }

    if (btnComment) {
      const postId = btnComment.dataset.id;
      const uid    = btnComment.dataset.username;
      if (isMobileDevice()) {
        abrirModalComentarios(postId, uid);
      } else {
        const section = btnComment.closest('.post-card').querySelector('.comments-section');
        if (section.style.display === 'none' || !section.style.display) {
          section.style.display = 'block';
          await renderizarComentarios(uid, postId, section.querySelector('.comments-list'));
        } else {
          section.style.display = 'none';
        }
      }
    }

    if (btnMore) {
      const card   = btnMore.closest('.post-card');
      const postId = card?.querySelector('.btn-like')?.dataset.id;
      const owner  = card?.querySelector('.btn-like')?.dataset.username;
      if (postId && owner) abrirMenuBottom(postId, owner, card);
    }

    if (btnCurtidas) {
      const postId = btnCurtidas.dataset.postId;
      if (postId) await abrirModalCurtidas(postId);
    }

    if (commentSubmit) {
      const uid    = commentSubmit.dataset.username;
      const postId = commentSubmit.dataset.postId;
      const input  = document.querySelector(`input[data-username="${uid}"][data-post-id="${postId}"]`);
      if (input?.value.trim()) {
        const ok = await adicionarComentario(uid, postId, input.value.trim());
        if (ok) {
          input.value = '';
          await renderizarComentarios(uid, postId, commentSubmit.closest('.comments-section').querySelector('.comments-list'));
        }
      }
    }

    // clique no usuário → perfil
    const userInfo = e.target.closest('.user-info');
    if (userInfo && !e.target.closest('.more-options-button')) {
      const uid = userInfo.querySelector('.user-name-link')?.dataset.username;
      if (uid) {
        const page = isMobileDevice() ? 'pfmobile.html' : 'PF.html';
        window.location.href = `${page}?userid=${encodeURIComponent(uid)}`;
      }
    }
  });

  // clique no nome do comentário → perfil
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('comentario-nome')) {
      const uid = e.target.dataset.username;
      if (uid) {
        const page = isMobileDevice() ? 'pfmobile.html' : 'PF.html';
        window.location.href = `${page}?userid=${encodeURIComponent(uid)}`;
      }
    }
  });
}


// ============================================================
// INICIALIZAÇÃO
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  const user = await verificarLogin();
  if (!user) return;

  await atualizarGreeting();
  configurarLinks();
  configurarModal();           // abre/fecha modal + botões de envio
  configurarEventListeners();  // likes, comentários, menu, etc
  configurarListenersMenuBottom();
  configurarScrollInfinito();
  atualizarFotoNavbar();
  await loadPosts();
});

window.addEventListener('beforeunload', pararSincronizacaoBackground);
window.addEventListener('pagehide',     pararSincronizacaoBackground);