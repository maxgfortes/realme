import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, addDoc, onSnapshot,
  collection, query, orderBy, where, setDoc, updateDoc,
  deleteDoc, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { triggerNovaAmizade } from './activitie-creator.js';

// ═══════════════════════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};
const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);
export { db, auth };

// ═══════════════════════════════════════════════════════════
// ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════
let currentUser        = null;
let currentUserId      = null;
let isOwnProfile       = false;
let profileUserId      = null;
let profileUsername    = '';
let currentProfileData = null;
let postsDoUsuario     = [];

// ── Music Player (Sistema 2 — compatível com iOS) ───────────
let musicPlayer     = null;
let musicPlaying    = false;
let musicCurrentUrl = null;
let _ytApiReady     = false;
let _ytPendingId    = null;

window.onYouTubeIframeAPIReady = function () {
  _ytApiReady = true;
  if (_ytPendingId) {
    createMusicPlayer(_ytPendingId);
    _ytPendingId = null;
  }
};

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (String(url).match(/^[A-Za-z0-9_-]{11}$/) ? url : null);
}

function createMusicPlayer(videoId) {
  // Destroi player anterior se existir
  if (musicPlayer && typeof musicPlayer.destroy === 'function') {
    try { musicPlayer.destroy(); } catch {}
    musicPlayer = null;
    musicPlaying = false;
  }
  const old = document.getElementById('music-player');
  if (old) old.remove();

  const div = document.createElement('div');
  div.id = 'music-player';
  div.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;';
  document.body.appendChild(div);

  musicPlayer = new YT.Player('music-player', {
    height: '1',
    width: '1',
    videoId,
    playerVars: {
      autoplay: 0,
      controls: 0,
      disablekb: 1,
      fs: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,
      playsinline: 1,
      enablejsapi: 1,
      loop: 1,
      playlist: videoId,
    },
    events: {
      onReady(e) {
        e.target.setVolume(60);
        // Não toca automaticamente — aguarda clique do usuário
        // Busca título via oEmbed
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
          .then(r => r.json())
          .then(d => setMusicTitle(d.title))
          .catch(() => {});
      },
      onStateChange(e) {
        // Loop manual como fallback — mais confiável no iOS
        if (e.data === YT.PlayerState.ENDED) {
          e.target.seekTo(0);
          e.target.playVideo();
        }
      }
    }
  });
}

function toggleMusic() {
  if (!musicPlayer || typeof musicPlayer.playVideo !== 'function') return;
  if (musicPlaying) {
    musicPlayer.pauseVideo();
    musicPlaying = false;
  } else {
    musicPlayer.playVideo();
    musicPlaying = true;
  }
  updateMusicUI(musicPlaying);
}

function updateMusicUI(isPlaying) {
  const btn   = document.getElementById('btnPauseMusic');
  const play  = document.getElementById('play');
  const pause = document.getElementById('pause');
  const bars  = document.querySelector('.music-bars');
  const title = document.getElementById('musicTitle');

  if (btn)   btn.classList.toggle('playing', isPlaying);
  if (play)  play.classList.toggle('active', !isPlaying);
  if (pause) pause.classList.toggle('active', isPlaying);
  if (bars)  bars.classList.toggle('visible', isPlaying);
  if (title) title.classList.toggle('shifted', isPlaying);
}

function setMusicTitle(title) {
  const el1 = document.getElementById('musicTitle');
  const el2 = document.getElementById('music-title');
  if (el1) el1.textContent = title;
  if (el2) el2.textContent = title;
}

function initMusicPlayer(musicThemeUrl, musicThemeName) {
  const videoId = extractYouTubeId(musicThemeUrl);
  const musicSection = document.querySelector('.music');

  if (!videoId) {
    // Sem música — garante que a seção fica oculta
    if (musicSection) musicSection.classList.remove('has-music');
    return;
  }

  // Mostra a seção de música
  if (musicSection) musicSection.classList.add('has-music');

  // Já está carregada essa URL — não reinicia
  if (musicThemeUrl === musicCurrentUrl) return;

  // Estado inicial: parado, play visível, bars ocultas
  updateMusicUI(false);

  // Carrega a API do YouTube se ainda não foi carregada
  if (!document.getElementById('_yt_api_script')) {
    const s = document.createElement('script');
    s.id  = '_yt_api_script';
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  }

  // Trava a URL só depois de confirmar que vamos criar o player
  musicCurrentUrl = musicThemeUrl;

  if (_ytApiReady) {
    createMusicPlayer(videoId);
  } else {
    _ytPendingId = videoId;
  }

  // Conecta botões play/pause (clona para limpar listeners antigos)
  ['btnPauseMusic', 'music-toggle-btn'].forEach(id => {
    const old = document.getElementById(id);
    if (!old) return;
    const btn = old.cloneNode(true);
    old.parentNode.replaceChild(btn, old);
    btn.addEventListener('click', toggleMusic);
  });
}

// ═══════════════════════════════════════════════════════════
// CACHE
// ═══════════════════════════════════════════════════════════
const memCache = { users: new Map(), photos: new Map() };

async function getUserData(uid) {
  if (!uid) return {};
  if (memCache.users.has(uid)) return memCache.users.get(uid);
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const d = snap.exists() ? snap.data() : {};
    memCache.users.set(uid, d);
    return d;
  } catch { return {}; }
}

async function getUserPhoto(uid) {
  if (!uid) return './src/img/default.jpg';
  if (memCache.photos.has(uid)) return memCache.photos.get(uid);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'user-infos', 'user-media'));
    const d = snap.exists() ? snap.data() : {};
    const p = d.pfp || d.userphoto || './src/img/default.jpg';
    memCache.photos.set(uid, p);
    return p;
  } catch { return './src/img/default.jpg'; }
}

// localStorage perfil completo
const LS_PFX   = 'profile_cache_';
const LS_TTL   = 7 * 24 * 60 * 60 * 1000;
const LS_STALE = 5 * 60 * 1000;

function lsSave(key, data) {
  try { localStorage.setItem(LS_PFX + key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}
function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PFX + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > LS_TTL) { localStorage.removeItem(LS_PFX + key); return null; }
    data.__stale = (Date.now() - ts) > LS_STALE;
    return data;
  } catch { return null; }
}
function lsClean() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith(LS_PFX)).forEach(k => {
      try { const { ts } = JSON.parse(localStorage.getItem(k)); if (Date.now() - ts > LS_TTL) localStorage.removeItem(k); } catch { localStorage.removeItem(k); }
    });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const $ = id => document.getElementById(id);
const $q = sel => document.querySelector(sel);
const $qa = sel => document.querySelectorAll(sel);

function urlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function getDisplayName(d) {
  return d?.displayName || d?.displayname || d?.name || d?.username || 'Usuário';
}
function getUsername(d) {
  return d?.username || '';
}


function formatTs(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate()
            : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
    if (m < 1) return 'Agora';
    if (m < 60) return `${m}min`;
    if (h < 24) return `${h}h`;
    if (day < 7) return `${day}d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ''; }
}

function formatPost(txt) {
  if (!txt) return '<p class="empty-content">Post sem conteúdo</p>';
  return `<p>${String(txt)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/#(\w+)/g,'<span class="hashtag">#$1</span>')
    .replace(/@(\w+)/g,'<span class="mention">@$1</span>')
    .replace(/\n/g,'<br>')
  }</p>`;
}

function traduzirGenero(g) {
  const m = { masculino:'Masculino', feminino:'Feminino', outro:'Outro', prefiro_nao_dizer:'Prefiro não dizer',
    male:'Masculino', female:'Feminino', other:'Outro', prefer_not_to_say:'Prefiro não dizer' };
  return m[String(g||'').toLowerCase()] || 'Não informado';
}

function mostrarErro(msg) {
  const c = $q('.full-profile-container');
  if (c) c.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100vh;padding:20px;text-align:center;">
      <i class="fas fa-exclamation-circle" style="font-size:64px;color:#f85149;margin-bottom:20px;"></i>
      <h2 style="color:#f8f9f9;margin-bottom:10px;">Ops!</h2>
      <p style="color:#aaa;">${msg}</p>
      <a href="index.html" style="margin-top:20px;color:#4A90E2;text-decoration:none;">Voltar ao início</a>
    </div>`;
}


