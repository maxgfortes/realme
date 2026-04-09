// ═══════════════════════════════════════════════════════════
// FIREBASE
// ═══════════════════════════════════════════════════════════
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, addDoc, onSnapshot, collection, query, orderBy, where, setDoc, updateDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { triggerNovaAmizade } from './activitie-creator.js';

const app  = getApps().length ? getApps()[0] : initializeApp({
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

// ═══════════════════════════════════════════════════════════
// HELPERS DOM
// ═══════════════════════════════════════════════════════════
const $   = id  => document.getElementById(id);
const $q  = sel => document.querySelector(sel);
const $qa = sel => document.querySelectorAll(sel);
const urlParam = name => new URLSearchParams(window.location.search).get(name);

function getDisplayName(d) { return d?.displayName || d?.displayname || d?.name || d?.username || 'Usuário'; }
function getUsername(d)    { return d?.username || ''; }

function safe(fn) {
  try { fn(); } catch (e) { console.warn(e); }
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

// localStorage perfil — TTL 7 dias, stale após 5 min
const LS_PFX   = 'profile_cache_';
const LS_TTL   = 7 * 24 * 60 * 60 * 1000;
const LS_STALE = 5 * 60 * 1000;

// Cache de UID resolvido por username — evita 3 round-trips repetidos
const LS_UID_PFX = 'uid_cache_';
const LS_UID_TTL = 30 * 60 * 1000; // 30 min

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
// CARREGAR DADOS — tudo em paralelo
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
// FIX: cache no localStorage para evitar 3 round-trips sequenciais
// ═══════════════════════════════════════════════════════════
async function resolveUsername(raw) {
  const key = raw.trim().toLowerCase();

  // 1. Cache local — retorno imediato sem Firestore
  const cached = lsGetUid(key);
  if (cached) return cached;

  // 2. Tabela de índice (mais rápido — 1 leitura)
  try {
    const s = await getDoc(doc(db, 'usernames', key));
    if (s.exists() && s.data().uid) {
      lsSaveUid(key, s.data().uid);
      return s.data().uid;
    }
  } catch {}

  // 3. Query por username (fallback, só se índice falhar)
  try {
    const s = await getDocs(query(collection(db, 'users'), where('username', '==', key)));
    if (!s.empty) { lsSaveUid(key, s.docs[0].id); return s.docs[0].id; }
  } catch {}

  // 4. Tenta com capitalização original (último recurso)
  try {
    const s = await getDocs(query(collection(db, 'users'), where('username', '==', raw.trim())));
    if (!s.empty) { lsSaveUid(key, s.docs[0].id); return s.docs[0].id; }
  } catch {}

  return null;
}

// ═══════════════════════════════════════════════════════════
// LISTENERS TEMPO REAL
// ═══════════════════════════════════════════════════════════
const _unsubs = [];
function setupListeners(uid) {
  _unsubs.forEach(u => u()); _unsubs.length = 0;
  const on = (ref, fn) => _unsubs.push(onSnapshot(ref, s => { if (s.exists()) fn(s.data()); }));

  on(doc(db, 'users', uid), d => {
    memCache.users.set(uid, d);
    currentProfileData = { ...(currentProfileData || {}), ...d };
    safe(() => renderPrincipal(d));
  });
  on(doc(db, `users/${uid}/user-infos/user-media`), d => {
    currentProfileData = { ...(currentProfileData || {}), media: { ...(currentProfileData?.media || {}), ...d } };
    safe(() => renderMidia(d));
  });
  on(doc(db, `users/${uid}/user-infos/likes`), d => {
    currentProfileData = { ...(currentProfileData || {}), likes: d };
    safe(() => renderGostos(d));
    safe(() => renderModal(currentProfileData));
  });
  on(doc(db, `users/${uid}/user-infos/about`), d => {
    currentProfileData = { ...(currentProfileData || {}), about: d };
    safe(() => renderVisaoGeral(d));
    safe(() => renderPronomes(d));
    safe(() => renderModal(currentProfileData));
  });
  on(doc(db, `users/${uid}/user-infos/more-infos`), d => {
    currentProfileData = { ...(currentProfileData || {}), moreInfos: d };
    const bioEl = $('bio'); if (bioEl && d.bio) bioEl.textContent = d.bio;
  });
  _unsubs.push(onSnapshot(doc(db, `users/${uid}/user-infos/links`), s => {
    safe(() => renderLinks(s.exists() ? s.data() : {}));
  }));
}

// ═══════════════════════════════════════════════════════════
// RENDER
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
      el.onerror = () => {
        el.src = './src/img/default.jpg';
      };
    });
    document.querySelectorAll('.pfp-border').forEach(el => {
      el.style.backgroundImage = `url(${foto})`;
      el.style.backgroundPosition = "center";
      el.style.backgroundSize = "cover";
      el.style.backgroundRepeat = "no-repeat";
    });
    if (profileUserId) {
      memCache.photos.set(profileUserId, foto);
    }
    const navPic = document.getElementById('nav-pic');
    if (navPic && isOwnProfile) {
      navPic.src = foto;
      try {
        localStorage.setItem('user_photo_cache', foto);
      } catch {}
    }
  }
  const bannerSrc = media.banner || media.headerphoto;
  const bannerArea = document.querySelector('.pf-banner-area');
  const bannerEl   = document.querySelector('.profile-banner');
  const music = document.querySelector('.music');
  if (bannerArea && bannerEl) {
    if (bannerSrc) {
      bannerEl.style.backgroundImage = `url(${bannerSrc})`;
      bannerArea.classList.remove('hidden');
    } else {
      bannerArea.classList.add('hidden');
    }
  }
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
    instagram: { base:'https://instagram.com/',         icon:'fab fa-instagram', label:'Instagram' },
    x:         { base:'https://x.com/',                 icon:'fab fa-twitter',   label:'X' },
    tiktok:    { base:'https://tiktok.com/@',           icon:'fab fa-tiktok',    label:'TikTok' },
    youtube:   { base:'https://youtube.com/',           icon:'fab fa-youtube',   label:'YouTube' },
    github:    { base:'https://github.com/',            icon:'fab fa-github',    label:'GitHub' },
    discord:   { base:'https://discord.com/users/',     icon:'fab fa-discord',   label:'Discord' },
    pinterest: { base:'https://pinterest.com/',         icon:'fab fa-pinterest', label:'Pinterest' },
    spotify:   { base:'https://open.spotify.com/user/',icon:'fab fa-spotify',   label:'Spotify' },
    linkedin:  { base:'https://linkedin.com/in/',       icon:'fab fa-linkedin',  label:'LinkedIn' },
    twitch:    { base:'https://twitch.tv/',             icon:'fab fa-twitch',    label:'Twitch' },
    reddit:    { base:'https://reddit.com/u/',          icon:'fab fa-reddit',    label:'Reddit' },
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
// FOTO DE PERFIL NO NAV
// FIX: sem segundo onAuthStateChanged nem leitura Firestore extra.
// Usa localStorage como cache imediato e memCache como fonte de verdade.
// ═══════════════════════════════════════════════════════════
function carregarFotoPerfil() {
  const navPic = $('nav-pic'); if (!navPic) return;
  // Mostra cache local instantaneamente
  const cached = localStorage.getItem('user_photo_cache');
  if (cached) navPic.src = cached;
  // A foto real virá via renderMidia() quando os dados carregarem —
  // não precisamos de uma segunda chamada ao Firestore aqui.
}
document.addEventListener('DOMContentLoaded', carregarFotoPerfil);

