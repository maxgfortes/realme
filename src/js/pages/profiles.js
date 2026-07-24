// ═══════════════════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, getDocs, addDoc, onSnapshot,
  collection, query, orderBy, where, setDoc, updateDoc,
  deleteDoc, serverTimestamp, limit, startAfter,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { triggerNovaAmizade } from '../../components/activitie-creator.js';
import { openProfileTimeline, renderPost } from '../../components/posts.js';

const app = getApps().length ? getApps()[0] : initializeApp({
  apiKey:            "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain:        "ifriendmatch.firebaseapp.com",
  projectId:         "ifriendmatch",
  storageBucket:     "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId:             "1:306331636603:web:c0ae0bd22501803995e3de",
});

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
let _lastPostSnap      = null;
let _profileUidForPosts = null;
let _gridLoading       = false;
let _gridNoMore        = false;
let _gridObserver      = null;
const _unsubs          = []; // todos os listeners ativos

// ═══════════════════════════════════════════════════════════
// HELPERS DOM
// ═══════════════════════════════════════════════════════════
const $    = id  => document.getElementById(id);
const $q   = sel => document.querySelector(sel);
const urlParam = name => new URLSearchParams(window.location.search).get(name);

function getDisplayName(d) {
  const fullName = [d?.name, d?.surname]
    .filter(Boolean)
    .join(' ');

  return (
    fullName ||
    d?.displayName ||
    d?.displayname ||
    d?.username ||
    'Usuário'
  );
}
function getUsername(d)    { return d?.username || ''; }
function safe(fn)          { try { fn(); } catch (e) { console.warn(e); } }

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

// ═══════════════════════════════════════════════════════════
// CACHE — memória + localStorage
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
  if (!uid) return './public/img/default.jpg';
  if (memCache.photos.has(uid)) return memCache.photos.get(uid);
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'user-infos', 'user-media'));
    const d = snap.exists() ? snap.data() : {};
    const p = d.pfp || d.userphoto || './public/img/default.jpg';
    memCache.photos.set(uid, p);
    return p;
  } catch { return './public/img/default.jpg'; }
}

// localStorage — TTL 7 dias, stale após 5 min
const LS_PFX    = 'profile_cache_';
const LS_TTL    = 7 * 24 * 60 * 60 * 1000;
const LS_STALE  = 5 * 60 * 1000;
const LS_UID_PFX = 'uid_cache_';
const LS_UID_TTL = 30 * 60 * 1000;

function lsSaveUid(username, uid) {
  try { localStorage.setItem(LS_UID_PFX + username, JSON.stringify({ ts: Date.now(), uid })); } catch {}
}
function lsGetUid(username) {
  try {
    const raw = localStorage.getItem(LS_UID_PFX + username);
    if (!raw) return null;
    const { ts, uid } = JSON.parse(raw);
    if (Date.now() - ts > LS_UID_TTL) { localStorage.removeItem(LS_UID_PFX + username); return null; }
    return uid;
  } catch { return null; }
}
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
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PFX) || k.startsWith(LS_UID_PFX))
      .forEach(k => {
        try {
          const { ts } = JSON.parse(localStorage.getItem(k));
          const ttl = k.startsWith(LS_UID_PFX) ? LS_UID_TTL : LS_TTL;
          if (Date.now() - ts > ttl) localStorage.removeItem(k);
        } catch { localStorage.removeItem(k); }
      });
  } catch {}
}

// ═══════════════════════════════════════════════════════════
// RESOLVER USERNAME → UID
// ═══════════════════════════════════════════════════════════
async function resolveUsername(raw) {
  const key = raw.trim().toLowerCase();
  const cached = lsGetUid(key);
  if (cached) return cached;
  try {
    const s = await getDoc(doc(db, 'usernames', key));
    if (s.exists() && s.data().uid) { lsSaveUid(key, s.data().uid); return s.data().uid; }
  } catch {}
  try {
    const s = await getDocs(query(collection(db, 'users'), where('username', '==', key)));
    if (!s.empty) { lsSaveUid(key, s.docs[0].id); return s.docs[0].id; }
  } catch {}
  try {
    const s = await getDocs(query(collection(db, 'users'), where('username', '==', raw.trim())));
    if (!s.empty) { lsSaveUid(key, s.docs[0].id); return s.docs[0].id; }
  } catch {}
  return null;
}

// ═══════════════════════════════════════════════════════════
// LISTENERS TEMPO REAL — todos registrados em _unsubs
// ═══════════════════════════════════════════════════════════
function setupListeners(uid) {
  _unsubs.forEach(u => u());
  _unsubs.length = 0;

  const sub = (ref, fn) => _unsubs.push(onSnapshot(ref, s => { if (s.exists()) fn(s.data()); }));

  sub(doc(db, 'users', uid), d => {
    memCache.users.set(uid, d);
    currentProfileData = { ...(currentProfileData || {}), ...d };
    safe(() => renderPrincipal(d));
  });

  sub(doc(db, `users/${uid}/user-infos/user-media`), d => {
    currentProfileData = { ...(currentProfileData || {}), media: { ...(currentProfileData?.media || {}), ...d } };
    safe(() => renderMidia(d));
  });

  sub(doc(db, `users/${uid}/user-infos/likes`), d => {
    currentProfileData = { ...(currentProfileData || {}), likes: d };
    safe(() => renderGostos(d));
    safe(() => renderModal(currentProfileData));
  });

  sub(doc(db, `users/${uid}/user-infos/about`), d => {
    currentProfileData = { ...(currentProfileData || {}), about: d };
    safe(() => renderVisaoGeral(d));
    safe(() => renderPronomes(d));
    safe(() => renderModal(currentProfileData));
  });

  sub(doc(db, `users/${uid}/user-infos/more-infos`), d => {
    currentProfileData = { ...(currentProfileData || {}), moreInfos: d };
    const bioEl = $('bio');
    if (bioEl && d.bio) bioEl.textContent = d.bio;
  });

  _unsubs.push(onSnapshot(doc(db, `users/${uid}/user-infos/links`), s => {
    safe(() => renderLinks(s.exists() ? s.data() : {}));
  }));

  // Stats em tempo real
  _unsubs.push(onSnapshot(collection(db, 'users', uid, 'friends'), snap => {
    _atualizarStatsFriends(snap.size);
  }));

  // Botão de amizade em tempo real (só para perfis alheios)
  if (currentUserId && currentUserId !== uid) {
    const reqRef = doc(db, 'friendRequests', friendRequestId(currentUserId, uid));
    _unsubs.push(onSnapshot(reqRef, snap => {
      let status = 'none';
      if (snap.exists()) {
        const { status: s, from } = snap.data();
        if (s === 'accepted') status = 'friends';
        else if (s === 'pending') status = from === currentUserId ? 'pending_sent' : 'pending_received';
      }
      _renderFriendBtn(status, uid);
      atualizarStats(uid);
    }));
  }
}

// ═══════════════════════════════════════════════════════════
// RENDER — perfil
// ═══════════════════════════════════════════════════════════
function renderPrincipal(d) {
  const un = getUsername(d);
  const dn = getDisplayName(d);
  if ($('headername'))         $('headername').textContent         = un;
  if ($('view-more-username')) $('view-more-username').textContent = un;
  if ($('displayname'))        $('displayname').textContent        = dn;
  if ($('nomeUsuario'))        $('nomeUsuario').textContent        = dn;
  if ($('statususername'))     $('statususername').textContent     = `${dn} está:`;
  if ($('tituloMural'))        $('tituloMural').textContent        = `Mural de ${dn}`;
  $q('.verificado')?.classList.toggle('active', !!d.verified);
  ['tag01','tag02','tag03','tag04'].forEach(t => $q(`.${t}`)?.classList.toggle('active', !!d[t]));
  safe(() => renderModal(currentProfileData));
}

function renderPronomes(about) {
  const el = $('username'); if (!el) return;
  const a = about?.pronom1 !== undefined ? about : (about?.about || {});
  const pronomes = [a.pronom1, a.pronom2].filter(Boolean);
  el.innerHTML = pronomes.length
    ? `<span style="color:#888;font-size:0.9em;">${pronomes.join('/')}</span>`
    : '';
}