function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = './src/img/default.jpg';

  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto) {
    navPic.src = cachedPhoto;
  }

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

// ═══════════════════════════════════════════════════════════
// TRADUÇÃO (mínimo)
// ═══════════════════════════════════════════════════════════
let langs = {}, lang = 'pt';
(async () => {
  try { langs = await (await fetch('./languages.json')).json(); lang = localStorage.getItem('selectedLanguage') || 'pt'; } catch {}
})();
export function t(path) {
  try { let v = langs[lang]?.translations; for (const k of path.split('.')) v = v?.[k]; return v || path; } catch { return path; }
}
window.changeLanguage = code => { lang = code; localStorage.setItem('selectedLanguage', code); };

// ═══════════════════════════════════════════════════════════
// CARREGAR DADOS DO USUÁRIO
// ═══════════════════════════════════════════════════════════
async function carregarDados(uid) {
  try {
    const [userDoc, mediaDoc, likesDoc, aboutDoc, moreDoc, linksDoc] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, `users/${uid}/user-infos/user-media`)),
      getDoc(doc(db, `users/${uid}/user-infos/likes`)),
      getDoc(doc(db, `users/${uid}/user-infos/about`)),
      getDoc(doc(db, `users/${uid}/user-infos/more-infos`)),
      getDoc(doc(db, `users/${uid}/user-infos/links`)),
    ]);
    if (!userDoc.exists()) { mostrarErro('Perfil não encontrado'); return null; }
    return {
      ...userDoc.data(), uid,
      media:     mediaDoc.exists() ? mediaDoc.data() : {},
      likes:     likesDoc.exists() ? likesDoc.data() : {},
      about:     aboutDoc.exists() ? aboutDoc.data() : {},
      moreInfos: moreDoc.exists()  ? moreDoc.data()  : {},
      linksData: linksDoc.exists() ? linksDoc.data() : {},
    };
  } catch (e) { console.error('carregarDados:', e); mostrarErro('Erro ao carregar perfil.'); return null; }
}

// ═══════════════════════════════════════════════════════════
// RESOLVER USERNAME → UID
// ═══════════════════════════════════════════════════════════
async function resolveUsername(raw) {
  const key = raw.trim().toLowerCase();
  try {
    const snap = await getDoc(doc(db, 'usernames', key));
    if (snap.exists() && snap.data().uid) return snap.data().uid;
  } catch {}
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', key)));
    if (!snap.empty) return snap.docs[0].id;
  } catch {}
  try {
    const snap = await getDocs(query(collection(db, 'users'), where('username', '==', raw.trim())));
    if (!snap.empty) return snap.docs[0].id;
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════
// LISTENERS TEMPO REAL
// ═══════════════════════════════════════════════════════════
const _unsubs = [];
function setupListeners(uid) {
  _unsubs.forEach(u => u()); _unsubs.length = 0;
  const on = (ref, fn) => _unsubs.push(onSnapshot(ref, s => { if (s.exists && s.exists()) fn(s.data()); }));

  on(doc(db, 'users', uid), d => {
    memCache.users.set(uid, d);
    currentProfileData = { ...(currentProfileData||{}), ...d };
    renderPrincipal(d);
  });
  on(doc(db, `users/${uid}/user-infos/user-media`), d => {
    currentProfileData = { ...(currentProfileData||{}), media: { ...(currentProfileData?.media||{}), ...d } };
    renderMidia(d);
  });
  on(doc(db, `users/${uid}/user-infos/likes`), d => {
    currentProfileData = { ...(currentProfileData||{}), likes: { ...(currentProfileData?.likes||{}), ...d } };
    renderGostos(d);
    renderModal(currentProfileData);
  });
  on(doc(db, `users/${uid}/user-infos/about`), d => {
    currentProfileData = { ...(currentProfileData||{}), about: { ...(currentProfileData?.about||{}), ...d } };
    renderVisaoGeral(d);
    renderPronomes(d);
    renderModal(currentProfileData);
  });
  on(doc(db, `users/${uid}/user-infos/more-infos`), d => {
    currentProfileData = { ...(currentProfileData||{}), moreInfos: { ...(currentProfileData?.moreInfos||{}), ...d } };
    const bioEl = $('bio'); if (bioEl && d.bio) bioEl.textContent = d.bio;
  });
  _unsubs.push(onSnapshot(doc(db, `users/${uid}/user-infos/links`), s => {
    renderLinks(s.exists() ? s.data() : {});
  }));
}

// ═══════════════════════════════════════════════════════════
// RENDER FUNÇÕES
// ═══════════════════════════════════════════════════════════
function renderPrincipal(d) {
  const un = getUsername(d);
  const dn = getDisplayName(d);

  if ($('headername'))         $('headername').textContent = un;
  if ($('view-more-username')) $('view-more-username').textContent = '' + un;
  if ($('displayname'))        $('displayname').textContent = dn;
  if ($('nomeUsuario'))        $('nomeUsuario').textContent = dn;
  if ($('statususername'))     $('statususername').textContent = `${dn} está:`;
  if ($('tituloMural'))        $('tituloMural').textContent = `Mural de ${dn}`;

  $q('.verificado')?.classList.toggle('active', !!d.verified);
  ['tag01','tag02','tag03','tag04'].forEach(t => $q(`.${t}`)?.classList.toggle('active', !!d[t]));

  renderModal(currentProfileData);
}

function renderPronomes(about) {
  const el = $('username'); if (!el) return;
  const a = about?.pronom1 !== undefined ? about : (about?.about || {});
  const pronomes = [a.pronom1, a.pronom2].filter(Boolean);
  if (pronomes.length) {
    el.innerHTML = `<span style="color:#888;font-size:0.9em;">${pronomes.join('/')}</span>`;
  } else {
    el.textContent = '';
  }
}

function renderMidia(media) {
  const foto = media.pfp || media.userphoto;
  if (foto) {
    $qa('.profile-pic,.user-pic').forEach(el => {
      el.src = foto; el.onerror = () => { el.src = './src/img/default.jpg'; };
    });
    if (profileUserId) memCache.photos.set(profileUserId, foto);
  }
  const bannerSrc = media.banner || media.headerphoto;
  const bannerArea = $q('.pf-banner-area');
  const bannerEl   = $q('.profile-banner');
  if (bannerArea && bannerEl) {
    if (bannerSrc) { bannerEl.style.backgroundImage = `url(${bannerSrc})`; bannerArea.classList.remove('hidden'); }
    else bannerArea.classList.add('hidden');
  }
  if (media.background) $q('.glass-overlay')?.style.setProperty('display','none');
  if (media.musicTheme) {
    initMusicPlayer(media.musicTheme, media.musicThemeName || null);
  } else {
    const musicSection = document.querySelector('.music');
    if (musicSection) musicSection.style.display = 'none';
  }
}

// Modal "Ver mais sobre" — preenche dados
function renderModal(d) {
  if (!d) return;
  const set = (cls, val, fb='Não informado') => {
    const n = $q(`.${cls} span`); if (n) n.textContent = val || fb;
  };
  const unEl = $('username-modal');
  if (unEl) unEl.textContent = '' + (d.username || '');

  set('modal-info-nome',         d.name || d.displayName || d.displayname);
  set('modal-info-genero',       traduzirGenero(d.gender || d.about?.gender));
  set('modal-info-estado-civil', d.about?.maritalStatus);
  set('modal-info-localizacao',  d.about?.location || d.location);
  set('modal-info-buscando',     d.about?.searching);
  set('modal-info-overview',     d.about?.overview,    'Ainda não há nada por aqui...');
  set('modal-info-style',        d.about?.style,       'Ainda não há nada por aqui...');
  set('modal-info-personality',  d.about?.personality, 'Ainda não há nada por aqui...');
  set('modal-info-music',        d.likes?.music,       'Ainda não há nada por aqui...');
  set('modal-info-movies',       d.likes?.movies,      'Ainda não há nada por aqui...');
  set('modal-info-books',        d.likes?.books,       'Ainda não há nada por aqui...');
  set('modal-info-characters',   d.likes?.characters,  'Ainda não há nada por aqui...');
  set('modal-info-foods',        d.likes?.foods,       'Ainda não há nada por aqui...');
  set('modal-info-hobbies',      d.likes?.hobbies,     'Ainda não há nada por aqui...');
  set('modal-info-games',        d.likes?.games,       'Ainda não há nada por aqui...');
  set('modal-info-others',       d.likes?.others,      'Ainda não há nada por aqui...');
}

// ═══════════════════════════════════════════════════════════
// MODAL "VER MAIS SOBRE" — listeners de abrir/fechar
// Centralizado aqui para evitar conflito com o DOMContentLoaded
// do HTML (que roda antes do módulo e perde a referência quando
// o JS recria partes do DOM).
// ═══════════════════════════════════════════════════════════
function setupViewMoreModal() {
  const overlay  = $q('.more-overlay');
  const modal    = $q('.more-info-modal');
  const openBtn  = $q('.view-more');
  const dragArea = $q('.header-area');

  if (!overlay || !modal || !openBtn) return;

  function openMoreModal() {
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeMoreModal() {
    modal.style.transition = 'transform 0.38s cubic-bezier(0.32, 0.72, 0, 1)';
    modal.style.transform  = 'translateY(100%)';
    overlay.style.opacity  = '0';
    setTimeout(() => {
      overlay.classList.remove('active');
      modal.style.transform  = '';
      modal.style.transition = '';
      overlay.style.opacity  = '';
      document.body.style.overflow = '';
    }, 400);
  }

  // Remove listeners antigos clonando o botão
  const newOpenBtn = openBtn.cloneNode(true);
  openBtn.parentNode?.replaceChild(newOpenBtn, openBtn);
  newOpenBtn.addEventListener('click', openMoreModal);

  // Fecha ao clicar no fundo escuro
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeMoreModal();
  });

  if (!dragArea) return;

  // Drag to close — touch
  let _dragStartY = 0, _dragCurY = 0, _dragging = false;

  dragArea.addEventListener('touchstart', (e) => {
    _dragStartY = e.touches[0].clientY;
    _dragging = true;
    modal.style.transition = 'none';
  }, { passive: true });

  dragArea.addEventListener('touchmove', (e) => {
    if (!_dragging) return;
    _dragCurY = e.touches[0].clientY;
    const diff = _dragCurY - _dragStartY;
    if (diff > 0) modal.style.transform = `translateY(${diff}px)`;
  }, { passive: true });

  dragArea.addEventListener('touchend', () => {
    if (!_dragging) return;
    _dragging = false;
    const diff = _dragCurY - _dragStartY;
    if (diff > 80) {
      closeMoreModal();
    } else {
      modal.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      modal.style.transform  = 'translateY(0)';
    }
  });

  // Drag to close — mouse
  let _mouseStart = 0, _mouseDragging = false;

  dragArea.addEventListener('mousedown', (e) => {
    _mouseStart = e.clientY;
    _mouseDragging = true;
    modal.style.transition = 'none';
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);
  });

  function _onMouseMove(e) {
    if (!_mouseDragging) return;
    const diff = e.clientY - _mouseStart;
    if (diff > 0) modal.style.transform = `translateY(${diff}px)`;
  }

  function _onMouseUp(e) {
    if (!_mouseDragging) return;
    _mouseDragging = false;
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseup',   _onMouseUp);
    const diff = e.clientY - _mouseStart;
    if (diff > 80) {
      closeMoreModal();
    } else {
      modal.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      modal.style.transform  = 'translateY(0)';
    }
  }
}