// ═══════════════════════════════════════════════════════════
// FORMATAÇÃO
// ═══════════════════════════════════════════════════════════
function formatTs(ts) {
  if (!ts) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    const diff = Date.now() - d;
    const m = Math.floor(diff / 60000), h = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
    if (m < 1) return 'Agora';
    if (m < 60) return `${m}min`;
    if (h < 24) return `${h}h`;
    if (day < 7) return `${day}d`;
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
  } catch { return ''; }
}

function formatRelativeTime(ts) {
  if (!ts) return 'Data desconhecida';
  let d;
  if (ts.toDate)   d = ts.toDate();
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else d = new Date(ts);
  const sec = Math.floor((Date.now() - d) / 1000);
  if (sec < 60)   return 'Agora';
  const min = Math.floor(sec / 60);   if (min < 60)  return `há ${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const hr  = Math.floor(min / 60);   if (hr  < 24)  return `há ${hr} ${hr === 1 ? 'hora' : 'horas'}`;
  const day = Math.floor(hr  / 24);   if (day < 7)   return `há ${day} ${day === 1 ? 'dia' : 'dias'}`;
  const wk  = Math.floor(day / 7);    if (wk  < 5)   return `há ${wk} ${wk === 1 ? 'semana' : 'semanas'}`;
  const mo  = Math.floor(day / 30.44);if (mo  < 12)  return `há ${mo} ${mo === 1 ? 'mês' : 'meses'}`;
  const yr  = Math.floor(mo  / 12);   return `há ${yr} ${yr === 1 ? 'ano' : 'anos'}`;
}

function formatBirthday(v) {
  if (!v) return 'Não informado';
  try {
    let d = v.toDate ? v.toDate() : v.seconds ? new Date(v.seconds * 1000) : new Date(v);
    if (isNaN(d)) return 'Data inválida';
    const mes = d.toLocaleString('pt-BR', { month: 'long' });
    return `${d.getDate()} de ${mes.charAt(0).toUpperCase() + mes.slice(1)}`;
  } catch { return 'Data inválida'; }
}

function traduzirGenero(g) {
  const m = { masculino:'Masculino', feminino:'Feminino', outro:'Outro', prefiro_nao_dizer:'Prefiro não dizer',
    male:'Masculino', female:'Feminino', other:'Outro', prefer_not_to_say:'Prefiro não dizer' };
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
    const segSet  = new Set(segSnap.docs.map(d => d.id));
    const amigos  = segndoSnap.docs.filter(d => segSet.has(d.id)).length;
    const statsEl = $q('.profile-stats'); if (!statsEl) return;
    statsEl.innerHTML = `
      <div class="stat-item stats-click" data-tab="amigos">
        <span class="stat-count">${amigos}</span><span class="stat-label">amigos</span>
      </div>
      <div class="stat-item stats-click" data-tab="seguidores">
        <span class="stat-count">${segSnap.size}</span><span class="stat-label">seguidores</span>
      </div>
      <div class="stat-item stats-click" data-tab="seguindo">
        <span class="stat-count">${segndoSnap.size}</span><span class="stat-label">seguindo</span>
      </div>`;
    statsEl.querySelectorAll('.stats-click').forEach(el => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => abrirOverlay(uid, el.dataset.tab));
    });
  } catch (e) { console.error('atualizarStats:', e); }
}

// ═══════════════════════════════════════════════════════════
// OVERLAY SEGUIDORES / SEGUINDO / AMIGOS
// ═══════════════════════════════════════════════════════════
function abrirOverlay(uid, tabInicial = 'seguidores') {
  if ($('listas-overlay')) return;

  const style = document.createElement('style');
  style.id = 'listas-overlay-css';
  style.textContent = `
    #listas-overlay{position:fixed;inset:0;z-index:999999;background:var(--bg-primary,#0f0f0f);display:flex;flex-direction:column;animation:lo-in .3s cubic-bezier(.4,0,.2,1);overflow:hidden}
    @keyframes lo-in{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes lo-out{from{transform:translateY(0);opacity:1}to{transform:translateY(60px);opacity:0}}
    #listas-overlay.closing{animation:lo-out .25s cubic-bezier(.4,0,.2,1) forwards}
    .lo-header{display:flex;align-items:center;justify-content:space-between;padding:16px;padding-top:max(16px,env(safe-area-inset-top,16px))}
    .lo-back{width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:none;border:none;color:#f8f9f9;cursor:pointer;border-radius:50%}
    .lo-title{font-size:18px;font-weight:700;color:#f8f9f9}.lo-spacer{width:40px}
    .lo-tabs{display:flex;position:relative;flex-shrink:0;border-bottom:1px solid #1e1e1e}
    .lo-tab-btn{flex:1;background:none;border:none;color:#666;padding:13px 0;font-size:14px;font-weight:600;cursor:pointer;transition:color .2s;position:relative;z-index:1}
    .lo-tab-btn.active{color:#f8f9f9}
    .lo-indicator{position:absolute;bottom:0;height:2px;background:#fff;transition:left .25s cubic-bezier(.4,0,.2,1),width .25s cubic-bezier(.4,0,.2,1)}
    .lo-pages-wrap{flex:1;overflow:hidden;position:relative}
    .lo-pages{display:flex;height:100%;transition:transform .28s cubic-bezier(.4,0,.2,1);will-change:transform}
    .lo-page{min-width:100%;height:100%;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:120px}
    .lo-user-row{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;transition:background .12s}
    .lo-avatar{width:50px;height:50px;border-radius:50%;object-fit:cover;flex-shrink:0;background:#1e1e1e}
    .lo-user-info{flex:1;min-width:0}
    .lo-user-username{font-size:15px;font-weight:600;color:#f8f9f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .lo-user-pronouns{font-size:13px;color:#666;margin-top:2px}
    .lo-action-btn{flex-shrink:0;padding:7px 16px;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;background:transparent;color:#f8f9f9}
    .lo-action-btn.following{background:#4A90E2;border-color:#4A90E2;color:#fff}
    .lo-action-btn.danger{border-color:#f85149;color:#f85149}
    .lo-action-btn:disabled{opacity:.4;pointer-events:none}
    .lo-empty{display:flex;flex-direction:column;align-items:center;padding:80px 20px;color:#444;text-align:center;gap:12px}
    .lo-empty i{font-size:42px;color:#fff}.lo-empty p{font-size:14px;line-height:1.5}
    .lo-loading{text-align:center;padding:60px;color:#444}`;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'listas-overlay';
  overlay.innerHTML = `
    <div class="page-content-pc-container"><div class="page-pc-area">
    <div class="lo-header">
      <button class="lo-back" id="lo-back-btn">
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
      <div style="position:absolute;bottom:0;left:0;right:0;height:2px;">
        <div class="lo-indicator" id="lo-indicator"></div>
      </div>
    </div>
    <div class="lo-pages-wrap"><div class="lo-pages" id="lo-pages">
      <div class="lo-page" id="lo-page-0"></div>
      <div class="lo-page" id="lo-page-1"></div>
      <div class="lo-page" id="lo-page-2"></div>
    </div></div>
    </div></div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  const TABS    = ['seguindo','seguidores','amigos'];
  const tabBtns = overlay.querySelectorAll('.lo-tab-btn');
  const pages   = overlay.querySelector('#lo-pages');
  const indic   = overlay.querySelector('#lo-indicator');
  const loaded  = new Set();
  let curTab    = Math.max(0, TABS.indexOf(tabInicial));

  function moveIndic(idx) { const b = tabBtns[idx]; indic.style.left = b.offsetLeft+'px'; indic.style.width = b.offsetWidth+'px'; }
  function setTab(idx, anim = true) {
    if (idx < 0 || idx >= 3) return;
    curTab = idx;
    tabBtns.forEach((b, i) => b.classList.toggle('active', i === idx));
    pages.style.transition = anim ? '' : 'none';
    pages.style.transform  = `translateX(-${idx * 100}%)`;
    if (!anim) pages.getBoundingClientRect();
    moveIndic(idx);
    if (!loaded.has(idx)) { loaded.add(idx); carregarLista(uid, TABS[idx], idx); }
  }

  requestAnimationFrame(() => setTab(curTab, false));
  tabBtns.forEach(btn => btn.addEventListener('click', () => setTab(+btn.dataset.idx)));

  let swX = 0, swY = 0, sw = false;
  overlay.addEventListener('touchstart', e => { swX = e.touches[0].clientX; swY = e.touches[0].clientY; sw = true; }, { passive: true });
  overlay.addEventListener('touchmove',  e => { if (!sw) return; if (Math.abs(e.touches[0].clientY - swY) > Math.abs(e.touches[0].clientX - swX) + 10) sw = false; }, { passive: true });
  overlay.addEventListener('touchend',   e => { if (!sw) return; sw = false; const dx = e.changedTouches[0].clientX - swX; if (Math.abs(dx) > 55) setTab(curTab + (dx < 0 ? 1 : -1)); }, { passive: true });

  function fechar() {
    overlay.classList.add('closing');
    setTimeout(() => { overlay.remove(); $('listas-overlay-css')?.remove(); document.body.style.overflow = ''; }, 260);
  }
  overlay.querySelector('#lo-back-btn').addEventListener('click', fechar);
}

async function carregarLista(profileUid, tipo, pageIdx) {
  const page = $(`lo-page-${pageIdx}`); if (!page) return;
  page.innerHTML = `<div class="lo-loading"><i class="fas fa-spinner fa-spin"></i></div>`;
  try {
    let uids = [];
    if (tipo === 'seguindo') {
      uids = (await getDocs(collection(db, 'users', profileUid, 'following'))).docs.map(d => d.id);
    } else if (tipo === 'seguidores') {
      uids = (await getDocs(collection(db, 'users', profileUid, 'followers'))).docs.map(d => d.id);
    } else {
      const [seg, sendo] = await Promise.all([
        getDocs(collection(db, 'users', profileUid, 'followers')),
        getDocs(collection(db, 'users', profileUid, 'following')),
      ]);
      const segSet = new Set(seg.docs.map(d => d.id));
      uids = sendo.docs.filter(d => segSet.has(d.id)).map(d => d.id);
    }
    page.innerHTML = '';
    if (!uids.length) { page.innerHTML = `<div class="lo-empty"><i class="fas fa-users"></i><p>Nenhum usuário aqui ainda.</p></div>`; return; }
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
    if (tipo === 'seguidores') actionHTML = `<button class="lo-action-btn danger" data-action="remove" data-uid="${uid}">Remover</button>`;
    else if (tipo === 'seguindo') actionHTML = `<button class="lo-action-btn following" data-action="unfollow" data-uid="${uid}">Seguindo</button>`;
  } else if (currentUserId && uid !== currentUserId) {
    const jaSegue = await estasSeguindo(currentUserId, uid);
    actionHTML = `<button class="lo-action-btn ${jaSegue ? 'following' : ''}" data-action="follow" data-uid="${uid}" data-following="${jaSegue}">${jaSegue ? 'Seguindo' : 'Seguir'}</button>`;
  }
  row.innerHTML = `
    <img class="lo-avatar" src="${foto}" alt="${un}" onerror="this.src='./src/img/default.jpg'">
    <div class="lo-user-info">
      <div class="lo-user-username">${un}</div>
      ${dn !== un ? `<div class="lo-user-pronouns">${dn}</div>` : ''}
    </div>${actionHTML}`;
  row.addEventListener('click', e => { if (e.target.closest('.lo-action-btn')) return; window.location.href = `profile.html?username=${encodeURIComponent(un)}`; });
  const btn = row.querySelector('.lo-action-btn');
  if (btn) {
    btn.addEventListener('click', async e => {
      e.stopPropagation(); btn.disabled = true;
      const action = btn.dataset.action;
      if (action === 'remove') {
        btn.textContent = '...'; await removerSeguidor(profileUid, uid);
        row.style.transition = 'opacity .3s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 320);
        atualizarStats(profileUid);
      } else if (action === 'unfollow') {
        btn.textContent = '...'; await desseguir(currentUserId, uid);
        row.style.transition = 'opacity .3s'; row.style.opacity = '0'; setTimeout(() => row.remove(), 320);
        atualizarStats(profileUid);
      } else if (action === 'follow') {
        const jaSegue = btn.dataset.following === 'true'; btn.textContent = '...';
        if (jaSegue) { await desseguir(currentUserId, uid); btn.textContent = 'Seguir'; btn.classList.remove('following'); btn.dataset.following = 'false'; }
        else { await seguir(currentUserId, uid); btn.textContent = 'Seguindo'; btn.classList.add('following'); btn.dataset.following = 'true'; }
        btn.disabled = false; atualizarStats(profileUid);
      }
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

  const followBtn = clone(btnOutro);
  if (followBtn) {
    followBtn.style.display = 'inline-flex';
    let isF = await estasSeguindo(currentUserId, targetUid);
    const atualizar = () => {
      followBtn.textContent = isF ? 'Seguindo' : 'Seguir';
      followBtn.classList.toggle('following', isF);
      followBtn.style.background  = isF ? '#2b2f33' : 'var(--primary-btn, #4A90E2)';
      followBtn.style.borderColor = 'var(--primary-btn, #4A90E2)';
      followBtn.style.color = '#fff';
      followBtn.disabled = false;
    };
    atualizar();
    followBtn.addEventListener('click', async () => {
      followBtn.disabled = true; followBtn.textContent = 'Seguir';
      try {
        if (isF) { await desseguir(currentUserId, targetUid); isF = false; }
        else {
          await seguir(currentUserId, targetUid); isF = true;
          try {
            const mutuoSnap = await getDoc(doc(db, 'users', currentUserId, 'followers', targetUid));
            if (mutuoSnap.exists()) {
              const targetData = await getUserData(targetUid);
              triggerNovaAmizade(targetUid, targetData.username || targetUid).catch(console.warn);
            }
          } catch {}
        }
      } catch (e) { console.error('follow toggle:', e); }
      atualizar(); atualizarStats(targetUid);
    });
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
// POSTS
// FIX: query filtrada por creatorid — não baixa a coleção inteira
// ═══════════════════════════════════════════════════════════
async function carregarPosts(uid) {
  const c = $('muralPosts') || $q('.mural-tab'); if (!c || !uid) return;
  c.innerHTML = `<div class="loading-container"><div class="loading-spinner"></div><p>Carregando posts...</p></div>`;
  try {
    // FIX: usa where() para só trazer posts do usuário, não a coleção inteira
    const snap = await getDocs(query(collection(db, 'posts'), where('creatorid', '==', uid), orderBy('create', 'desc')));
    const posts = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    postsDoUsuario = posts.map(p => ({ id: p.id, userid: uid, data: p.data }));
    c.innerHTML = '';
    if (!posts.length) {
      c.classList.add('empty-posts');
      c.innerHTML = `
        <div class="about-box" style="text-align:center;padding:30px;width:100%!important;">
          <div class="icon-area"><div class="icon-place"><i class="fa-regular fa-camera" style="font-size:38px;color:#fff;"></i></div></div>
          <h3 style="color:#fff;margin-bottom:12px;">Nenhum post ainda</h3>
          <p style="color:#555;">Este usuário ainda não fez nenhum post.</p>
        </div>`;
      return;
    }
    c.classList.remove('empty-posts');
    posts.forEach(p => c.appendChild(criarPreview(p.data, p.id)));
  } catch (e) {
    console.error('carregarPosts:', e);
    // Fallback: tenta sem orderBy (índice pode não existir)
    try {
      const snap2 = await getDocs(query(collection(db, 'posts'), where('creatorid', '==', uid)));
      const posts2 = snap2.docs.map(d => ({ id: d.id, data: d.data() }));
      posts2.sort((a, b) => {
        const ts = x => x?.toDate?.()?.getTime?.() || (x?.seconds ? x.seconds*1000 : new Date(x||0).getTime());
        return ts(b.data.create) - ts(a.data.create);
      });
      postsDoUsuario = posts2.map(p => ({ id: p.id, userid: uid, data: p.data }));
      c.innerHTML = '';
      posts2.forEach(p => c.appendChild(criarPreview(p.data, p.id)));
    } catch (e2) {
      console.error('carregarPosts fallback:', e2);
      c.innerHTML = `<p style="color:#aaa;text-align:center;padding:20px;">Erro ao carregar posts.</p>`;
    }
  }
}

function criarPreview(postData, postId) {
  const el = document.createElement('div');
  el.className = 'postpreview';
  if (postData.img?.trim()) {
    el.innerHTML = `<img src="${postData.img}" class="post-preview-img" onerror="this.parentElement.innerHTML='<div class=post-preview-error>Erro</div>'">`;
  } else {
    const txt = postData.content || '';
    el.innerHTML = `<div class="post-preview-text-container"><p class="post-preview-text">${txt.length > 80 ? txt.slice(0,80)+'…' : txt}</p></div>`;
  }
  el.onclick = () => { const i = postsDoUsuario.findIndex(p => p.id === postId); abrirFeed(i); };
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
      onStateChange(e) { if (e.data === YT.PlayerState.ENDED) { e.target.seekTo(0); e.target.playVideo(); } }
    }
  });
}

function toggleMusic() {
  if (!musicPlayer?.playVideo) return;
  if (musicPlaying) { musicPlayer.pauseVideo(); musicPlaying = false; }
  else { musicPlayer.playVideo(); musicPlaying = true; }
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
// WALL
// FIX: cards do wall renderizados em paralelo, não um por um
// ═══════════════════════════════════════════════════════════
async function iniciarWall() {
  if (!profileUserId) return;

  const modal     = $('wall-modal');
  const textarea  = $('wall-input');
  const btnEnviar = $q('.send-wall-btn');
  const btnCancel = $q('.cancel-wall-btn');
  const sendWall  = $q('.send-wall');
  const wallFeed  = $('wall-feed');

  const modalImg  = $q('.pfp-modal-wall img');
  const modalName = $q('.username-modal-wall');
  const sendImg   = $q('.pfp-send-wall img');
  const sendText  = $q('.input-send-wall');

  if (!modal || !wallFeed) return;

  // FIX: busca dados do wall em paralelo com os outros dados; usa memCache quando possível
  const [targetUser, targetPhoto, myUser, myPhoto] = await Promise.all([
    getUserData(profileUserId),
    getUserPhoto(profileUserId),
    auth.currentUser ? getUserData(auth.currentUser.uid) : Promise.resolve({}),
    auth.currentUser ? getUserPhoto(auth.currentUser.uid) : Promise.resolve('./src/img/default.jpg'),
  ]);

  const targetUsername = targetUser.username || targetUser.name || 'usuário';
  const myName = myUser.username || myUser.name || 'Você';

  if (textarea)  textarea.placeholder = `Escreva para ${targetUsername}...`;
  if (sendText)  sendText.textContent = `Escreva para ${targetUsername}...`;
  if (sendImg)   sendImg.src  = myPhoto || './src/img/default.jpg';
  if (modalImg)  modalImg.src = myPhoto || './src/img/default.jpg';
  if (modalName) modalName.textContent = myName;

  const abrirModal  = () => { modal.classList.add('active'); };
  const fecharModal = () => { modal.classList.remove('active'); if (textarea) textarea.value = ''; };

  sendWall?.addEventListener('click', abrirModal);
  btnCancel?.addEventListener('click', fecharModal);
  modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });

  btnEnviar?.addEventListener('click', async () => {
    const texto = textarea?.value.trim();
    if (!texto || !currentUserId || !profileUserId) return;
    btnEnviar.disabled = true;
    try {
      await addDoc(collection(db, 'users', profileUserId, 'wall'), { authorId: auth.currentUser.uid, text: texto, createdAt: serverTimestamp() });
      fecharModal();
    } catch (e) { alert('Erro ao enviar: ' + e.message); }
    finally { btnEnviar.disabled = false; }
  });

  onSnapshot(
    query(collection(db, 'users', profileUserId, 'wall'), orderBy('createdAt', 'desc')),
    async snap => {
      wallFeed.innerHTML = '';
      if (snap.empty) {
        wallFeed.innerHTML = '<p style="color:#555;text-align:center;padding:24px">Nenhum post ainda</p>';
        return;
      }

      // FIX: busca dados de todos os autores em paralelo — não loop sequencial
      const posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const authorIds = [...new Set(posts.map(p => p.authorId).filter(Boolean))];
      await Promise.all(authorIds.map(id => Promise.all([getUserData(id), getUserPhoto(id)])));

      // Agora tudo está no memCache — monta os cards sem I/O adicional
      const fragment = document.createDocumentFragment();
      for (const post of posts) {
        const userData = memCache.users.get(post.authorId) || {};
        const fotoUrl  = memCache.photos.get(post.authorId) || './src/img/default.jpg';
        const nome        = userData.username || userData.name || 'usuário';
        const podeDeletar = currentUserId === post.authorId || currentUserId === profileUserId;
        const card = document.createElement('div'); card.className = 'wall-card';
        card.innerHTML = `
          <div class="wall-card-header">
            <div class="wall-card-left-header">
              <div class="wall-card-pfp"><img src="${fotoUrl}" onerror="this.src='./src/img/default.jpg'"></div>
              <div class="wall-card-infos"><div class="wall-card-username">${nome}</div></div>
            </div>
            ${podeDeletar ? `<div class="wall-card-right-header">
              <button class="card-options"><i class="fa-solid fa-ellipsis"></i></button>
            </div>` : ''}
          </div>
          <div class="wall-card-text">${post.text}</div>`;
        const snapId = snap.docs.find(d => d.data().authorId === post.authorId && d.data().text === post.text)?.id || post.id;
        card.querySelector('.card-options')?.addEventListener('click', async () => {
          if (confirm('Remover este post?')) await deleteDoc(doc(db, 'users', profileUserId, 'wall', snapId));
        });
        fragment.appendChild(card);
      }
      wallFeed.appendChild(fragment);
    }
  );
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
// BOOT PRINCIPAL
// FIX: posts + wall + reposts rodam em paralelo
// FIX: nav foto sem segundo onAuthStateChanged
// ═══════════════════════════════════════════════════════════
lsClean();

document.addEventListener('DOMContentLoaded', () => { safe(setupViewMoreModal); });

onAuthStateChanged(auth, async user => {
  currentUser   = user;
  currentUserId = user?.uid || null;

  // Foto do nav: usa cache local imediatamente (sem Firestore aqui)
  const navPic = $('nav-pic');
  if (navPic && !user) navPic.src = './src/img/default.jpg';

  const usernameURL = urlParam('username') || urlParam('u') || urlParam('user');
  const useridURL   = urlParam('userid')   || urlParam('uid');

  async function boot(uid) {
    // FIX: tudo em paralelo — posts, wall, reposts, botões e stats ao mesmo tempo
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
    const cached = lsGet(cacheKey);
    if (cached) {
      safe(() => preencherPerfil(cached));
      safe(() => setupListeners(uid));
      // Atualiza em background se stale — sem bloquear o render
      if (cached.__stale) {
        carregarDados(uid).then(d => { if (d) lsSave(cacheKey, d); }).catch(() => {});
      }
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