function renderMidia(media) {
  const foto = media.pfp || media.userphoto;
  if (foto) {
    document.querySelectorAll('.profile-pic,.user-pic').forEach(el => {
      el.src = foto;
      el.onerror = () => { el.src = './public/img/default.jpg'; };
    });
    document.querySelectorAll('.pfp-border').forEach(el => {
      el.style.backgroundImage = `url(${foto})`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundRepeat = 'no-repeat';
    });
    if (profileUserId) memCache.photos.set(profileUserId, foto);
    const navPic = $('nav-pic');
    if (navPic && isOwnProfile) {
      navPic.src = foto;
      try { localStorage.setItem('user_photo_cache', foto); } catch {}
    }
  }
  const bannerSrc  = media.banner || media.headerphoto;
  const bannerArea = $q('.pf-banner-area');
  const bannerEl   = $q('.profile-banner');
  if (bannerArea && bannerEl) {
    if (bannerSrc) {
      bannerEl.style.backgroundImage = `url(${bannerSrc})`;
      bannerArea.classList.remove('hidden');
    } else {
      bannerArea.classList.add('hidden');
    }
  }
  const music = $q('.music');
  if (media.musicTheme) {
    music?.classList.add('show');
    initMusicPlayer(media.musicTheme);
  } else {
    music?.classList.remove('show');
  }
}

function renderModal(d) {
  if (!d) return;
  const set = (cls, val, fb = 'Não informado') => {
    const n = $q(`.${cls} span`); if (n) n.textContent = val || fb;
  };
  const unEl = $('username-modal'); if (unEl) unEl.textContent = d.username || '';
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
  const enteredEl = $('modal-entered-at');
  if (enteredEl) enteredEl.textContent = formatRelativeTime(d.createdAt || d.criadoem) || 'Data desconhecida';
  const birthdayEl = $('modal-birthday');
  if (birthdayEl) birthdayEl.textContent = formatBirthday(d.birthDate || d.nascimento || d.birthday || d.aniversario);
}

function renderVisaoGeral(a) {
  const tab = $q('.visao-tab .about-container'); if (!tab) return;
  const b = tab.querySelectorAll('.about-box');
  const sv = v => v || 'Não informado';
  if (b[0]) b[0].innerHTML = `<p class="about-title">Visão geral:</p><p>${sv(a.overview)}</p>`;
  if (b[1]) b[1].innerHTML = `<p class="about-title">Tags:</p><p>${sv(a.tags)}</p>`;
  if (b[2]) b[2].innerHTML = `<p class="about-title">Meu Estilo:</p><p>${sv(a.style || a.styles)}</p>`;
  if (b[3]) b[3].innerHTML = `<p class="about-title">Personalidade:</p><p>${sv(a.personality)}</p>`;
  if (b[4]) b[4].innerHTML = `<p class="about-title">Sonhos:</p><p>${sv(a.dreams)}</p>`;
  if (b[5]) b[5].innerHTML = `<p class="about-title">Medos:</p><p>${sv(a.fears)}</p>`;
}

function renderGostos(l) {
  const tab = $q('.gostos-tab .about-container'); if (!tab) return;
  const b = tab.querySelectorAll('.about-box');
  const sv = v => v || 'Não informado';
  if (b[0]) b[0].innerHTML = `<p class="about-title">Músicas:</p><p>${sv(l.music)}</p>`;
  if (b[1]) b[1].innerHTML = `<p class="about-title">Filmes e Séries:</p><p>${sv(l.movies)}</p>`;
  if (b[2]) b[2].innerHTML = `<p class="about-title">Livros:</p><p>${sv(l.books)}</p>`;
  if (b[3]) b[3].innerHTML = `<p class="about-title">Personagens:</p><p>${sv(l.characters)}</p>`;
  if (b[4]) b[4].innerHTML = `<p class="about-title">Comidas:</p><p>${sv(l.foods)}</p>`;
  if (b[5]) b[5].innerHTML = `<p class="about-title">Hobbies:</p><p>${sv(l.hobbies)}</p>`;
  if (b[6]) b[6].innerHTML = `<p class="about-title">Jogos:</p><p>${sv(l.games)}</p>`;
  if (b[7]) b[7].innerHTML = `<p class="about-title">Outros:</p><p>${sv(l.others)}</p>`;
}