// ═══════════════════════════════════════════════════════════
// EDIÇÃO INLINE DO "VER MAIS SOBRE" (só dono)
// ═══════════════════════════════════════════════════════════

const SVG_PEN = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
</svg>`;

const SVG_X = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

const SVG_SAVE = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
  <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
</svg>`;

const EDIT_FIELDS = [
  { cls: 'modal-info-genero',       label: 'Gênero',              subdoc: 'about',     field: 'gender'        },
  { cls: 'modal-info-estado-civil', label: 'Estado civil',        subdoc: 'about',     field: 'maritalStatus' },
  { cls: 'modal-info-localizacao',  label: 'Localização',         subdoc: 'about',     field: 'location'      },
  { cls: 'modal-info-buscando',     label: 'Buscando',            subdoc: 'about',     field: 'searching'     },
  { cls: 'modal-info-overview',     label: 'Visão geral',         subdoc: 'about',     field: 'overview'      },
  { cls: 'modal-info-style',        label: 'Estilo',              subdoc: 'about',     field: 'style'         },
  { cls: 'modal-info-personality',  label: 'Personalidade',       subdoc: 'about',     field: 'personality'   },
  { cls: 'modal-info-music',        label: 'Músicas',             subdoc: 'likes',     field: 'music'         },
  { cls: 'modal-info-movies',       label: 'Filmes/Séries',       subdoc: 'likes',     field: 'movies'        },
  { cls: 'modal-info-books',        label: 'Livros',              subdoc: 'likes',     field: 'books'         },
  { cls: 'modal-info-characters',   label: 'Personagens',         subdoc: 'likes',     field: 'characters'    },
  { cls: 'modal-info-foods',        label: 'Comidas',             subdoc: 'likes',     field: 'foods'         },
  { cls: 'modal-info-hobbies',      label: 'Hobbies',             subdoc: 'likes',     field: 'hobbies'       },
  { cls: 'modal-info-games',        label: 'Jogos',               subdoc: 'likes',     field: 'games'         },
  { cls: 'modal-info-others',       label: 'Outros gostos',       subdoc: 'likes',     field: 'others'        },
];

const SUBDOC_PATH = {
  about:     uid => `users/${uid}/user-infos/about`,
  likes:     uid => `users/${uid}/user-infos/likes`,
  moreInfos: uid => `users/${uid}/user-infos/more-infos`,
};

function renderVisaoGeral(a) {
  const tab = $q('.visao-tab .about-container'); if (!tab) return;
  const b = tab.querySelectorAll('.about-box');
  const safe = v => v || 'Não informado';
  if (b[0]) b[0].innerHTML = `<p class="about-title">Visão geral:</p><p>${safe(a.overview)}</p>`;
  if (b[1]) b[1].innerHTML = `<p class="about-title">Tags:</p><p>${safe(a.tags)}</p>`;
  if (b[2]) b[2].innerHTML = `<p class="about-title">Meu Estilo:</p><p>${safe(a.style||a.styles)}</p>`;
  if (b[3]) b[3].innerHTML = `<p class="about-title">Personalidade:</p><p>${safe(a.personality)}</p>`;
  if (b[4]) b[4].innerHTML = `<p class="about-title">Sonhos:</p><p>${safe(a.dreams)}</p>`;
  if (b[5]) b[5].innerHTML = `<p class="about-title">Medos:</p><p>${safe(a.fears)}</p>`;
}