function renderLinks(dados) {
  const c = $q('.links-tab .about-container'); if (!c) return;
  const redes = {
    instagram: { base:'https://instagram.com/',          icon:'fab fa-instagram', label:'Instagram' },
    x:         { base:'https://x.com/',                  icon:'fab fa-x-twitter', label:'X' },
    tiktok:    { base:'https://tiktok.com/@',            icon:'fab fa-tiktok',    label:'TikTok' },
    youtube:   { base:'https://youtube.com/',            icon:'fab fa-youtube',   label:'YouTube' },
    github:    { base:'https://github.com/',             icon:'fab fa-github',    label:'GitHub' },
    discord:   { base:'https://discord.com/users/',      icon:'fab fa-discord',   label:'Discord' },
    pinterest: { base:'https://pinterest.com/',          icon:'fab fa-pinterest', label:'Pinterest' },
    spotify:   { base:'https://open.spotify.com/user/', icon:'fab fa-spotify',   label:'Spotify' },
    linkedin:  { base:'https://linkedin.com/in/',        icon:'fab fa-linkedin',  label:'LinkedIn' },
    twitch:    { base:'https://twitch.tv/',              icon:'fab fa-twitch',    label:'Twitch' },
    reddit:    { base:'https://reddit.com/u/',           icon:'fab fa-reddit',    label:'Reddit' },
    facebook:  { base:'https://facebook.com/',           icon:'fab fa-facebook',  label:'Facebook' },
  };
  const src = (dados.links && typeof dados.links === 'object') ? dados.links : dados;
  const itens = [];
  Object.entries(src).forEach(([k, v]) => {
    if (!v || typeof v !== 'string' || !v.trim()) return;
    const val = v.trim(), r = redes[k];
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
  c.innerHTML = itens.length ? itens.join('') :
    `<div class="about-box" style="text-align:center;padding:30px;">
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
      <i class="fa-solid fa-calendar" style="font-size:40px;color:#444;margin-bottom:16px;display:block;"></i>
      <h3 style="color:#666;margin-bottom:8px;">Nenhum repost ainda</h3>
      <p style="color:#444;font-size:14px;">Quando ${quem} um repost, ele aparecerá aqui.</p>
    </div>`;
}

function preencherPerfil(dados) {
  currentProfileData = dados;
  profileUsername = getUsername(dados);
  safe(() => renderPrincipal(dados));
  safe(() => renderPronomes(dados.about || dados));
  const bioEl = $('bio'); if (bioEl) bioEl.textContent = dados.moreInfos?.bio || '';
  safe(() => renderMidia(dados.media || {}));
  safe(() => renderLinks(dados.linksData || {}));
  safe(() => renderModal(dados));
  safe(() => renderVisaoGeral(dados.about || {}));
  safe(() => renderGostos(dados.likes || {}));
  safe(() => renderReposts());
  const moreMenu = $('moreMenu') || $q('.more-menu');
  if (moreMenu) moreMenu.style.display = isOwnProfile ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════
// FOTO NAV — localStorage como cache imediato
// ═══════════════════════════════════════════════════════════
function carregarFotoPerfil() {
  const navPic = $('nav-pic'); if (!navPic) return;
  const cached = localStorage.getItem('user_photo_cache');
  if (cached) navPic.src = cached;
}
document.addEventListener('DOMContentLoaded', carregarFotoPerfil);

// ═══════════════════════════════════════════════════════════
// FORMATAÇÃO
// ═══════════════════════════════════════════════════════════
function formatRelativeTime(ts) {
  if (!ts) return 'Data desconhecida';
  let d;
  if (ts.toDate)       d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else                 d = new Date(ts);
  const sec = Math.floor((Date.now() - d) / 1000);
  if (sec < 60)    return 'Agora';
  const min = Math.floor(sec / 60);    if (min < 60)  return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const hr  = Math.floor(min / 60);    if (hr  < 24)  return `há ${hr} ${hr === 1 ? 'hora' : 'horas'}`;
  const day = Math.floor(hr  / 24);    if (day < 7)   return `há ${day} ${day === 1 ? 'dia' : 'dias'}`;
  const wk  = Math.floor(day / 7);     if (wk  < 5)   return `há ${wk} ${wk === 1 ? 'semana' : 'semanas'}`;
  const mo  = Math.floor(day / 30.44); if (mo  < 12)  return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`;
  const yr  = Math.floor(mo  / 12);    return `há ${yr} ${yr === 1 ? 'ano' : 'anos'}`;
}

function formatTs(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
    if (m < 1)  return 'Agora';
    if (m < 60) return `${m}min`;
    if (h < 24) return `${h}h`;
    if (day < 7) return `${day}d`;
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return ''; }
}

function formatBirthday(v) {
  if (!v) return 'Não informado';
  try {
    const d = v.toDate ? v.toDate() : v.seconds ? new Date(v.seconds * 1000) : new Date(v);
    if (isNaN(d)) return 'Data inválida';
    const mes = d.toLocaleString('pt-BR', { month: 'long' });
    return `${d.getDate()} de ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
  } catch { return 'Data inválida'; }
}

function traduzirGenero(g) {
  const m = {
    masculino:'Masculino', feminino:'Feminino', outro:'Outro', prefiro_nao_dizer:'Prefiro não dizer',
    male:'Masculino', female:'Feminino', other:'Outro', prefer_not_to_say:'Prefiro não dizer',
  };
  return m[String(g || '').toLowerCase()] || 'Não informado';
}

export { formatTs, formatRelativeTime, formatBirthday };

// ═══════════════════════════════════════════════════════════
// MODAL "VER MAIS SOBRE"
// ═══════════════════════════════════════════════════════════
function setupViewMoreModal() {
  const overlay     = $q('.more-overlay');
  const modal       = $q('.more-info-modal');
  const viewMoreBtn = $q('.view-more');
  const dragArea    = $q('.header-area');
  const viewMode    = $q('.view-mode');
  const editMode    = $q('.edit-mode');
  if (!overlay || !modal || !viewMode || !editMode) return;

  window._refreshEditBtn = function () {
    const btnEdit   = $('open-edit');
    const btnCancel = $('cancel-edit');
    const btnSave   = $('save-view-mode');
    if (btnEdit)   btnEdit.style.display   = isOwnProfile ? 'flex' : 'none';
    if (btnCancel) btnCancel.style.display = 'none';
    if (btnSave)   btnSave.style.display   = 'none';
    viewMode.style.display = 'block';
    editMode.style.display = 'none';
  };

  function openModal()  { overlay.classList.add('active'); document.body.style.overflow = 'hidden'; setTimeout(() => { window._refreshEditBtn(); attachBtns(); }, 100); }
  function closeModal() {
    modal.style.transition = 'transform 0.4s cubic-bezier(0.32,0.72,0,1)';
    modal.style.transform  = 'translateY(100%)';
    overlay.style.opacity  = '0';
    setTimeout(() => { overlay.classList.remove('active'); modal.style.transform = ''; modal.style.transition = ''; overlay.style.opacity = ''; document.body.style.overflow = ''; }, 450);
  }

  function attachBtns() {
    const clone = el => { if (!el) return null; const c = el.cloneNode(true); el.parentNode.replaceChild(c, el); return c; };
    const btnEdit   = clone($('open-edit'));
    const btnCancel = clone($('cancel-edit'));
    const btnSave   = clone($('save-view-mode'));
    btnEdit  ?.addEventListener('click', () => { if (isOwnProfile) enterEdit(); });
    btnCancel?.addEventListener('click', enterView);
    btnSave  ?.addEventListener('click', async () => {
      if (!currentUserId || !isOwnProfile) return;
      btnSave.disabled = true; btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      try {
        const getVal = cls => editMode.querySelector('.' + cls + ' .edit-input')?.value.trim() || '';
        await Promise.all([
          updateDoc(doc(db, `users/${currentUserId}/user-infos/about`), {
            searching: getVal('modal-info-buscando'), overview: getVal('modal-info-overview'),
            style: getVal('modal-info-style'), personality: getVal('modal-info-personality'),
          }),
          updateDoc(doc(db, `users/${currentUserId}/user-infos/likes`), {
            music: getVal('modal-info-music'), movies: getVal('modal-info-movies'),
            books: getVal('modal-info-books'), characters: getVal('modal-info-characters'),
            foods: getVal('modal-info-foods'), hobbies: getVal('modal-info-hobbies'),
            games: getVal('modal-info-games'), others: getVal('modal-info-others'),
          }),
        ]);
        enterView();
      } catch (e) { console.error(e); }
      finally { btnSave.disabled = false; btnSave.innerHTML = '<i class="fa-solid fa-check"></i>'; }
    });
  }

  function enterEdit() {
    viewMode.style.display = 'none'; editMode.style.display = 'block';
    $('open-edit').style.display = 'none'; $('cancel-edit').style.display = 'flex'; $('save-view-mode').style.display = 'flex';
    const d = currentProfileData || {}, a = d.about || {}, l = d.likes || {};
    const set = (cls, val) => { const el = editMode.querySelector('.' + cls + ' .edit-input'); if (el) el.value = val || ''; };
    set('modal-info-buscando', a.searching); set('modal-info-overview', a.overview);
    set('modal-info-style', a.style); set('modal-info-personality', a.personality);
    set('modal-info-music', l.music); set('modal-info-movies', l.movies);
    set('modal-info-books', l.books); set('modal-info-characters', l.characters);
    set('modal-info-foods', l.foods); set('modal-info-hobbies', l.hobbies);
    set('modal-info-games', l.games); set('modal-info-others', l.others);
  }

  function enterView() {
    viewMode.style.display = 'block'; editMode.style.display = 'none';
    $('open-edit').style.display = isOwnProfile ? 'flex' : 'none';
    $('cancel-edit').style.display = 'none'; $('save-view-mode').style.display = 'none';
  }

  viewMoreBtn?.addEventListener('click', openModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

  if (dragArea) {
    let startY = 0, curY = 0, dragging = false;
    dragArea.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dragging = true; modal.style.transition = 'none'; }, { passive: true });
    dragArea.addEventListener('touchmove',  e => { if (!dragging) return; curY = e.touches[0].clientY; const diff = curY - startY; if (diff > 0) modal.style.transform = `translateY(${diff}px)`; }, { passive: true });
    dragArea.addEventListener('touchend',   () => {
      if (!dragging) return; dragging = false;
      if (curY - startY > 120) closeModal();
      else { modal.style.transition = 'transform 0.35s cubic-bezier(0.32,0.72,0,1)'; modal.style.transform = 'translateY(0)'; }
    });
  }
  setTimeout(window._refreshEditBtn, 800);
}

// ═══════════════════════════════════════════════════════════
// AMIZADES — ID CANÔNICO
//
// Só existe UM documento por par. ID = [a,b].sort().join('_')
// "from" = quem enviou · "to" = quem recebe
// Validação de permissão fica nas Security Rules do Firestore.
// ═══════════════════════════════════════════════════════════
function friendRequestId(a, b) {
  return [a, b].sort().join('_');
}

async function enviarPedidoAmizade(meId, targetId) {
  try {
    await setDoc(doc(db, 'friendRequests', friendRequestId(meId, targetId)), {
      from: meId, to: targetId, status: 'pending', createdAt: serverTimestamp(),
    });
  } catch (e) {
    if (e.code === 'permission-denied') throw new Error('already_requested');
    throw e;
  }
}

async function cancelarPedidoAmizade(meId, targetId) {
  await deleteDoc(doc(db, 'friendRequests', friendRequestId(meId, targetId)));
}

async function aceitarAmizade(meId, targetId) {
  await updateDoc(doc(db, 'friendRequests', friendRequestId(meId, targetId)), {
    status: 'accepted', acceptedAt: serverTimestamp(),
  });
}

async function recusarPedidoAmizade(meId, targetId) {
  await deleteDoc(doc(db, 'friendRequests', friendRequestId(meId, targetId)));
}

async function desfazerAmizade(meId, targetId) {
  await deleteDoc(doc(db, 'friendRequests', friendRequestId(meId, targetId)));
}

// ═══════════════════════════════════════════════════════════
// BOTÃO DE AMIZADE — renderizado pelo listener em tempo real
// ═══════════════════════════════════════════════════════════
let _friendBtnEl = null; // referência estável ao botão clonado

function _renderFriendBtn(status, targetUid) {
  if (!_friendBtnEl) return;
  const btn = _friendBtnEl;
  if (status === 'friends') {
    btn.textContent = 'Amigos';
    btn.style.background = '#2b2f33'; btn.style.borderColor = '#444'; btn.style.color = '#fff';
  } else if (status === 'pending_sent') {
    btn.textContent = 'Pedido enviado';
    btn.style.background = '#2b2f33'; btn.style.color = '#fff'; btn.style.borderColor = '';
  } else if (status === 'pending_received') {
    btn.textContent = 'Aceitar amizade';
    btn.style.background = 'var(--primary-btn, #4A90E2)'; btn.style.color = '#fff'; btn.style.borderColor = '';
  } else {
    btn.textContent = 'Adicionar';
    btn.style.background = 'var(--primary-btn, #4A90E2)'; btn.style.color = '#fff'; btn.style.borderColor = '';
  }
  btn.disabled = false;
  // Reaplica o handler a cada mudança de status para capturar o valor correto
  const novo = btn.cloneNode(true);
  btn.parentNode?.replaceChild(novo, btn);
  _friendBtnEl = novo;
  novo.addEventListener('click', async () => {
    novo.disabled = true;
    try {
      if (status === 'none') {
        try {
          await enviarPedidoAmizade(currentUserId, targetUid);
        } catch (e) {
          if (e.message !== 'already_requested') throw e;
        }
      } else if (status === 'pending_sent') {
        await cancelarPedidoAmizade(currentUserId, targetUid);
      } else if (status === 'pending_received') {
        await aceitarAmizade(currentUserId, targetUid);
        try {
          const targetData = await getUserData(targetUid);
          triggerNovaAmizade(targetUid, targetData.username || targetUid).catch(console.warn);
        } catch {}
      } else if (status === 'friends') {
        await desfazerAmizade(currentUserId, targetUid);
      }
    } catch (e) { console.error('friend toggle:', e); novo.disabled = false; }
    // Estado atualizado automaticamente pelo onSnapshot
  });
}

// ═══════════════════════════════════════════════════════════
// ESTATÍSTICAS — atualizadas em tempo real via _unsubs
// ═══════════════════════════════════════════════════════════
function _atualizarStatsFriends(totalAmigos) {
  const el = $q('.profile-stats .stat-item[data-tab="amigos"] .stat-count');
  if (el) el.textContent = totalAmigos;
}

async function atualizarStats(uid) {
  try {
    const [friendsSnap, postsSnap] = await Promise.all([
      getDocs(collection(db, 'users', uid, 'friends')),
      getDocs(query(collection(db, 'posts'), where('creatorid', '==', uid))),
    ]);
    const totalAmigos = friendsSnap.size;
    const totalPosts  = postsSnap.size;
    const totalFotos  = postsSnap.docs.filter(d => d.data().img?.trim()).length;

    const statsEl = $q('.profile-stats'); if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-item stats-click" data-tab="amigos">
        <span class="stat-count">${totalAmigos}</span><span class="stat-label">amigos</span>
      </div>
      <div class="stat-item" data-tab="posts">
        <span class="stat-count">${totalPosts}</span><span class="stat-label">posts</span>
      </div>
      <div class="stat-item" data-tab="fotos">
        <span class="stat-count">${totalFotos}</span><span class="stat-label">fotos</span>
      </div>`;
    statsEl.querySelectorAll('.stats-click').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => abrirOverlay(uid, el.dataset.tab));
    });
  } catch (e) { console.error('atualizarStats:', e); }
}

// ═══════════════════════════════════════════════════════════
// OVERLAY AMIGOS
// ═══════════════════════════════════════════════════════════
function abrirOverlay(uid, tabInicial = 'amigos') {
  if ($('listas-overlay') || tabInicial !== 'amigos') return;

  const style = document.createElement('style');
  style.id = 'listas-overlay-css';
  style.textContent = `
    #listas-overlay{position:fixed;inset:0;z-index:999999;background:var(--bg-primary,#0f0f0f);display:flex;flex-direction:column;overflow:hidden;animation:lo-in .25s ease-out}
    @keyframes lo-in{from{transform:translateX(100%)}to{transform:translateX(0)}}
    @keyframes lo-out{from{transform:translateX(0)}to{transform:translateX(100%)}}
    #listas-overlay.closing{animation:lo-out .2s ease-out forwards}
    .lo-header{display:flex;align-items:center;justify-content:space-between;padding:16px;position:fixed;top:0;left:0;width:100%;height:60px;background:var(--bg-primary);z-index:10}
    .lo-back{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#f8f9f9;cursor:pointer;border-radius:50%}
    .lo-title{font-size:18px;font-weight:700;color:#f8f9f9}.lo-spacer{width:40px}
    .lo-page{height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:120px;padding-top:60px}
    .lo-user-row{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .12s}
    .lo-avatar{width:50px;height:50px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#1e1e1e}
    .lo-user-info{flex:1;min-width:0}
    .lo-user-username{font-size:15px;font-weight:600;color:#f8f9f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lo-user-pronouns{font-size:13px;color:#666;margin-top:2px}
    .lo-action-btn{flex-shrink:0;padding:7px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;background:transparent;color:#f8f9f9;border:1.5px solid #333}
    .lo-action-btn.danger{border-color:#f85149;color:#f85149}
    .lo-action-btn:disabled{opacity:.4;pointer-events:none}
    .lo-empty{display:flex;flex-direction:column;align-items:center;padding:80px 20px;color:#444;text-align:center;gap:12px}
    .lo-empty svg{fill:#fff;height:50px;width:50px}.lo-empty i{font-size:42px;color:#fff}
    .lo-empty p{font-size:14px;line-height:1.5}.lo-loading{text-align:center;padding:60px;color:#444}`;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'listas-overlay';
  overlay.innerHTML = `
    <div class="lo-header">
      <button class="lo-back" id="lo-back-btn">
        <svg viewBox="0 0 298 512" width="18" height="18" fill="currentColor">
          <path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16L12.23 285.39c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7L100.27 256.08 285.77 441z"/>
        </svg>
      </button>
      <span class="lo-title">Amigos de ${profileUsername}</span>
      <span class="lo-spacer"></span>
    </div>
    <div class="lo-page" id="lo-page-amigos"><div class="lo-loading"><i class="fas fa-spinner fa-spin"></i></div></div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  carregarListaAmigos(uid, $('lo-page-amigos'));

  function fechar() {
    overlay.classList.add('closing');
    setTimeout(() => { overlay.remove(); $('listas-overlay-css')?.remove(); document.body.style.overflow = ''; }, 260);
  }
  overlay.querySelector('#lo-back-btn').addEventListener('click', fechar);
}

async function carregarListaAmigos(profileUid, page) {
  if (!page) return;
  try {
    const snap = await getDocs(collection(db, 'users', profileUid, 'friends'));
    const uids = snap.docs.map(d => d.id);
    page.innerHTML = '';
    if (!uids.length) {
      page.innerHTML = `<div class="lo-empty"><i class="fas fa-user-friends"></i><p>Nenhum amigo ainda.</p></div>`;
      return;
    }
    for (let i = 0; i < uids.length; i += 8) {
      await Promise.all(uids.slice(i, i + 8).map(uid => adicionarLinhaAmigo(uid, profileUid, page)));
    }
  } catch (e) {
    console.error('carregarListaAmigos:', e);
    page.innerHTML = `<div class="lo-empty"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar.</p></div>`;
  }
}

async function adicionarLinhaAmigo(uid, profileUid, container) {
  const [userData, foto] = await Promise.all([getUserData(uid), getUserPhoto(uid)]);
  const un = userData.username || uid;
  const dn = getDisplayName(userData);
  const row = document.createElement('div');
  row.className = 'lo-user-row';

  let actionHTML = '';
  if (isOwnProfile) {
    actionHTML = `<button class="lo-action-btn danger" data-action="unfriend" data-uid="${uid}">Remover</button>`;
  } else if (currentUserId && uid !== currentUserId) {
    // Lê o status do friendRequest (1 leitura, doc pode não existir)
    let status = 'none';
    try {
      const snap = await getDoc(doc(db, 'friendRequests', friendRequestId(currentUserId, uid)));
      if (snap.exists()) {
        const { status: s, from } = snap.data();
        if (s === 'accepted') status = 'friends';
        else if (s === 'pending') status = from === currentUserId ? 'pending_sent' : 'pending_received';
      }
    } catch {}
    if      (status === 'friends')          actionHTML = `<button class="lo-action-btn danger" data-action="unfriend" data-uid="${uid}">Amigos</button>`;
    else if (status === 'pending_sent')     actionHTML = `<button class="lo-action-btn" data-action="cancel" data-uid="${uid}">Pedido enviado</button>`;
    else if (status === 'pending_received') actionHTML = `<button class="lo-action-btn" data-action="accept" data-uid="${uid}" style="border-color:#4A90E2;color:#4A90E2">Aceitar</button>`;
    else                                    actionHTML = `<button class="lo-action-btn" data-action="add" data-uid="${uid}">Adicionar</button>`;
  }

  row.innerHTML = `
    <img class="lo-avatar" src="${foto}" alt="${un}" onerror="this.src='./public/img/default.jpg'">
    <div class="lo-user-info">
      <div class="lo-user-username">${un}</div>
      ${dn !== un ? `<div class="lo-user-pronouns">${dn}</div>` : ''}
    </div>${actionHTML}`;
  row.addEventListener('click', e => {
    if (e.target.closest('.lo-action-btn')) return;
    window.location.href = `profile.html?username=${encodeURIComponent(un)}`;
  });

  const btn = row.querySelector('.lo-action-btn');
  if (btn) {
    btn.addEventListener('click', async e => {
      e.stopPropagation(); btn.disabled = true; btn.textContent = '...';
      const action = btn.dataset.action;
      try {
        if (action === 'unfriend') {
          await desfazerAmizade(currentUserId || profileUid, uid);
          row.style.transition = 'opacity .3s'; row.style.opacity = '0';
          setTimeout(() => row.remove(), 320);
          atualizarStats(profileUid);
        } else if (action === 'add') {
          await enviarPedidoAmizade(currentUserId, uid);
          btn.textContent = 'Pedido enviado'; btn.dataset.action = 'cancel'; btn.disabled = false;
        } else if (action === 'cancel') {
          await cancelarPedidoAmizade(currentUserId, uid);
          btn.textContent = 'Adicionar'; btn.dataset.action = 'add'; btn.disabled = false;
        } else if (action === 'accept') {
          await aceitarAmizade(currentUserId, uid);
          btn.textContent = 'Amigos'; btn.dataset.action = 'unfriend';
          btn.style.borderColor = '#f85149'; btn.style.color = '#f85149'; btn.disabled = false;
        }
      } catch (err) { console.error('friend action:', err); btn.disabled = false; btn.textContent = 'Erro'; }
    });
  }
  container.appendChild(row);
}

// ═══════════════════════════════════════════════════════════
// BOTÕES DO PERFIL
// ═══════════════════════════════════════════════════════════
async function configurarBotoes(targetUid) {
  const btnOutro        = $q('.action-btn.pf');
  const btnEditar       = $q('.action-btn.mypf');
  const btnCompartilhar = $q('.actions-btn .action-btn:not(.pf):not(.mypf):not(.sugestions)');
  const btnSugestoes    = $q('.action-btn.sugestions');
  const nudgeBtn        = $q('.btn-nudge');
  const moreMenu        = $('moreMenu') || $q('.more-menu');

  const clone = btn => { if (!btn) return null; const c = btn.cloneNode(true); btn.parentNode?.replaceChild(c, btn); return c; };

  if (moreMenu) moreMenu.style.display = isOwnProfile ? '' : 'none';
  [btnOutro, btnEditar, btnSugestoes, nudgeBtn].forEach(b => b && (b.style.display = 'none'));

  const shareBtn = clone(btnCompartilhar);
  if (shareBtn) {
    shareBtn.style.display = 'inline-flex';
    shareBtn.addEventListener('click', () => {
      const url = `${location.origin}${location.pathname}?username=${encodeURIComponent(profileUsername)}`;
      if (navigator.share) navigator.share({ title: `Perfil de ${profileUsername}`, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(() => { const orig = shareBtn.textContent; shareBtn.textContent = 'Copiado!'; setTimeout(() => shareBtn.textContent = orig, 2000); });
    });
  }

  if (!currentUserId) return;

  if (isOwnProfile) {
    const editBtn = clone(btnEditar);
    if (editBtn) { editBtn.style.display = 'inline-flex'; editBtn.addEventListener('click', () => window.location.href = 'edit.html'); }
    return;
  }

  // Botão de amizade — controlado em tempo real pelo listener em setupListeners
  const friendBtn = clone(btnOutro);
  if (friendBtn) {
    friendBtn.style.display = 'inline-flex';
    _friendBtnEl = friendBtn;
    // Estado inicial renderizado pelo onSnapshot assim que o listener disparar
  }

  const nav = $q('.navbar-bottom');
  if (nav) { nav.style.display = 'none'; document.body.classList.add('no-navbar-bottom'); }
  const sharebtn = $q('.share'); if (sharebtn) sharebtn.style.display = 'none';

  const msgBtn = clone(btnSugestoes);
  if (msgBtn) { msgBtn.style.display = 'flex'; msgBtn.title = 'Mensagem'; msgBtn.addEventListener('click', () => iniciarChat(targetUid)); }
}

// ═══════════════════════════════════════════════════════════
// CHAT
// ═══════════════════════════════════════════════════════════
async function iniciarChat(targetUid) {
  if (!currentUserId || !targetUid || currentUserId === targetUid) return;
  const chatId = `chat-${[currentUserId, targetUid].sort().join('-')}`;
  try {
    await setDoc(doc(db, 'chats', chatId), {
      participants: [currentUserId, targetUid].sort(), createdAt: new Date(), lastMessage: '', lastMessageTime: null,
    }, { merge: true });
    window.location.href = `direct.html?chatid=${chatId}`;
  } catch (e) { console.error('iniciarChat:', e); alert('Erro ao iniciar conversa.'); }
}

// ═══════════════════════════════════════════════════════════
// POSTS — grid com infinite scroll
// ═══════════════════════════════════════════════════════════
async function carregarPosts(uid) {
  _profileUidForPosts = uid;
  _lastPostSnap = null;
  _gridLoading  = false;
  _gridNoMore   = false;
  if (_gridObserver) { _gridObserver.disconnect(); _gridObserver = null; }

  const c = $('muralPosts') || $q('.mural-tab');
  if (!c || !uid) return;
  c.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Carregando posts...</p></div>`;

  const PAGE = 12;

  function tsMs(x) {
    return x?.toDate?.()?.getTime?.() || (x?.seconds ? x.seconds * 1000 : new Date(x || 0).getTime());
  }

  function renderEmpty() {
    c.classList.add('empty-posts');
    c.innerHTML = `
      <div class="about-box" style="text-align:center;padding:30px;width:100%!important;">
        <div class="icon-area"><div class="icon-place"><i class="fa-solid fa-pen-to-square" style="font-size:38px;color:#fff;"></i></div></div>
        <h3 style="color:#fff;margin-bottom:12px;">Nenhum post ainda</h3>
        <p style="color:#555;">Este usuário ainda não fez nenhum post.</p>
      </div>`;
  }

  try {
    const snap = await getDocs(
      query(collection(db, 'posts'), where('creatorid', '==', uid), orderBy('create', 'desc'), limit(PAGE))
    );
    const posts = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    _lastPostSnap = snap.docs.at(-1) ?? null;
    if (snap.size < PAGE) _gridNoMore = true;
    postsDoUsuario = posts.map(p => ({ id: p.id, userid: uid, data: p.data }));
    c.innerHTML = '';
    if (!posts.length) { renderEmpty(); return; }
    c.classList.remove('empty-posts');
    posts.forEach(p => c.appendChild(criarPreview(p.data, p.id)));
    _setupGridScroll(c);
  } catch {
    // Fallback sem orderBy
    try {
      const snap2 = await getDocs(query(collection(db, 'posts'), where('creatorid', '==', uid)));
      const posts2 = snap2.docs.map(d => ({ id: d.id, data: d.data() }));
      posts2.sort((a, b) => tsMs(b.data.create) - tsMs(a.data.create));
      _lastPostSnap = null; _gridNoMore = true;
      postsDoUsuario = posts2.map(p => ({ id: p.id, userid: uid, data: p.data }));
      c.innerHTML = '';
      if (!posts2.length) { renderEmpty(); return; }
      c.classList.remove('empty-posts');
      posts2.forEach(p => c.appendChild(criarPreview(p.data, p.id)));
    } catch (e2) {
      c.innerHTML = `<p style="color:#aaa;text-align:center;padding:20px;">Erro ao carregar posts.</p>`;
    }
  }
}

function _setupGridScroll(container) {
  if (_gridNoMore) return;
  container.querySelector('.grid-sentinel')?.remove();
  const sentinel = document.createElement('div');
  sentinel.className = 'grid-sentinel';
  sentinel.style.cssText = 'width:100%;height:1px;grid-column:1/-1;';
  container.appendChild(sentinel);

  _gridObserver = new IntersectionObserver(async (entries) => {
    if (!entries[0].isIntersecting || _gridLoading || _gridNoMore) return;
    _gridLoading = true;
    try {
      const snap = await getDocs(
        query(collection(db, 'posts'), where('creatorid', '==', _profileUidForPosts), orderBy('create', 'desc'), startAfter(_lastPostSnap), limit(12))
      );
      if (!snap.size) { _gridNoMore = true; sentinel.remove(); _gridObserver.disconnect(); return; }
      _lastPostSnap = snap.docs.at(-1);
      if (snap.size < 12) _gridNoMore = true;
      snap.docs.map(d => ({ id: d.id, data: d.data() })).forEach(p => {
        postsDoUsuario.push({ id: p.id, userid: _profileUidForPosts, data: p.data });
        container.insertBefore(criarPreview(p.data, p.id), sentinel);
      });
      if (_gridNoMore) { sentinel.remove(); _gridObserver.disconnect(); }
    } catch (e) { console.error('[grid scroll]', e); }
    finally { _gridLoading = false; }
  }, { rootMargin: '300px' });

  _gridObserver.observe(sentinel);
}

function criarPreview(postData, postId) {
  const el = document.createElement('div');
  el.className = 'postpreview';
  const imgs = Array.isArray(postData.imgs) && postData.imgs.length
    ? postData.imgs : (postData.img?.trim() ? [postData.img] : []);
  if (imgs.length) {
    el.innerHTML = `<img src="${imgs[0]}" class="post-preview-img" loading="lazy" onerror="this.parentElement.innerHTML='<div class=post-preview-error>Erro</div>'">`;
  } else {
    const txt = postData.content || '';
    el.innerHTML = `<div class="post-preview-text-container"><p class="post-preview-text">${txt.length > 80 ? txt.slice(0, 80) + '…' : txt}</p></div>`;
  }
  el.onclick = () => {
    const startIndex = postsDoUsuario.findIndex(p => p.id === postId);
    const loadMoreFn = async () => {
      if (!_lastPostSnap || !_profileUidForPosts) return null;
      try {
        const snap = await getDocs(
          query(collection(db, 'posts'), where('creatorid', '==', _profileUidForPosts), orderBy('create', 'desc'), startAfter(_lastPostSnap), limit(10))
        );
        if (snap.empty) return null;
        _lastPostSnap = snap.docs.at(-1);
        return snap.docs.map(d => ({ id: d.id, data: d.data() }));
      } catch { return null; }
    };
    openProfileTimeline(postsDoUsuario, startIndex, profileUsername, loadMoreFn);
  };
  return el;
}

// ═══════════════════════════════════════════════════════════
// MUSIC PLAYER
// ═══════════════════════════════════════════════════════════
let musicPlayer = null, musicPlaying = false, musicCurrentUrl = null;
let _ytApiReady = false, _ytPendingId = null;

window.onYouTubeIframeAPIReady = function () {
  _ytApiReady = true;
  if (_ytPendingId) { createMusicPlayer(_ytPendingId); _ytPendingId = null; }
};

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (String(url).match(/^[A-Za-z0-9_-]{11}$/) ? url : null);
}

function createMusicPlayer(videoId) {
  if (musicPlayer?.destroy) { try { musicPlayer.destroy(); } catch {} musicPlayer = null; musicPlaying = false; }
  $('music-player')?.remove();
  const div = document.createElement('div');
  div.id = 'music-player';
  div.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;';
  document.body.appendChild(div);
  musicPlayer = new YT.Player('music-player', {
    height:'1', width:'1', videoId,
    playerVars: { autoplay:0, controls:0, disablekb:1, fs:0, modestbranding:1, rel:0, iv_load_policy:3, playsinline:1, enablejsapi:1, loop:1, playlist:videoId },
    events: {
      onReady(e) {
        e.target.setVolume(60);
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
          .then(r => r.json()).then(d => { [$('musicTitle'), $('music-title')].forEach(el => { if (el) el.textContent = d.title; }); }).catch(() => {});
      },
      onStateChange(e) { if (e.data === YT.PlayerState.ENDED) { e.target.seekTo(0); e.target.playVideo(); } },
    },
  });
}

function toggleMusic() {
  if (!musicPlayer?.playVideo) return;
  if (musicPlaying) { musicPlayer.pauseVideo(); musicPlaying = false; }
  else              { musicPlayer.playVideo();  musicPlaying = true; }
  const btn = $('btnPauseMusic'), play = $('play'), pause = $('pause'), bars = $q('.music-bars'), title = $('musicTitle');
  btn  ?.classList.toggle('playing', musicPlaying);
  play ?.classList.toggle('active', !musicPlaying);
  pause?.classList.toggle('active',  musicPlaying);
  bars ?.classList.toggle('visible', musicPlaying);
  title?.classList.toggle('shifted', musicPlaying);
}

function initMusicPlayer(url) {
  const videoId = extractYouTubeId(url);
  const section = $q('.music');
  if (!videoId) { if (section) section.classList.remove('has-music'); return; }
  if (section) section.classList.add('has-music');
  if (url === musicCurrentUrl) return;
  musicCurrentUrl = url;
  if (!$('_yt_api_script')) {
    const s = document.createElement('script'); s.id = '_yt_api_script'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  }
  _ytApiReady ? createMusicPlayer(videoId) : (_ytPendingId = videoId);
  ['btnPauseMusic','music-toggle-btn'].forEach(id => {
    const old = $(id); if (!old) return;
    const btn = old.cloneNode(true); old.parentNode.replaceChild(btn, old);
    btn.addEventListener('click', toggleMusic);
  });
}

// ═══════════════════════════════════════════════════════════
// WALL — tempo real via onSnapshot
// ═══════════════════════════════════════════════════════════
async function iniciarWall() {
  if (!profileUserId) return;

  const modal     = $('wall-modal');
  const textarea  = $('wall-input');
  const btnEnviar = $q('.send-wall-btn');
  const btnCancel = $q('.cancel-wall-btn');
  const sendWall  = $q('.send-wall');
  const wallFeed  = $('wall-feed');
  if (!modal || !wallFeed) return;

  // Verifica amizade pela coleção friends (server-authoritative)
  let isAmigo = false;
  if (auth.currentUser && !isOwnProfile) {
    const friendSnap = await getDoc(doc(db, 'users', profileUserId, 'friends', auth.currentUser.uid)).catch(() => null);
    isAmigo = friendSnap?.exists() ?? false;
  }

  const sendWallContainer = $q('.send-wall');
  if (sendWallContainer) {
    if (isOwnProfile || isAmigo) {
      sendWallContainer.style.display = '';
    } else {
      sendWallContainer.style.display = 'none';
      const aviso = document.createElement('p');
      aviso.className = 'wall-amizade-aviso';
      aviso.style.cssText = 'color:#666;text-align:center;padding:16px;font-size:14px;';
      const targetUsername = (await getUserData(profileUserId)).username || 'usuário';
      aviso.textContent = `Seja amigo de ${targetUsername} para escrever em seu Mural`;
      wallFeed.before(aviso);
    }
  }

  const [targetUser, targetPhoto, myUser, myPhoto] = await Promise.all([
    getUserData(profileUserId),
    getUserPhoto(profileUserId),
    auth.currentUser ? getUserData(auth.currentUser.uid) : Promise.resolve({}),
    auth.currentUser ? getUserPhoto(auth.currentUser.uid) : Promise.resolve('./public/img/default.jpg'),
  ]);

  const targetUsername = targetUser.username || targetUser.name || 'usuário';
  const myName = myUser.username || myUser.name || 'Você';

  const textarea2  = $('wall-input');
  const sendText   = $q('.input-send-wall');
  const sendImg    = $q('.pfp-send-wall img');
  const modalImg   = $q('.pfp-modal-wall img');
  const modalName  = $q('.username-modal-wall');

  if (textarea2)  textarea2.placeholder = `Escreva para ${targetUsername}...`;
  if (sendText)   sendText.textContent  = `Escreva para ${targetUsername}...`;
  if (sendImg)    sendImg.src           = myPhoto;
  if (modalImg)   modalImg.src          = myPhoto;
  if (modalName)  modalName.textContent = myName;

  const abrirModal  = () => modal.classList.add('active');
  const fecharModal = () => { modal.classList.remove('active'); if (textarea2) textarea2.value = ''; };

  sendWall?.addEventListener('click', abrirModal);
  btnCancel?.addEventListener('click', fecharModal);
  modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });

  btnEnviar?.addEventListener('click', async () => {
    const texto = textarea2?.value.trim();
    if (!texto || !currentUserId || !profileUserId) return;
    btnEnviar.disabled = true;
    try {
      await addDoc(collection(db, 'users', profileUserId, 'wall'), {
        authorId: auth.currentUser.uid, text: texto, createdAt: serverTimestamp(),
      });
      fecharModal();
    } catch (e) { alert('Erro ao enviar: ' + e.message); }
    finally { btnEnviar.disabled = false; }
  });

  // onSnapshot → re-renderiza o wall automaticamente a cada mudança
  _unsubs.push(onSnapshot(
    query(collection(db, 'users', profileUserId, 'wall'), orderBy('createdAt', 'desc')),
    () => _renderWallUnificado(profileUserId, wallFeed, currentUserId)
  ));
}

async function _renderWallUnificado(profileUserId, wallFeed, currentUserId) {
  wallFeed.innerHTML = '<p style="color:#555;text-align:center;padding:24px;font-size:14px;opacity:0.6;">Carregando...</p>';
  try {
    const [wallSnap, mentionsSnap] = await Promise.all([
      getDocs(query(collection(db, 'users', profileUserId, 'wall'), orderBy('createdAt', 'desc'))),
      getDocs(query(collection(db, 'posts'), where('mentions', 'array-contains', profileUserId), orderBy('create', 'desc'), limit(30))),
    ]);

    const items = [];
    for (const d of wallSnap.docs) {
      const data = d.data();
      const ts = data.createdAt?.seconds ?? (data.createdAt ? new Date(data.createdAt).getTime() / 1000 : 0);
      items.push({ ts, type: 'wall', snapId: d.id, data });
    }
    for (const d of mentionsSnap.docs) {
      const data = d.data();
      const ts = data.create?.seconds ?? (data.create ? new Date(data.create).getTime() / 1000 : 0);
      items.push({ ts, type: 'mention', postId: d.id, data });
    }
    items.sort((a, b) => b.ts - a.ts);

    wallFeed.innerHTML = '';
    if (!items.length) {
      wallFeed.innerHTML = '<p style="color:#555;text-align:center;padding:24px;font-size:14px;">Nenhuma atividade ainda</p>';
      return;
    }

    for (const item of items) {
      if (item.type === 'mention') {
        const wrapper = document.createElement('div');
        wrapper.className = 'wall-post-item wall-mention-item';
        renderPost({ ...item.data, postid: item.postId }, wrapper);
        wallFeed.appendChild(wrapper);
        continue;
      }

      const wallData = item.data;
      if (wallData.postId) {
        try {
          const postSnap = await getDoc(doc(db, 'posts', wallData.postId));
          if (postSnap.exists()) {
            const wrapper = document.createElement('div');
            wrapper.className = 'wall-post-item';
            renderPost({ ...postSnap.data(), postid: postSnap.id }, wrapper);
            const podeDeletar = currentUserId === wallData.authorId || currentUserId === profileUserId;
            if (podeDeletar) {
              const delBtn = document.createElement('button');
              delBtn.style.cssText = 'display:block;margin:0 16px 8px;font-size:12px;color:#f85149;background:none;border:none;cursor:pointer;';
              delBtn.textContent = 'Remover do mural';
              delBtn.addEventListener('click', async () => {
                if (confirm('Remover este post do mural?')) await deleteDoc(doc(db, 'users', profileUserId, 'wall', item.snapId));
              });
              wrapper.appendChild(delBtn);
            }
            wallFeed.appendChild(wrapper);
            continue;
          }
        } catch (e) { console.warn('[wall] post linkado:', e); }
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'wall-post-item wall-text-item';
      const podeDeletar = currentUserId === wallData.authorId || currentUserId === profileUserId;
      await _renderWallCard({
        snapId: item.snapId, profileUserId,
        authorId: wallData.authorId, text: wallData.text || '',
        createdAt: wallData.createdAt, podeDeletar, container: wrapper,
      });
      wallFeed.appendChild(wrapper);
    }
  } catch (e) {
    console.error('[wall unificado]', e);
    wallFeed.innerHTML = '<p style="color:#f85149;text-align:center;padding:24px;font-size:14px;">Erro ao carregar o mural</p>';
  }
}

async function _renderWallCard({ snapId, profileUserId, authorId, text, createdAt, podeDeletar, container }) {
  const basePath = `users/${profileUserId}/wall/${snapId}`;
  await Promise.all([getUserData(authorId), getUserPhoto(authorId)]);
  const userData = memCache.users.get(authorId) || {};
  const fotoUrl  = memCache.photos.get(authorId) || './public/img/default.jpg';
  const nome     = userData.username || userData.name || 'usuário';
  const uid      = auth.currentUser?.uid;

  const [likersSnap, likedSnap, comentSnap] = await Promise.all([
    getDocs(query(collection(db, basePath + '/likers'), where('like', '==', true))),
    uid ? getDoc(doc(db, basePath + '/likers/' + uid)) : Promise.resolve(null),
    getDocs(collection(db, basePath + '/coments')),
  ]);
  const likeCount  = likersSnap.size;
  const jaLikei    = likedSnap?.exists() && likedSnap.data().like === true;
  const comentCount = comentSnap.size;

  function fmtDate(ts) {
    if (!ts) return '';
    const date = ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 6e4), h = Math.floor(diff / 36e5), d = Math.floor(diff / 864e5);
    if (m < 1) return 'agora'; if (m < 60) return m + 'm'; if (h < 24) return h + 'h';
    if (d < 7) return d + 'd';
    return date.toLocaleDateString('pt-BR', { day:'2-digit', month:'short' });
  }

  const card = document.createElement('div');
  card.className = 'post-card wall-text-card';
  card.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="${fotoUrl}" alt="Avatar" class="avatar" onerror="this.src='./public/img/default.jpg'">
        <div class="user-meta">
          <strong class="user-name-link" data-username="${authorId}">${nome}</strong>
          <small class="post-date-mobile">${fmtDate(createdAt)}</small>
        </div>
      </div>
      <div class="left-space-options">
        ${podeDeletar ? `<div class="more-options"><button class="more-options-button wall-card-del-btn"><i class="fas fa-ellipsis-h"></i></button></div>` : ''}
      </div>
    </div>
    <div class="post-content">
      <div class="post-text">${text}</div>
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="btn-like wall-like-btn ${jaLikei ? 'liked' : ''}" data-snap="${snapId}" data-base="${basePath}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 456.549"><path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/></svg>
            <span>${likeCount}</span>
          </button>
          <button class="btn-comment wall-coment-btn" data-snap="${snapId}" data-base="${basePath}">
            <svg viewBox="0 0 122.97 122.88" xmlns="http://www.w3.org/2000/svg"><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/></svg>
            <span>${comentCount}</span>
          </button>
        </div>
      </div>
    </div>`;

  card.querySelector('.wall-like-btn').addEventListener('click', async (e) => {
    if (!uid) return;
    const btn = e.currentTarget, span = btn.querySelector('span');
    const ref = doc(db, basePath + '/likers/' + uid);
    const liked = btn.classList.contains('liked');
    const count = parseInt(span.textContent) || 0;
    if (liked) {
      await updateDoc(ref, { like: false, timestamp: Date.now() }).catch(() => setDoc(ref, { uid, like: false, timestamp: Date.now() }));
      btn.classList.remove('liked'); span.textContent = Math.max(0, count - 1);
    } else {
      const op = (await getDoc(ref)).exists() ? updateDoc : setDoc;
      await op(ref, { uid, like: true, timestamp: Date.now() });
      btn.classList.add('liked'); span.textContent = count + 1;
    }
  });

  card.querySelector('.wall-coment-btn').addEventListener('click', () => {
    _openWallComentsModal(basePath, snapId, card.querySelector('.wall-coment-btn span'));
  });

  card.querySelector('.wall-card-del-btn')?.addEventListener('click', async () => {
    if (confirm('Remover este post do mural?'))
      await deleteDoc(doc(db, 'users', profileUserId, 'wall', snapId));
  });

  container.appendChild(card);
}

function _openWallComentsModal(basePath, snapId, countSpan) {
  document.querySelector('.mobile-comments-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'mobile-comments-modal';
  modal.innerHTML = `
    <div class="mobile-comments-content">
      <div class="modal-comments-header">
        <div class="modal-grab"></div>
        <div class="modal-info"><h3>Comentários</h3></div>
      </div>
      <div class="modal-comments-list-container"><div class="comments-list-mobile"></div></div>
      <div class="mobile-comment-form-container">
        <div class="comment-form">
          <input type="text" class="comment-input-mobile" placeholder="Escreva um comentário...">
          <button class="comment-submit-mobile">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 404 511.5" style="width:18px;height:18px;fill:currentColor"><path fill-rule="nonzero" d="m219.24 72.97.54 438.53h-34.95l-.55-442.88L25.77 241.96 0 218.39 199.73 0 404 222.89l-25.77 23.58z"/></svg>
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const scrollY = window.scrollY;
  Object.assign(document.body.style, { overflow:'hidden', position:'fixed', width:'100%', top:`-${scrollY}px` });
  requestAnimationFrame(() => modal.classList.add('active'));

  modal.addEventListener('click', e => { if (e.target === modal) _closeWallComentsModal(modal); });

  const content = modal.querySelector('.mobile-comments-content');
  const grab    = modal.querySelector('.modal-grab');
  const header  = modal.querySelector('.modal-comments-header');
  let startY = 0, curY = 0, dragging = false;
  const onStart = e => { startY = e.touches[0].clientY; dragging = true; content.style.transition = 'none'; };
  const onMove  = e => {
    if (!dragging) return;
    curY = e.touches[0].clientY;
    const dy = curY - startY;
    if (dy > 0) { content.style.transform = `translateY(${dy}px)`; modal.style.backgroundColor = `rgba(0,0,0,${Math.max(0, 1 - dy/300) * 0.5})`; }
  };
  const onEnd = () => {
    if (!dragging) return; dragging = false;
    content.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
    if (curY - startY > 150) _closeWallComentsModal(modal);
    else { content.style.transform = 'translateY(0)'; modal.style.backgroundColor = 'rgba(0,0,0,0.5)'; }
  };
  [grab, header].forEach(el => {
    el.addEventListener('touchstart', onStart);
    el.addEventListener('touchmove',  onMove);
    el.addEventListener('touchend',   onEnd);
  });

  const list = modal.querySelector('.comments-list-mobile');
  _loadWallComents(basePath, list);

  const submitComent = async input => {
    const text = input.value.trim();
    if (!text || !auth.currentUser) return;
    await addDoc(collection(db, basePath + '/coments'), {
      senderid: auth.currentUser.uid, text, createdAt: serverTimestamp(),
    });
    input.value = '';
    _loadWallComents(basePath, list);
    const snap = await getDocs(collection(db, basePath + '/coments'));
    if (countSpan) countSpan.textContent = snap.size;
  };

  modal.querySelector('.comment-submit-mobile').addEventListener('click', () => submitComent(modal.querySelector('.comment-input-mobile')));
  modal.querySelector('.comment-input-mobile').addEventListener('keypress', e => { if (e.key === 'Enter') { e.preventDefault(); submitComent(e.target); } });
}

function _closeWallComentsModal(modal) {
  const content = modal.querySelector('.mobile-comments-content');
  content.style.transition = 'transform 0.3s ease';
  content.style.transform  = 'translateY(100%)';
  modal.style.opacity = '0';
  setTimeout(() => {
    const scrollY = document.body.style.top;
    modal.remove();
    Object.assign(document.body.style, { position:'', top:'', width:'', overflow:'' });
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }, 300);
}

async function _loadWallComents(basePath, list) {
  list.innerHTML = '<p style="color:#555;text-align:center;padding:16px;font-size:13px;">Carregando...</p>';
  const snap = await getDocs(query(collection(db, basePath + '/coments'), orderBy('createdAt', 'asc')));
  if (snap.empty) { list.innerHTML = '<p style="color:#555;text-align:center;padding:16px;font-size:13px;">Nenhum comentário ainda.</p>'; return; }
  list.innerHTML = '';
  for (const d of snap.docs) {
    const data = d.data();
    await getUserData(data.senderid);
    const u    = memCache.users.get(data.senderid) || {};
    const foto = memCache.photos.get(data.senderid) || './public/img/default.jpg';
    const nome = u.username || u.name || 'usuário';
    const el   = document.createElement('div');
    el.className = 'comment-item';
    el.innerHTML = `
      <img src="${foto}" class="comment-avatar" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" onerror="this.src='./public/img/default.jpg'">
      <div class="comment-body" style="flex:1;min-width:0;">
        <strong style="font-size:13px;">${nome}</strong>
        <p style="margin:2px 0 0;font-size:13px;color:#ccc;">${data.text}</p>
      </div>`;
    list.appendChild(el);
  }
}

// ═══════════════════════════════════════════════════════════
// NOTIFICAÇÕES PUSH
// ═══════════════════════════════════════════════════════════
(async function iniciarBotaoNotificacoes() {
  const btn   = $('btn-toggle-notif');
  const label = $('notif-menu-label');
  if (!btn || !label) return;

  const VAPID_KEY = "BMo3jh0D8qPPpaLywdvKZNiJfhi0RGtpvNkzSVsWD5ivJDvdjuvD4eGeRlRkyb59VcUG-PVhT2qSdrRcRO4qivg";
  const atualizarLabel = () => {
    const p = Notification.permission;
    label.textContent = p === 'granted' ? 'Notificações ativadas' : p === 'denied' ? 'Notificações bloqueadas' : 'Ativar Notificações';
  };
  atualizarLabel();

  btn.addEventListener('click', async e => {
    e.preventDefault();
    if (Notification.permission !== 'default') return;
    try {
      const { getMessaging, getToken } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js");
      const messaging = getMessaging(app);
      const swReg     = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      if (await Notification.requestPermission() !== 'granted') { atualizarLabel(); return; }
      atualizarLabel();
      const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
      if (!token) return;
      const user = auth.currentUser;
      if (user) await setDoc(doc(db, 'users', user.uid), { fcmToken: token, fcmUpdatedAt: new Date() }, { merge: true });
    } catch (err) { console.error('[FCM]', err); }
  });
})();

// ═══════════════════════════════════════════════════════════
// DADOS DO PERFIL
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
// BOOT
// ═══════════════════════════════════════════════════════════
lsClean();
document.addEventListener('DOMContentLoaded', () => { safe(setupViewMoreModal); });

onAuthStateChanged(auth, async user => {
  currentUser   = user;
  currentUserId = user?.uid || null;

  const navPic = $('nav-pic');
  if (navPic && !user) navPic.src = './public/img/default.jpg';

  const usernameURL = urlParam('username') || urlParam('u') || urlParam('user');
  const useridURL   = urlParam('userid')   || urlParam('uid');

  async function boot(uid) {
    await Promise.all([
      Promise.all([configurarBotoes(uid), atualizarStats(uid)]).catch(console.error),
      carregarPosts(uid).catch(console.error),
      iniciarWall().catch(console.error),
    ]);
    safe(() => renderReposts());
    if (typeof window._refreshEditBtn === 'function') window._refreshEditBtn();
    if (currentProfileData?.media?.musicTheme) safe(() => renderMidia(currentProfileData.media));
  }

  if (usernameURL) {
    const uid = await resolveUsername(usernameURL);
    if (!uid) { mostrarErro('Perfil não encontrado. Verifique o username.'); return; }
    profileUserId = uid;
    isOwnProfile  = !!(user && user.uid === uid);

    const cacheKey = usernameURL.toLowerCase().trim();
    const cached   = lsGet(cacheKey);
    if (cached) {
      safe(() => preencherPerfil(cached));
      safe(() => setupListeners(uid));
      if (cached.__stale) carregarDados(uid).then(d => { if (d) lsSave(cacheKey, d); }).catch(() => {});
    } else {
      const dados = await carregarDados(uid);
      if (!dados) return;
      safe(() => preencherPerfil(dados));
      lsSave(cacheKey, dados);
      safe(() => setupListeners(uid));
    }
    await boot(uid);
    if (typeof window._refreshEditBtn === 'function') window._refreshEditBtn();

  } else if (useridURL) {
    profileUserId = useridURL;
    isOwnProfile  = !!(user && user.uid === useridURL);
    const dados = await carregarDados(useridURL);
    if (!dados) return;
    safe(() => preencherPerfil(dados));
    safe(() => setupListeners(useridURL));
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

const btnLogout = document.querySelector('.logoff');
if (btnLogout) {
  btnLogout.addEventListener('click', async e => {
    e.preventDefault();
    try { await signOut(auth); window.location.replace('login.html'); }
    catch (err) { console.error('Erro ao sair:', err); }
  });
}