function renderGostos(l) {
  const tab = $q('.gostos-tab .about-container'); if (!tab) return;
  const b = tab.querySelectorAll('.about-box');
  const safe = v => v || 'Não informado';
  if (b[0]) b[0].innerHTML = `<p class="about-title">Músicas:</p><p>${safe(l.music)}</p>`;
  if (b[1]) b[1].innerHTML = `<p class="about-title">Filmes e Séries:</p><p>${safe(l.movies)}</p>`;
  if (b[2]) b[2].innerHTML = `<p class="about-title">Livros:</p><p>${safe(l.books)}</p>`;
  if (b[3]) b[3].innerHTML = `<p class="about-title">Personagens:</p><p>${safe(l.characters)}</p>`;
  if (b[4]) b[4].innerHTML = `<p class="about-title">Comidas:</p><p>${safe(l.foods)}</p>`;
  if (b[5]) b[5].innerHTML = `<p class="about-title">Hobbies:</p><p>${safe(l.hobbies)}</p>`;
  if (b[6]) b[6].innerHTML = `<p class="about-title">Jogos:</p><p>${safe(l.games)}</p>`;
  if (b[7]) b[7].innerHTML = `<p class="about-title">Outros:</p><p>${safe(l.others)}</p>`;
}

function renderLinks(dados) {
  const c = $q('.links-tab .about-container'); if (!c) return;
  const redes = {
    instagram: { base:'https://instagram.com/',          icon:'fab fa-instagram',  label:'Instagram' },
    x:         { base:'https://x.com/',                  icon:'fab fa-twitter',    label:'X' },
    tiktok:    { base:'https://tiktok.com/@',            icon:'fab fa-tiktok',     label:'TikTok' },
    youtube:   { base:'https://youtube.com/',            icon:'fab fa-youtube',    label:'YouTube' },
    github:    { base:'https://github.com/',             icon:'fab fa-github',     label:'GitHub' },
    discord:   { base:'https://discord.com/users/',      icon:'fab fa-discord',    label:'Discord' },
    pinterest: { base:'https://pinterest.com/',          icon:'fab fa-pinterest',  label:'Pinterest' },
    spotify:   { base:'https://open.spotify.com/user/', icon:'fab fa-spotify',    label:'Spotify' },
    linkedin:  { base:'https://linkedin.com/in/',        icon:'fab fa-linkedin',   label:'LinkedIn' },
    twitch:    { base:'https://twitch.tv/',              icon:'fab fa-twitch',     label:'Twitch' },
    reddit:    { base:'https://reddit.com/u/',           icon:'fab fa-reddit',     label:'Reddit' },
  };
  const src = (dados.links && typeof dados.links === 'object') ? dados.links : dados;
  const itens = [];
  Object.entries(src).forEach(([k, v]) => {
    if (!v || typeof v !== 'string' || !v.trim()) return;
    const val = v.trim(); const r = redes[k];
    const href  = r ? (val.startsWith('http') ? val : r.base + val) : (val.startsWith('http') ? val : 'https://' + val);
    const icon  = r ? `<i class="${r.icon}"></i>` : `<i class="fas fa-external-link-alt"></i>`;
    const label = r ? r.label : k.charAt(0).toUpperCase() + k.slice(1);
    itens.push(`<div class="about-box">
      <a href="${href}" target="_blank" rel="noopener noreferrer"
         style="display:flex;align-items:center;gap:12px;color:#f8f9f9;text-decoration:none;padding:8px;">
        <span style="font-size:24px;">${icon}</span>
        <div><div style="font-weight:600;">${label}</div><div style="font-size:13px;color:#888;">${val}</div></div>
      </a></div>`);
  });
  c.innerHTML = itens.length ? itens.join('') : `
    <div class="about-box" style="text-align:center;padding:30px;">
      <div class="icon-area"><div class="icon-place"><i class="fas fa-link" style="font-size:38px;color:#fff;"></i></div></div>
      <h3 style="color:#fff;margin-bottom:12px;">Nenhum link ainda</h3>
      <p style="color:#555;">Este usuário ainda não adicionou nenhum link</p>
    </div>`;
}

function renderReposts() {
  const c = $q('.reposts-tab, .gostos-reposts-tab'); if (!c) return;
  const quem = isOwnProfile ? 'você fizer' : 'este usuário fizer';
  c.innerHTML = `
    <div class="about-box" style="text-align:center;padding:40px 20px;">
      <div class="icon-area" style="margin-bottom:16px;">
        <i class="fa-solid fa-repeat" style="font-size:40px;color:#444;"></i>
      </div>
      <h3 style="color:#666;margin-bottom:8px;">Nenhum repost ainda</h3>
      <p style="color:#444;font-size:14px;">Quando ${quem} um repost, ele aparecerá aqui.</p>
    </div>`;
}

function aplicarBordaNeon(d) {
  $('neon-border-style')?.remove();
  const bordas = {
    border1: ['rgb(4,63,255)','rgb(0,140,255)','rgba(0,160,253,0)','rgba(64,224,208,0.3)'],
    border2: ['rgb(255,4,4)','rgb(255,0,0)','rgba(253,0,0,0)','rgba(255,64,64,0.3)'],
    border3: ['rgb(255,255,255)','rgb(240,240,240)','rgba(255,255,255,0)','rgba(255,255,255,0.3)'],
    border4: ['rgb(138,43,226)','rgb(147,51,234)','rgba(138,43,226,0)','rgba(168,85,247,0.3)'],
  };
  const k = Object.keys(bordas).find(k => d[k] === true);
  if (!k) return;
  const [c1,c2,c3,c4] = bordas[k];
  const s = document.createElement('style');
  s.id = 'neon-border-style';
  s.textContent = `body::before{content:'';position:fixed;inset:0;border-radius:0 0 29px 29px;
    pointer-events:none;z-index:99999;
    box-shadow:inset 0 0 20px ${c1},inset 0 0 40px ${c2},0 0 20px ${c3},0 0 40px ${c4};
    animation:neonPulse 3s ease-in-out infinite;}
    @keyframes neonPulse{0%,100%{opacity:1;filter:brightness(1)}50%{opacity:.8;filter:brightness(1.2)}}`;
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════
// PREENCHER PERFIL COMPLETO
// ═══════════════════════════════════════════════════════════
function preencherPerfil(dados) {
  currentProfileData = dados;
  profileUsername = getUsername(dados);
  const dn = getDisplayName(dados);
  const un = getUsername(dados);

  renderPrincipal(dados);
  renderPronomes(dados.about || dados);

  const bioEl = $('bio'); if (bioEl) bioEl.textContent = dados.moreInfos?.bio || '';

  renderMidia(dados.media || {});
  renderLinks(dados.linksData || {});
  renderModal(dados);
  renderVisaoGeral(dados.about || {});
  renderGostos(dados.likes || {});
  renderReposts();
  aplicarBordaNeon(dados);

  const moreMenu = $('moreMenu') || $q('.more-menu');
  if (moreMenu) moreMenu.style.display = isOwnProfile ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════
// SEGUIR / SEGUIDORES
// ═══════════════════════════════════════════════════════════
async function estasSeguindo(meId, targetId) {
  try { return (await getDoc(doc(db, 'users', targetId, 'followers', meId))).exists(); } catch { return false; }
}
async function seguir(meId, targetId) {
  const now = new Date();
  await Promise.all([
    setDoc(doc(db, 'users', targetId, 'followers', meId), { userid: meId, followerin: now }),
    setDoc(doc(db, 'users', meId, 'following', targetId), { userid: targetId, followin: now }),
  ]);
}
async function desseguir(meId, targetId) {
  await Promise.all([
    deleteDoc(doc(db, 'users', targetId, 'followers', meId)),
    deleteDoc(doc(db, 'users', meId, 'following', targetId)),
  ]);
}
async function removerSeguidor(ownerUid, followerUid) {
  await Promise.all([
    deleteDoc(doc(db, 'users', ownerUid, 'followers', followerUid)),
    deleteDoc(doc(db, 'users', followerUid, 'following', ownerUid)),
  ]);
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════
async function atualizarStats(uid) {
  try {
    const [segSnap, segndoSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'followers')),
      getDocs(collection(db, 'users', uid, 'following')),
    ]);
    const segSet = new Set(segSnap.docs.map(d => d.id));
    const amigos = segndoSnap.docs.filter(d => segSet.has(d.id)).length;
    const statsEl = $q('.profile-stats'); if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-item stats-click" data-tab="amigos">
        <span class="stat-count">${amigos}</span>
        <span class="stat-label">amigos</span>
      </div>
      <div class="stat-item stats-click" data-tab="seguidores">
        <span class="stat-count">${segSnap.size}</span>
        <span class="stat-label">seguidores</span>
      </div>
      <div class="stat-item stats-click" data-tab="seguindo">
        <span class="stat-count">${segndoSnap.size}</span>
        <span class="stat-label">seguindo</span>
      </div>`;
    statsEl.querySelectorAll('.stats-click').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => abrirOverlay(uid, el.dataset.tab));
    });
  } catch (e) { console.error('atualizarStats:', e); }
}

// ═══════════════════════════════════════════════════════════
// OVERLAY DE LISTAS — Seguindo / Seguidores / Amigos
// ═══════════════════════════════════════════════════════════
function abrirOverlay(uid, tabInicial = 'seguidores') {
  if ($('listas-overlay')) return;

  const style = document.createElement('style');
  style.id = 'listas-overlay-css';
  style.textContent = `
    #listas-overlay {
      position: fixed; inset: 0; z-index: 999999;
      background: var(--bg-primary, #0f0f0f);
      display: flex; flex-direction: column;
      animation: lo-in .3s cubic-bezier(.4,0,.2,1);
      overflow: hidden;
    }
    @keyframes lo-in { from { transform: translateY(60px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes lo-out { from { transform: translateY(0); opacity: 1; } to { transform: translateY(60px); opacity: 0; } }
    #listas-overlay.closing { animation: lo-out .25s cubic-bezier(.4,0,.2,1) forwards; }

    .lo-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px;
      padding-top: max(16px, env(safe-area-inset-top, 16px));
    }
    .lo-back {
      width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
      background: none; border: none; color: #f8f9f9; cursor: pointer;
      border-radius: 50%; transition: background .15s;
    }

    .lo-title { font-size: 18px; font-weight: 700; color: #f8f9f9; }
    .lo-spacer { width: 40px; }

    .lo-tabs {
      display: flex; position: relative; flex-shrink: 0;
      border-bottom: 1px solid #1e1e1e;
    }
    .lo-tab-btn {
      flex: 1; background: none; border: none; color: #666;
      padding: 13px 0; font-size: 14px; font-weight: 600; cursor: pointer;
      transition: color .2s; position: relative; z-index: 1;
    }
    .lo-tab-btn.active { color: #f8f9f9; }
    .lo-indicator-track {
      position: absolute; bottom: 0; left: 0; right: 0; height: 2px;
    }
    .lo-indicator {
      position: absolute; bottom: 0; height: 2px;
      background: #fff;
      transition: left .25s cubic-bezier(.4,0,.2,1), width .25s cubic-bezier(.4,0,.2,1);
    }

    .lo-pages-wrap { flex: 1; overflow: hidden; position: relative; }
    .lo-pages {
      display: flex; height: 100%;
      transition: transform .28s cubic-bezier(.4,0,.2,1);
      will-change: transform;
    }
    .lo-page {
      min-width: 100%; height: 100%; overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 120px;
    }

    .lo-user-row {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px;
      cursor: pointer; transition: background .12s;
    }
    .lo-avatar {
      width: 50px; height: 50px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0;
      background: #1e1e1e;
    }
    .lo-user-info { flex: 1; min-width: 0; }
    .lo-user-username {
      font-size: 15px; font-weight: 600; color: #f8f9f9;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .lo-user-pronouns { font-size: 13px; color: #666; margin-top: 2px; }
    .lo-action-btn {
      flex-shrink: 0; padding: 7px 16px;
      border-radius: 10px; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all .15s;
      background: transparent; color: #f8f9f9;
    }
    .lo-action-btn.following {
      background: #4A90E2; border-color: #4A90E2; color: #fff;
    }
    .lo-action-btn.danger { border-color: #f85149; color: #f85149; }
    .lo-action-btn:disabled { opacity: .4; pointer-events: none; }

    .lo-empty {
      display: flex; flex-direction: column; align-items: center;
      padding: 80px 20px; color: #444; text-align: center; gap: 12px;
    }
    .lo-empty i { font-size: 42px; color: #fff; }
    .lo-empty p { font-size: 14px; line-height: 1.5; }
    .lo-loading { text-align: center; padding: 60px; color: #444; }
    .lo-loading i { font-size: 24px; }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'listas-overlay';
  overlay.innerHTML = `
    <div class="page-content-pc-container">
    <div class="page-pc-area">
    <div class="lo-header">
      <button class="lo-back" id="lo-back-btn" aria-label="Voltar">
        <svg viewBox="0 0 298 512" width="18" height="18" fill="currentColor">
          <path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16L12.23 285.39c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7L100.27 256.08 285.77 441z"/>
        </svg>
      </button>
      <span class="lo-title">${profileUsername}</span>
      <span class="lo-spacer"></span>
    </div>
    <div class="lo-tabs">
      <button class="lo-tab-btn" data-idx="0">Seguindo</button>
      <button class="lo-tab-btn" data-idx="1">Seguidores</button>
      <button class="lo-tab-btn" data-idx="2">Amigos</button>
      <div class="lo-indicator-track">
        <div class="lo-indicator" id="lo-indicator"></div>
      </div>
    </div>
    <div class="lo-pages-wrap">
      <div class="lo-pages" id="lo-pages">
        <div class="lo-page" id="lo-page-0"></div>
        <div class="lo-page" id="lo-page-1"></div>
        <div class="lo-page" id="lo-page-2"></div>
      </div>
    </div>
    </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const TABS = ['seguindo', 'seguidores', 'amigos'];
  const tabBtns  = overlay.querySelectorAll('.lo-tab-btn');
  const pages    = overlay.querySelector('#lo-pages');
  const indicator = overlay.querySelector('#lo-indicator');
  const loaded   = new Set();
  let curTab = Math.max(0, TABS.indexOf(tabInicial));
  let swipeStartX = 0, swipeStartY = 0, swiping = false;

  function moveIndicator(idx) {
    const btn = tabBtns[idx];
    indicator.style.left  = btn.offsetLeft + 'px';
    indicator.style.width = btn.offsetWidth + 'px';
  }

  function setTab(idx, animate = true) {
    if (idx < 0 || idx >= 3) return;
    curTab = idx;
    tabBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
    pages.style.transition = animate ? '' : 'none';
    pages.style.transform  = `translateX(-${idx * 100}%)`;
    if (!animate) pages.getBoundingClientRect();
    moveIndicator(idx);
    if (!loaded.has(idx)) { loaded.add(idx); carregarLista(uid, TABS[idx], idx); }
  }

  requestAnimationFrame(() => { setTab(curTab, false); });

  tabBtns.forEach(btn => btn.addEventListener('click', () => setTab(+btn.dataset.idx)));

  overlay.addEventListener('touchstart', e => {
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });
  overlay.addEventListener('touchmove', e => {
    if (!swiping) return;
    const dx = e.touches[0].clientX - swipeStartX;
    const dy = e.touches[0].clientY - swipeStartY;
    if (Math.abs(dy) > Math.abs(dx) + 10) { swiping = false; }
  }, { passive: true });
  overlay.addEventListener('touchend', e => {
    if (!swiping) return;
    swiping = false;
    const dx = e.changedTouches[0].clientX - swipeStartX;
    if (Math.abs(dx) > 55) setTab(curTab + (dx < 0 ? 1 : -1));
  }, { passive: true });

  function fecharOverlay() {
    overlay.classList.add('closing');
    setTimeout(() => {
      overlay.remove();
      $('listas-overlay-css')?.remove();
      document.body.style.overflow = '';
    }, 260);
  }
  overlay.querySelector('#lo-back-btn').addEventListener('click', fecharOverlay);
}

async function carregarLista(profileUid, tipo, pageIdx) {
  const page = $(`lo-page-${pageIdx}`);
  if (!page) return;
  page.innerHTML = `<div class="lo-loading"><i class="fas fa-spinner fa-spin"></i></div>`;

  try {
    let uids = [];
    if (tipo === 'seguindo') {
      const s = await getDocs(collection(db, 'users', profileUid, 'following'));
      uids = s.docs.map(d => d.id);
    } else if (tipo === 'seguidores') {
      const s = await getDocs(collection(db, 'users', profileUid, 'followers'));
      uids = s.docs.map(d => d.id);
    } else if (tipo === 'amigos') {
      const [seg, sendo] = await Promise.all([
        getDocs(collection(db, 'users', profileUid, 'followers')),
        getDocs(collection(db, 'users', profileUid, 'following')),
      ]);
      const segSet = new Set(seg.docs.map(d => d.id));
      uids = sendo.docs.filter(d => segSet.has(d.id)).map(d => d.id);
    }

    page.innerHTML = '';
    if (!uids.length) {
      page.innerHTML = `<div class="lo-empty"><i class="fas fa-users"></i><p>Nenhum usuário aqui ainda.</p></div>`;
      return;
    }

    for (let i = 0; i < uids.length; i += 8) {
      await Promise.all(uids.slice(i, i+8).map(uid => adicionarLinhaUsuario(uid, profileUid, tipo, page)));
    }
  } catch (e) {
    console.error('carregarLista:', e);
    page.innerHTML = `<div class="lo-empty"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar.</p></div>`;
  }
}

async function adicionarLinhaUsuario(uid, profileUid, tipo, container) {
  const [userData, foto] = await Promise.all([getUserData(uid), getUserPhoto(uid)]);
  const un = userData.username || uid;
  const dn = getDisplayName(userData);

  const row = document.createElement('div');
  row.className = 'lo-user-row';

  let actionHTML = '';
  if (isOwnProfile) {
    if (tipo === 'seguidores') {
      actionHTML = `<button class="lo-action-btn danger" data-action="remove" data-uid="${uid}">Remover</button>`;
    } else if (tipo === 'seguindo') {
      actionHTML = `<button class="lo-action-btn following" data-action="unfollow" data-uid="${uid}">Seguindo</button>`;
    }
  } else if (currentUserId && uid !== currentUserId) {
    const jaSegue = await estasSeguindo(currentUserId, uid);
    actionHTML = `<button class="lo-action-btn ${jaSegue ? 'following' : ''}"
      data-action="follow" data-uid="${uid}" data-following="${jaSegue}">
      ${jaSegue ? 'Seguindo' : 'Seguir'}
    </button>`;
  }

  row.innerHTML = `
    <img class="lo-avatar" src="${foto}" alt="${un}"
         onerror="this.src='./src/img/default.jpg'">
    <div class="lo-user-info">
      <div class="lo-user-username">${un}</div>
      ${dn !== un ? `<div class="lo-user-pronouns">${dn}</div>` : ''}
    </div>
    ${actionHTML}`;

  row.addEventListener('click', e => {
    if (e.target.closest('.lo-action-btn')) return;
    window.location.href = `profile.html?username=${encodeURIComponent(un)}`;
  });

  const btn = row.querySelector('.lo-action-btn');
  if (btn) {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      btn.disabled = true;
      const action = btn.dataset.action;

      if (action === 'remove') {
        btn.textContent = '...';
        await removerSeguidor(profileUid, uid);
        row.style.transition = 'opacity .3s'; row.style.opacity = '0';
        setTimeout(() => row.remove(), 320);
        atualizarStats(profileUid);

      } else if (action === 'unfollow') {
        btn.textContent = '...';
        await desseguir(currentUserId, uid);
        row.style.transition = 'opacity .3s'; row.style.opacity = '0';
        setTimeout(() => row.remove(), 320);
        atualizarStats(profileUid);

      } else if (action === 'follow') {
        const jaSegue = btn.dataset.following === 'true';
        btn.textContent = '...';
        if (jaSegue) {
          await desseguir(currentUserId, uid);
          btn.textContent = 'Seguir'; btn.classList.remove('following'); btn.dataset.following = 'false';
        } else {
          await seguir(currentUserId, uid);
          btn.textContent = 'Seguindo'; btn.classList.add('following'); btn.dataset.following = 'true';
        }
        btn.disabled = false;
        atualizarStats(profileUid);
      }
    });
  }

  container.appendChild(row);
}




// ═══════════════════════════════════════════════════════════
// BOTÕES DINÂMICOS DO PERFIL
// ═══════════════════════════════════════════════════════════
async function configurarBotoes(targetUid) {
  const btnOutro        = $q('.action-btn.pf');
  const btnEditar       = $q('.action-btn.mypf');
  const btnCompartilhar = $q('.actions-btn .action-btn:not(.pf):not(.mypf):not(.sugestions)');
  const btnSugestoes    = $q('.action-btn.sugestions');
  const nudgeBtn        = $q('.btn-nudge');
  const moreMenu        = $('moreMenu') || $q('.more-menu');

  function substituir(btn) {
    if (!btn) return null;
    const novo = btn.cloneNode(true);
    btn.parentNode?.replaceChild(novo, btn);
    return novo;
  }

  if (moreMenu) moreMenu.style.display = isOwnProfile ? '' : 'none';

  [btnOutro, btnEditar, btnSugestoes, nudgeBtn].forEach(b => b && (b.style.display = 'none'));

  const shareBtn = substituir(btnCompartilhar);
  if (shareBtn) {
    shareBtn.style.display = 'inline-flex';
    shareBtn.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?username=${encodeURIComponent(profileUsername)}`;
      if (navigator.share) {
        navigator.share({ title: `Perfil de ${profileUsername}`, url }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(url).then(() => {
          const orig = shareBtn.textContent;
          shareBtn.textContent = 'Copiado!';
          setTimeout(() => { shareBtn.textContent = orig; }, 2000);
        });
      }
    });
  }

  if (!currentUserId) return;

  if (isOwnProfile) {
    const editBtn = substituir(btnEditar);
    if (editBtn) {
      editBtn.style.display = 'inline-flex';
      editBtn.addEventListener('click', () => { window.location.href = 'edit.html'; });
    }
    return;
  }

  const followBtn = substituir(btnOutro);
  if (followBtn) {
    followBtn.style.display = 'inline-flex';
    let isF = await estasSeguindo(currentUserId, targetUid);

    const atualizar = () => {
      followBtn.textContent = isF ? 'Seguindo' : 'Seguir';
      followBtn.classList.toggle('following', isF);
      followBtn.style.background    = isF ? '#2b2f33' : 'var(--primary-btn, #4A90E2)';
      followBtn.style.color         = isF ? '#fff' : '#fff';
      followBtn.style.borderColor   = 'var(--primary-btn, #4A90E2)';
      followBtn.disabled = false;
    };
    atualizar();

    followBtn.addEventListener('click', async () => {
      followBtn.disabled = true; followBtn.textContent = 'Seguir';
      try {
        if (isF) {
          await desseguir(currentUserId, targetUid);
          isF = false;
        } else {
          await seguir(currentUserId, targetUid);
          isF = true;
 
          // ✅ Verifica amizade mútua — se o alvo também me segue, dispara atividade
          try {
            const mutuoSnap = await getDoc(
              doc(db, 'users', currentUserId, 'followers', targetUid)
            );
            if (mutuoSnap.exists()) {
              // Pega username do alvo para o texto da atividade
              const targetData = await getUserData(targetUid);
              const targetUsername = targetData.username || targetUid;
              triggerNovaAmizade(targetUid, targetUsername).catch(console.warn);
            }
          } catch (e) {
            console.warn('Erro ao checar amizade mútua:', e);
          }
        }
      } catch (e) { console.error('follow toggle:', e); }
      atualizar();
      atualizarStats(targetUid);
    });
  }

  const sharebtn = $q('.share');
  if (sharebtn) {
    sharebtn.style.display = 'none';
  }

  const nav = $q('.navbar-bottom');
  if (nav) { nav.style.display = 'none'; document.body.classList.add('no-navbar-bottom'); }

  const msgBtn = substituir(btnSugestoes);
  if (msgBtn) {
    msgBtn.style.display = 'flex';
    msgBtn.title = 'Mensagem';
    msgBtn.addEventListener('click', () => iniciarChat(targetUid));
  }
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════
async function iniciarChat(targetUid) {
  if (!currentUserId || !targetUid || currentUserId === targetUid) return;
  const chatId = `chat-${[currentUserId, targetUid].sort().join('-')}`;
  try {
    await setDoc(doc(db, 'chats', chatId), {
      participants: [currentUserId, targetUid].sort(),
      createdAt: new Date(), lastMessage: '', lastMessageTime: null,
    }, { merge: true });
    window.location.href = `direct.html?chatid=${chatId}`;
  } catch (e) { console.error('iniciarChat:', e); alert('Erro ao iniciar conversa.'); }
}

// ═══════════════════════════════════════════════════════════
// POSTS
// ═══════════════════════════════════════════════════════════
async function carregarPosts(uid) {
  const c = $('muralPosts') || $q('.mural-tab'); if (!c || !uid) return;
  c.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Carregando posts...</p></div>`;
  try {
    const snap = await getDocs(collection(db, 'posts'));
    const posts = [];
    snap.forEach(d => { if (d.data().creatorid === uid) posts.push({ id: d.id, data: d.data() }); });
    posts.sort((a, b) => {
      const ts = x => x?.toDate?.()?.getTime?.() || (x?.seconds ? x.seconds*1000 : new Date(x||0).getTime());
      return ts(b.data.create) - ts(a.data.create);
    });
    postsDoUsuario = posts.map(p => ({ id: p.id, userid: uid, data: p.data }));
    c.innerHTML = '';
    
    if (!posts.length) {
      c.classList.add('empty-posts');
      c.innerHTML = `
      <div class="about-box" style="text-align:center;padding:30px; width: 100% !important;">
      <div class="icon-area"><div class="icon-place"><i class="fa-regular fa-camera" style="font-size:38px;color:#fff;"></i></div></div>
      <h3 style="color:#fff;margin-bottom:12px;">Nenhum post ainda</h3>
      <p style="color:#555;">Este usuário ainda não fez nenhum post.</p>
    </div>
    `;

      return;
    }
    c.classList.remove('empty-posts');
    posts.forEach(p => c.appendChild(criarPreview(p.data, p.id)));
  } catch (e) {
    console.error('carregarPosts:', e);
    c.innerHTML = `<p style="color:#aaa;text-align:center;padding:20px;">Erro ao carregar posts.</p>`;
  }
}

function criarPreview(postData, postId) {
  const el = document.createElement('div');
  el.className = 'postpreview';
  if (postData.img?.trim()) {
    el.innerHTML = `<img src="${postData.img}" class="post-preview-img"
      onerror="this.parentElement.innerHTML='<div class=post-preview-error>Erro</div>'">`;
  } else {
    const txt = postData.content || '';
    el.innerHTML = `<div class="post-preview-text-container">
      <p class="post-preview-text">${txt.length > 80 ? txt.slice(0,80)+'…' : txt}</p></div>`;
  }
  el.onclick = () => { const i = postsDoUsuario.findIndex(p => p.id === postId); abrirFeed(i); console.log("clicado") };
  return el;
}


// ═══════════════════════════════════════════════════════════
// DEPOIMENTOS
// ═══════════════════════════════════════════════════════════
async function carregarDepoimentos(uid) {
  const c = $q('.deps-tab .about-container'); if (!c) return;
  c.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div></div>`;
  try {
    const snap = await getDocs(query(collection(db, 'users', uid, 'depoimentos'), orderBy('criadoem','desc')));
    c.innerHTML = '';
    if (uid !== currentUserId) {
      const form = document.createElement('div'); form.className = 'depoimento-form';
      form.innerHTML = `<h4>Deixar um depoimento</h4>
        <div class="form-actions">
          <textarea id="depoimentoTexto" placeholder="Escreva seu depoimento..." maxlength="500"></textarea>
          <button class="btn-enviar-depoimento" onclick="window._enviarDepoimento('${uid}')">
            <i class="fas fa-paper-plane"></i> Enviar
          </button>
        </div>`;
      c.appendChild(form);
    }
    if (snap.empty) {
      const e = document.createElement('div'); e.className = 'empty-depoimentos';
      e.innerHTML = `<div class="empty-icon"><i class="fas fa-comments"></i></div>
        <h3>Nenhum depoimento ainda</h3>
        <p>${uid === currentUserId ? 'Você ainda não recebeu depoimentos.' : 'Seja o primeiro a deixar um!'}</p>`;
      c.appendChild(e); return;
    }
    for (const d of snap.docs) {
      const data = d.data();
      const [autor, foto] = await Promise.all([
        data.creatorid ? getUserData(data.creatorid) : Promise.resolve({}),
        data.creatorid ? getUserPhoto(data.creatorid) : Promise.resolve('./src/img/default.jpg'),
      ]);
      const un = getUsername(autor) || 'usuario';
      const podeEx = currentUserId === uid || currentUserId === data.creatorid;
      const el = document.createElement('div'); el.className = 'depoimento-card';
      el.innerHTML = `
        <div class="depoimento-header">
          <div class="autor-info">
            <img src="${foto}" class="autor-pic" onerror="this.src='./src/img/default.jpg'"
                 onclick="window.location.href='profile.html?username=${encodeURIComponent(un)}'">
            <div class="autor-details">
              <span class="autor-nome" style="cursor:pointer"
                    onclick="window.location.href='profile.html?username=${encodeURIComponent(un)}'">${un}</span>
              <span class="depo-time">${formatTs(data.criadoem)}</span>
            </div>
          </div>
          ${podeEx ? `<button class="delete-depo-btn" onclick="window._excluirDepoimento('${d.id}','${uid}')">
            <i class="fas fa-trash"></i></button>` : ''}
        </div>
        <div class="depoimento-content"><p>${data.conteudo || ''}</p></div>`;
      c.appendChild(el);
    }
  } catch (e) { console.error('depoimentos:', e); c.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">Erro ao carregar.</p>'; }
}

window._enviarDepoimento = async (uid) => {
  const ta = $('depoimentoTexto'), btn = $q('.btn-enviar-depoimento');
  if (!ta || !btn) return;
  const txt = ta.value.trim();
  if (!txt) { alert('Escreva um depoimento.'); return; }
  if (currentUserId === uid) { alert('Você não pode deixar um depoimento para si mesmo.'); return; }
  btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
  try {
    await setDoc(doc(db, 'users', uid, 'depoimentos', `dep-${Date.now()}`), {
      conteudo: txt, creatorid: currentUserId, criadoem: new Date(),
    });
    ta.value = ''; await carregarDepoimentos(uid);
  } catch { alert('Erro ao enviar.'); }
  finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar'; }
};
window._excluirDepoimento = async (id, uid) => {
  if (!confirm('Excluir este depoimento?')) return;
  await deleteDoc(doc(db, 'users', uid, 'depoimentos', id));
  carregarDepoimentos(uid);
};
window.enviarDepoimento  = window._enviarDepoimento;
window.excluirDepoimento = window._excluirDepoimento;

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
function configurarTabs(uid) {
  const items  = $qa('.menu-item');
  const tabs   = $qa('.tab');
  const slider = $q('.slider');
  if (!items.length || !tabs.length || !slider) return;
  let busy = false;

  const mover = i => { slider.style.transform = `translateX(${i * 100}%)`; };

  const trocar = async i => {
    if (busy) return; busy = true;
    const atual = $q('.tab.active');
    if (atual) { atual.classList.add('fade-out'); await new Promise(r => setTimeout(r, 200)); atual.classList.remove('active','fade-out'); }
    if (tabs[i]) { tabs[i].classList.add('active','fade-in'); await new Promise(r => setTimeout(r, 300)); tabs[i].classList.remove('fade-in'); }
    if (i === 0 && !$q('#muralPosts .postpreview')) await carregarPosts(uid);
    if (i === 3) await carregarDepoimentos(uid);
    busy = false;
  };

  items.forEach((item, i) => {
    item.addEventListener('click', async () => {
      if (busy || item.classList.contains('active')) return;
      items.forEach(m => m.classList.remove('active')); item.classList.add('active');
      mover(i); await trocar(i);
    });
  });
  items[0]?.classList.add('active'); tabs[0]?.classList.add('active'); mover(0);
}

// ═══════════════════════════════════════════════════════════
// NUDGE
// ═══════════════════════════════════════════════════════════
function fadePopup(p) { p.classList.add('saindo'); setTimeout(() => p.remove(), 500); }

function setupNudge() {
  const btn = $q('.btn-nudge'); if (!btn) return;
  const newBtn = btn.cloneNode(true); btn.parentNode?.replaceChild(newBtn, btn);
  newBtn.addEventListener('click', async () => {
    try { new Audio('./src/audio/nudge.mp3').play(); } catch {}
    document.body.classList.add('shake-leve');
    setTimeout(() => document.body.classList.remove('shake-leve'), 500);
    if (!currentUserId || !profileUserId || profileUserId === currentUserId) return;
    try {
      await addDoc(collection(db, 'nudges'), { to: profileUserId, from: currentUserId, data: serverTimestamp() });
      const u = await getUserData(profileUserId);
      const p = document.createElement('div'); p.className = 'nudge-popup nudge-confirm';
      p.innerHTML = `<p>Você enviou um Nudge para <strong>${getUsername(u) || 'usuário'}</strong>!</p><button>Fechar</button>`;
      document.body.appendChild(p);
      p.querySelector('button').onclick = () => fadePopup(p);
      setTimeout(() => fadePopup(p), 4000);
    } catch (e) { console.error('nudge send:', e); }
  });
}

function monitorarNudges() {
  if (!currentUserId) return;
  onSnapshot(query(collection(db, 'nudges'), where('to','==', currentUserId)), snap => {
    snap.docChanges().forEach(async change => {
      if (change.type !== 'added') return;
      const n = change.doc.data();
      const [u, f] = await Promise.all([getUserData(n.from), getUserPhoto(n.from)]);
      try { new Audio('./src/audio/nudge-forte.mp3').play(); } catch {}
      document.body.classList.add('shake-forte');
      setTimeout(() => document.body.classList.remove('shake-forte'), 800);
      const p = document.createElement('div'); p.className = 'nudge-popup';
      p.innerHTML = `<img src="${f}" class="nudge-photo">
        <p><strong>${getUsername(u)||'usuário'}</strong> te enviou um nudge!</p>
        <button onclick="window.location.href='direct-mobile.html?chatid=chat-${n.from}'">Mensagem</button>
        <button>Fechar</button>`;
      document.body.appendChild(p);
      p.querySelectorAll('button')[1].onclick = () => fadePopup(p);
      setTimeout(() => fadePopup(p), 10000);
    });
  });
}

// ═══════════════════════════════════════════════════════════
// MARQUEE
// ═══════════════════════════════════════════════════════════
async function atualizarMarquee() {
  const el = $q('.marquee'); if (!el) return;
  try {
    const s = await getDoc(doc(db, 'lastupdate', 'latestUser'));
    el.textContent = s.exists() ? `${s.data().username || 'Alguém'} acabou de entrar no RealMe!` : 'Bem-vindo ao RealMe!';
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// MODAL DE IMAGEM
// ═══════════════════════════════════════════════════════════
window.abrirModalImagem = url => {
  const m = document.createElement('div'); m.className = 'image-modal';
  m.innerHTML = `<div class="modal-overlay" onclick="fecharModal()">
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="fecharModal()"><i class="fas fa-times"></i></button>
      <img src="${url}" class="modal-image">
    </div></div>`;
  document.body.appendChild(m); document.body.style.overflow = 'hidden';
};
window.fecharModal = () => {
  const m = $q('.image-modal'); if (m) { m.remove(); document.body.style.overflow = ''; }
};

// ═══════════════════════════════════════════════════════════
// INICIALIZAÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════
lsClean();

// Inicializa o modal "Ver mais" assim que o DOM estiver pronto,
// garantindo que o listener seja registrado DEPOIS do módulo carregar.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupViewMoreModal);
} else {
  setupViewMoreModal();
}


onAuthStateChanged(auth, async user => {
  currentUser   = user;
  currentUserId = user?.uid || null;

  const usernameURL = urlParam('username') || urlParam('u') || urlParam('user');
  const useridURL   = urlParam('userid')   || urlParam('uid');

  async function boot(uid) {
    await Promise.all([configurarBotoes(uid), atualizarStats(uid)]);
    await carregarPosts(uid);
    configurarTabs(uid);
    setupNudge();
    setupStickyMenu();
    // Re-registra o modal após configurarBotoes (que pode clonar elementos próximos)
    setupViewMoreModal();
    if (user) monitorarNudges();
    await atualizarMarquee();
    if (currentProfileData) aplicarBordaNeon(currentProfileData);
    if (currentProfileData?.media?.profileColor) renderMidia(currentProfileData.media);
    renderReposts();
  }

  if (usernameURL) {
    const uid = await resolveUsername(usernameURL);
    if (!uid) { mostrarErro('Perfil não encontrado. Verifique o username.'); return; }
    profileUserId = uid;
    isOwnProfile  = !!(user && user.uid === uid);

    const cached = lsGet(usernameURL.toLowerCase().trim());
    if (cached) {
      preencherPerfil(cached);
      setupListeners(uid);
      if (cached.__stale) carregarDados(uid).then(d => { if (d) lsSave(usernameURL.toLowerCase().trim(), d); });
    } else {
      const dados = await carregarDados(uid);
      if (!dados) return;
      preencherPerfil(dados);
      lsSave(usernameURL.toLowerCase().trim(), dados);
      setupListeners(uid);
    }
    await boot(uid);

  } else if (useridURL) {
    profileUserId = useridURL;
    isOwnProfile  = !!(user && user.uid === useridURL);
    const dados = await carregarDados(useridURL);
    if (!dados) return;
    preencherPerfil(dados);
    setupListeners(useridURL);
    await boot(useridURL);

  } else if (user) {
    try {
      const ud = await getDoc(doc(db, 'users', user.uid));
      if (ud.exists()) window.location.href = `profile.html?username=${ud.data().username}`;
      else mostrarErro('Complete seu cadastro para acessar o perfil.');
    } catch { mostrarErro('Erro ao redirecionar.'); }

  } else {
    mostrarErro('Faça login para acessar esta página.');
  }
});