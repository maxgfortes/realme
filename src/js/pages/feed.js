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

const POSTS_LIMIT = 10;
const CACHE = {
  POSTS_TTL: 8 * 60 * 1000,
  USERS_TTL: 30 * 60 * 1000,
  SYNC_INTERVAL: 2 * 60 * 1000,
  MAX_POSTS: 100,
  COMMENTS_TTL: 8 * 60 * 1000,
  MAX_COMMENT_POSTS: 30,
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
let currentMusicPost = null;
let musicObserver = null;
let postImageFiles = [];
let currentMenuPost = null;

let feed, loadMoreBtn, postInput, postButton;


// ─── CACHE ───────────────────────────────────────────────────

const cacheGet = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw).value ?? null;
  } catch { return null; }
};

const cacheSet = (key, value, ttl = CACHE.USERS_TTL) => {
  try {
    localStorage.setItem(key, JSON.stringify({ time: Date.now(), value, ttl }));
  } catch {}
};

const cacheExpired = (key) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    const { time, ttl = CACHE.USERS_TTL } = JSON.parse(raw);
    return Date.now() - time > ttl;
  } catch { return true; }
};

const cacheRemove = (key) => { try { localStorage.removeItem(key); } catch {} };


// ─── CACHE DE POSTS ──────────────────────────────────────────

const POSTS_CACHE_KEY = 'feed_posts_cache';

function getPostsCache() {
  try {
    const raw = localStorage.getItem(POSTS_CACHE_KEY);
    if (!raw) return null;
    const { timestamp, posts } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE.POSTS_TTL) {
      cacheRemove(POSTS_CACHE_KEY);
      return null;
    }
    return posts;
  } catch { return null; }
}

function setPostsCache(posts) {
  try {
    localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify({
      timestamp: Date.now(),
      posts: posts.slice(0, CACHE.MAX_POSTS)
    }));
  } catch {}
}

const clearPostsCache = () => cacheRemove(POSTS_CACHE_KEY);


// ─── SINCRONIZAÇÃO BACKGROUND ────────────────────────────────

function startSync() {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(async () => {
    if (!auth.currentUser) return;
    try {
      const snap = await getDocs(query(collection(db, 'posts'), orderBy('create', 'desc'), limit(1)));
      if (snap.empty) return;
      const cached = getPostsCache() ?? [];
      const latest = cached.find(p => p.tipo === 'post');
      if (latest && snap.docs[0].id !== latest.postid) clearPostsCache();
    } catch {}
  }, CACHE.SYNC_INTERVAL);
}

function stopSync() {
  if (syncTimer) { clearInterval(syncTimer); syncTimer = null; }
}


// ─── CACHE DE COMENTÁRIOS ────────────────────────────────────

const commentCacheKey = (postId) => `coments_cache_${postId}`;

function getCommentsCache(postId) {
  try {
    const raw = localStorage.getItem(commentCacheKey(postId));
    return raw ? JSON.parse(raw).comentarios : null;
  } catch { return null; }
}

function setCommentsCache(postId, comentarios) {
  try {
    const serialized = comentarios.map(c => ({
      ...c,
      create: c.create?.seconds ? c.create.seconds * 1000 : c.create
    }));
    localStorage.setItem(commentCacheKey(postId), JSON.stringify({
      timestamp: Date.now(),
      comentarios: serialized
    }));
    pruneCommentsCache();
  } catch {}
}

const invalidateCommentsCache = (postId) => cacheRemove(commentCacheKey(postId));

const isCommentsCacheExpired = (postId) => {
  try {
    const raw = localStorage.getItem(commentCacheKey(postId));
    if (!raw) return true;
    return Date.now() - JSON.parse(raw).timestamp > CACHE.COMMENTS_TTL;
  } catch { return true; }
};

function pruneCommentsCache() {
  try {
    const prefix = 'coments_cache_';
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
      .filter(k => k?.startsWith(prefix));
    if (keys.length <= CACHE.MAX_COMMENT_POSTS) return;
    keys
      .map(k => { try { return { k, t: JSON.parse(localStorage.getItem(k)).timestamp }; } catch { return { k, t: 0 }; } })
      .sort((a, b) => a.t - b.t)
      .slice(0, keys.length - CACHE.MAX_COMMENT_POSTS)
      .forEach(({ k }) => cacheRemove(k));
  } catch {}
}


// ─── CACHE DE USUÁRIOS ───────────────────────────────────────

async function fetchUser(uid) {
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return null;
    const data = userSnap.data();

    let userphoto = '';
    try {
      const mediaSnap = await getDoc(doc(db, 'users', uid, 'user-infos', 'user-media'));
      if (mediaSnap.exists()) userphoto = mediaSnap.data().userphoto || '';
    } catch {}

    const name = data.name || '';
    const surname = data.surname || '';
    return {
      userphoto,
      username: data.username || '',
      displayname: data.displayname || '',
      name,
      surname,
      fullname: `${name} ${surname}`.trim(),
      verified: data.verified || false
    };
  } catch { return null; }
}

async function getUserCached(uid) {
  const key = `user_cache_${uid}`;
  const isSelf = auth.currentUser?.uid === uid;

  if (isSelf) {
    if (!cacheExpired(key)) return cacheGet(key);
    const data = await fetchUser(uid);
    if (data) cacheSet(key, data, CACHE.USERS_TTL);
    return data;
  }

  const stale = cacheGet(key);
  if (stale) {
    if (cacheExpired(key)) fetchUser(uid).then(d => { if (d) cacheSet(key, d, CACHE.USERS_TTL); }).catch(() => {});
    return stale;
  }

  const data = await fetchUser(uid);
  if (data) cacheSet(key, data, CACHE.USERS_TTL);
  return data;
}


// ─── AUTENTICAÇÃO ────────────────────────────────────────────

function waitForAuth() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (!user) setTimeout(() => { window.location.href = 'login.html'; }, 2000);
      resolve(user ?? null);
    });
  });
}


// ─── UTILITÁRIOS ─────────────────────────────────────────────

const uid = (prefix = 'id') => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const toSeconds = (ts) => !ts ? 0 : (ts.seconds ?? new Date(ts).getTime() / 1000);
const sortChronological = (arr) => arr.sort((a, b) => toSeconds(b.create) - toSeconds(a.create));

function resolvePhoto(...candidates) {
  for (const p of candidates) {
    if (p && typeof p === 'string') {
      try { new URL(p); return p; } catch {}
    }
  }
  return DEFAULT_AVATAR;
}

function formatRelativeDate(data) {
  if (!data) return 'Data não disponível';
  try {
    const date = data?.seconds ? new Date(data.seconds * 1000) : new Date(data);
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 6e4);
    const h = Math.floor(diff / 36e5);
    const d = Math.floor(diff / 864e5);
    const w = Math.floor(d / 7);
    const mo = Math.floor(d / 30);
    const y = Math.floor(d / 365);
    if (m < 1)   return 'Agora mesmo';
    if (m < 60)  return `há ${m} minuto${m !== 1 ? 's' : ''}`;
    if (h < 24)  return `há ${h} hora${h !== 1 ? 's' : ''}`;
    if (d < 7)   return `há ${d} dia${d !== 1 ? 's' : ''}`;
    if (w < 4)   return `há ${w} semana${w !== 1 ? 's' : ''}`;
    if (mo < 12) return `há ${mo} mês${mo !== 1 ? 'es' : ''}`;
    return `há ${y} ano${y !== 1 ? 's' : ''}`;
  } catch { return 'Data inválida'; }
}

function formatText(text) {
  return text
    .replace(/#(\w+)/g, '<span class="hashtag">#$1</span>')
    .replace(/@([a-z0-9._]+)/g, (_, u) => `<a href="profile?u=${u}" class="mention">@${u}</a>`);
}


// ─── SCROLL INFINITO ─────────────────────────────────────────

function setupInfiniteScroll() {
  document.addEventListener('scroll', async (e) => {
    const t = e.target;
    let scrollTop, windowHeight, docHeight;

    if (t === document || t === document.documentElement || t === document.body) {
      scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      windowHeight = window.innerHeight;
      docHeight = document.documentElement.scrollHeight;
    } else if (t.scrollHeight > t.clientHeight) {
      scrollTop = t.scrollTop;
      windowHeight = t.clientHeight;
      docHeight = t.scrollHeight;
    } else return;

    if (scrollTop + windowHeight >= docHeight - 2200) {
      const feedEl = document.getElementById('feed');
      if (feedEl && window.getComputedStyle(feedEl).display !== 'none' && !loading && hasMorePosts) {
        await loadPosts();
      }
    }
  }, true);
}


// ─── TEXTO DO "CURTIDO POR" ──────────────────────────────────

async function getLikedByInfo(postId, currentUid) {
  const snap = await getDocs(collection(db, `posts/${postId}/likers`));
  const likers = snap.docs.filter(d => d.data().like === true).map(d => ({
    uid: d.id,
    timestamp: d.data().timestamp || 0
  }));

  const total = likers.length;
  if (total === 0) return { usernames: [], total: 0, fotos: [] };

  if (total === 1 && likers[0].uid === currentUid) {
    const me = await getUserCached(currentUid);
    return { usernames: ['você'], total, fotos: [me?.userphoto || DEFAULT_AVATAR] };
  }

  const others = likers.filter(l => l.uid !== currentUid).sort((a, b) => b.timestamp - a.timestamp);
  if (!others.length) return { usernames: ['você'], total, fotos: [] };

  const friendsSnap = await getDocs(collection(db, `users/${currentUid}/friends`));
  const friendUids = friendsSnap.docs.map(d => d.id);

  const friends = others.filter(l => friendUids.includes(l.uid));
  const rest = others.filter(l => !friendUids.includes(l.uid));
  const toShow = [...friends, ...rest].slice(0, 2);

  const userData = await Promise.all(toShow.map(p => getUserCached(p.uid)));
  return {
    usernames: userData.map(d => d?.username || d?.displayname || 'usuário'),
    fotos: userData.map(d => d?.userphoto || DEFAULT_AVATAR),
    total
  };
}

async function updateLikedByFooter(postEl, postId) {
  const user = auth.currentUser;
  if (!user) return;
  const footer = postEl.querySelector('.post-liked-by');
  const footerBox = postEl.querySelector('.post-footer-box');
  if (!footer) return;

  const info = await getLikedByInfo(postId, user.uid);
  if (info.total === 0) {
    if (footerBox) footerBox.style.display = 'none';
    footer.innerHTML = '';
    footer.style.visibility = 'hidden';
    return;
  }

  const fotosHTML = info.fotos.length
    ? `<div style="display:flex;margin-right:4px;">${info.fotos.map((f, i) =>
        `<img src="${f}" alt="Avatar" style="width:20px;height:20px;border-radius:50%;object-fit:cover;${i > 0 ? 'margin-left:-6px;' : ''}">`
      ).join('')}</div>`
    : '';

  let text = '<span>Curtido por ';
  if (info.usernames.length === 1) text += `<strong>${info.usernames[0]}</strong>`;
  else if (info.usernames.length >= 2) text += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
  const outros = info.total - info.usernames.length;
  if (outros === 1) text += ` e outra <strong>1 pessoa</strong>`;
  else if (outros > 1) text += ` e outras <strong>${outros} pessoas</strong>`;
  text += '</span>';

  footer.style.cssText = 'display:flex;align-items:center;gap:8px;visibility:visible;';
  footer.innerHTML = fotosHTML + text;
  if (footerBox) footerBox.style.display = 'flex';
}


// ─── LIKES ───────────────────────────────────────────────────

async function countLikes(postId) {
  const snap = await getDocs(query(collection(db, `posts/${postId}/likers`), where('like', '==', true)));
  return snap.size;
}

async function countComments(postId) {
  return (await getDocs(collection(db, `posts/${postId}/coments`))).size;
}

async function toggleLike(uid, postId, btn) {
  const ref = doc(db, `posts/${postId}/likers/${uid}`);
  try {
    const snap = await getDoc(ref);
    const span = btn.querySelector('span');
    const count = parseInt(span.textContent) || 0;
    const liked = snap.exists() && snap.data().like === true;

    if (liked) {
      await updateDoc(ref, { like: false, timestamp: Date.now() });
      btn.classList.remove('liked');
      span.textContent = Math.max(0, count - 1);
    } else {
      const op = snap.exists() ? updateDoc : setDoc;
      await op(ref, { uid, like: true, timestamp: Date.now() });
      btn.classList.add('liked');
      span.textContent = count + 1;
    }
    updateLikedByFooter(btn.closest('.post-card'), postId);
  } catch (err) {
    console.error('Erro ao curtir/descurtir:', err);
  }
}


// ─── COMENTÁRIOS ─────────────────────────────────────────────

async function fetchComments(postId) {
  try {
    const snap = await getDocs(query(collection(db, 'posts', postId, 'coments'), orderBy('create', 'desc')));
    return await Promise.all(snap.docs.map(async d => ({
      id: d.id,
      userData: await getUserCached(d.data().senderid),
      ...d.data()
    })));
  } catch { return []; }
}

function renderCommentsList(comments, container) {
  if (comments.length === 0) {
    container.innerHTML = '<div class="no-comments"><div class="no-comments-title">Ainda não há nenhum comentario</div><div class="no-comments-sub">Inicie a conversa</div></div>';
    return;
  }
  container.innerHTML = comments.map(c => {
    const name = c.userData?.displayname || c.userData?.username || c.senderid;
    const username = c.userData?.username ? `${c.userData.username}` : '';
    const photo = resolvePhoto(c.userData?.userphoto);
    const verified = c.userData?.verified
      ? '<i class="fas fa-check-circle" style="margin-left:4px;font-size:0.85em;color:var(--verified-blue)"></i>'
      : '';
    return `
      <div class="comentario-item">
        <div class="comentario-header">
          <img src="${photo}" alt="Avatar" class="comentario-avatar" onerror="this.src='./src/img/default.jpg'">
          <div class="comentario-meta">
            <strong class="comentario-nome" data-username="${c.senderid}">${username}${verified}</strong>
            <small class="comentario-data">${formatRelativeDate(c.create)}</small>
          </div>
        </div>
        <div class="comentario-conteudo">${formatText(c.content)}</div>
      </div>`;
  }).join('');
}

async function renderComments(postId, container) {
  const cached = getCommentsCache(postId);
  if (cached) {
    renderCommentsList(cached, container);
    if (isCommentsCacheExpired(postId)) {
      fetchComments(postId).then(fresh => {
        setCommentsCache(postId, fresh);
        renderCommentsList(fresh, container);
      }).catch(() => {});
    }
    return;
  }
  container.innerHTML = '<p class="no-comments" style="opacity:0.5">Carregando comentários...</p>';
  const comments = await fetchComments(postId);
  setCommentsCache(postId, comments);
  renderCommentsList(comments, container);
}

async function addComment(postId, content) {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    await setDoc(doc(db, 'posts', postId, 'coments', uid('comentid')), {
      content,
      create: serverTimestamp(),
      senderid: user.uid,
      report: 0
    });
    return true;
  } catch { return false; }
}


// ─── MÍDIA DO POST ───────────────────────────────────────────

function buildMediaHTML(postData) {
  const imgs = Array.isArray(postData.imgs) && postData.imgs.length > 0
    ? postData.imgs
    : (postData.img?.trim() ? [postData.img] : []);
  if (!imgs.length) return '';

  if (imgs.length === 1) {
    return `<div class="post-image"><img src="${imgs[0]}" loading="lazy" decoding="async" style="width:100%;height:auto;display:block;"></div>`;
  }

  const slides = imgs.map(url => `<div class="post-carousel-slide"><img src="${url}" loading="lazy" decoding="async" alt=""></div>`).join('');
  const dots = imgs.map((_, i) => `<div class="post-carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></div>`).join('');
  return `
    <div class="post-carousel" data-total="${imgs.length}">
      <div class="post-carousel-track">${slides}</div>
    </div>
    <div class="post-carousel-dots">${dots}</div>`;
}

function postTypeIcon(postData) {
  if (postData.img?.trim()) {
    return `<svg width="340" height="340" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#filter0_d_4_100)"><rect x="18.7275" y="114.119" width="214.8" height="166.2" transform="rotate(-4 18.7275 114.119)" fill="#D9D9D9"/><rect x="18.7275" y="114.119" width="214.8" height="166.2" transform="rotate(-4 18.7275 114.119)" stroke="#4E4E4E" stroke-width="2.4"/></g><rect x="40.2495" y="129.455" width="174" height="132.6" transform="rotate(-4 40.2495 129.455)" fill="#676868"/><g filter="url(#filter1_d_4_100)"><rect x="96.1274" y="75.7188" width="214.8" height="166.2" transform="rotate(-4 96.1274 75.7188)" fill="#D9D9D9"/><rect x="96.1274" y="75.7188" width="214.8" height="166.2" transform="rotate(-4 96.1274 75.7188)" stroke="#4E4E4E" stroke-width="2.4"/></g><rect x="117.649" y="91.0548" width="174" height="132.6" transform="rotate(-4 117.649 91.0548)" fill="#B1B8C2"/><path fill-rule="evenodd" clip-rule="evenodd" d="M227.22 109.343C228.615 109.245 230.011 109.148 231.406 109.05C232.907 109.522 234.452 109.901 236.044 110.187C237.469 109.803 238.792 109.223 240.013 108.448C241.719 108.329 243.425 108.21 245.13 108.09C246.475 108.518 247.829 108.951 249.195 109.39C250.28 110.41 251.143 111.609 251.784 112.984C252.524 113.542 253.334 113.973 254.212 114.276C256.2 116.248 257.762 118.534 258.899 121.134C261.731 123.703 263.245 126.967 263.44 130.926C263.976 132.365 264.693 133.695 265.589 134.917C265.651 135.237 265.712 135.558 265.773 135.878C265.264 138.541 265.025 141.237 265.053 143.967C264.989 144.793 264.73 145.542 264.275 146.214C264.141 146.856 264.222 147.46 264.519 148.024C263.857 150.004 263.336 152.03 262.957 154.101C262.555 154.936 262.147 155.777 261.731 156.623C261.312 157.069 260.831 157.428 260.287 157.698C260.16 158.798 259.924 159.87 259.577 160.914C258.641 161.992 257.662 163.035 256.64 164.043C256.821 164.833 256.955 165.635 257.042 166.451C256.466 167.098 255.93 167.784 255.433 168.512C255.55 168.789 255.722 169.021 255.949 169.207C258.469 170.167 260.564 171.725 262.236 173.882C262.514 175.62 262.982 177.292 263.639 178.9C266.878 180.466 270.173 181.901 273.524 183.202C278.909 184.819 284.185 186.723 289.35 188.916C290.617 190.141 291.613 191.573 292.339 193.214C294.39 199.156 295.866 205.224 296.767 211.417C296.779 211.579 296.79 211.74 296.801 211.902C260.359 214.45 223.917 216.999 187.475 219.547C187.379 218.173 187.283 216.8 187.187 215.426C187.425 212.028 187.692 208.599 187.987 205.139C188.411 202.009 189.377 199.1 190.883 196.411C191.508 195.67 192.202 195.013 192.966 194.438C200.894 189.813 208.922 185.395 217.05 181.183C217.416 180.788 217.737 180.36 218.012 179.898C218.37 177.911 218.777 175.934 219.233 173.966C220.569 172.496 222.079 171.254 223.764 170.239C223.119 169.508 222.343 168.994 221.436 168.697C221.163 167.9 221.308 167.2 221.873 166.596C220.965 165.771 219.947 165.152 218.822 164.739C218.728 164.437 218.592 164.162 218.413 163.915C218.356 162.828 218.318 161.734 218.301 160.634C216.312 158.755 214.382 156.778 212.51 154.706C212.069 153.772 211.963 152.805 212.19 151.805C211.25 148.747 210.334 145.685 209.444 142.618C209.437 142.07 209.516 141.537 209.683 141.018C210.692 139.697 211.288 138.194 211.471 136.509C211.036 131.952 212.071 127.819 214.578 124.112C214.995 122.877 215.375 121.633 215.72 120.378C216.815 119.107 218.021 117.967 219.337 116.958C220.236 115.595 220.912 114.127 221.367 112.554C223.3 111.406 225.251 110.336 227.22 109.343Z" fill="#767D87"/><defs><filter id="filter0_d_4_100" x="15.0468" y="97.8543" width="233.232" height="188.14" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2.4"/><feGaussianBlur stdDeviation="1.2"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_100"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_100" result="shape"/></filter><filter id="filter1_d_4_100" x="92.4467" y="59.4543" width="233.232" height="188.14" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="2.4"/><feGaussianBlur stdDeviation="1.2"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_100"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_100" result="shape"/></filter></defs></svg>`;
  }
  return `<svg width="340" height="340" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#filter0_d_4_124)"><path d="M65.96 230.28C58.8024 230.28 53 224.478 53 217.32L53 90.9601C53 83.8025 58.8024 78 65.96 78L274.94 78C282.098 78 287.9 83.8024 287.9 90.96L287.9 217.32C287.9 224.478 282.098 230.28 274.94 230.28H162.016C159.335 230.28 156.72 231.112 154.531 232.66L98.8916 272.024C98.5379 272.274 98.2075 272.556 97.9045 272.865C92.7975 278.083 84.0626 273.262 85.7558 266.16L92.8826 236.267C93.6108 233.213 91.295 230.28 88.1551 230.28H65.96Z" fill="#D9D9D9"/><path d="M65.96 230.28C58.8024 230.28 53 224.478 53 217.32L53 90.9601C53 83.8025 58.8024 78 65.96 78L274.94 78C282.098 78 287.9 83.8024 287.9 90.96L287.9 217.32C287.9 224.478 282.098 230.28 274.94 230.28H162.016C159.335 230.28 156.72 231.112 154.531 232.66L98.8916 272.024C98.5379 272.274 98.2075 272.556 97.9045 272.865C92.7975 278.083 84.0626 273.262 85.7558 266.16L92.8826 236.267C93.6108 233.213 91.295 230.28 88.1551 230.28H65.96Z" stroke="#4E4E4E" stroke-width="3.24"/></g><rect x="80.5405" y="116.07" width="12.96" height="179.01" rx="1.62" transform="rotate(-90 80.5405 116.07)" fill="#B7B7B7"/><rect x="80.5405" y="116.07" width="12.96" height="179.01" rx="1.62" transform="rotate(-90 80.5405 116.07)" fill="#B7B7B7"/><rect x="80.5405" y="142.8" width="12.96" height="129.6" rx="1.62" transform="rotate(-90 80.5405 142.8)" fill="#B7B7B7"/><rect x="80.5405" y="169.53" width="12.96" height="162.81" rx="1.62" transform="rotate(-90 80.5405 169.53)" fill="#B7B7B7"/><rect x="80.5405" y="196.26" width="12.96" height="75.33" rx="1.62" transform="rotate(-90 80.5405 196.26)" fill="#B7B7B7"/><defs><filter id="filter0_d_4_124" x="48.1399" y="76.3801" width="244.62" height="206.789" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="3.24"/><feGaussianBlur stdDeviation="1.62"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_4_124"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow_4_124" result="shape"/></filter></defs></svg>`;
}


// ─── CARROSSEL ───────────────────────────────────────────────

function initCarousel(postEl) {
  const carousel = postEl.querySelector('.post-carousel');
  if (!carousel) return;

  const track = carousel.querySelector('.post-carousel-track');
  const total = parseInt(carousel.dataset.total, 10);
  const dots = postEl.querySelectorAll('.post-carousel-dot');
  let current = 0, startX = 0, movedX = 0, dragging = false;

  const goTo = (i) => {
    if (i < 0 || i >= total) return;
    current = i;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, j) => d.classList.toggle('active', j === current));
  };

  const onDragEnd = () => {
    if (!dragging) return;
    dragging = false;
    track.style.transition = '';
    const thr = carousel.offsetWidth * 0.2;
    goTo(movedX < -thr ? current + 1 : movedX > thr ? current - 1 : current);
    movedX = 0;
  };

  carousel.addEventListener('touchstart', e => { startX = e.touches[0].clientX; movedX = 0; dragging = true; track.style.transition = 'none'; }, { passive: true });
  carousel.addEventListener('touchmove', e => { if (!dragging) return; movedX = e.touches[0].clientX - startX; track.style.transform = `translateX(calc(-${current * 100}% + ${movedX}px))`; }, { passive: true });
  carousel.addEventListener('touchend', onDragEnd);

  carousel.addEventListener('mousedown', e => { startX = e.clientX; movedX = 0; dragging = true; track.style.transition = 'none'; e.preventDefault(); });
  window.addEventListener('mousemove', e => { if (!dragging) return; movedX = e.clientX - startX; track.style.transform = `translateX(calc(-${current * 100}% + ${movedX}px))`; });
  window.addEventListener('mouseup', onDragEnd);

  dots.forEach(d => d.addEventListener('click', () => { track.style.transition = ''; goTo(parseInt(d.dataset.index, 10)); }));

  carousel.addEventListener('dblclick', (e) => {
    e.preventDefault();
    animateHeartLike(carousel, e);
    postEl.querySelector('.btn-like')?.click();
  });
}


// ─── SISTEMA DE MÚSICA ───────────────────────────────────────

async function fetchMusicTitle(url) {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    return res.ok ? (await res.json()).title || null : null;
  } catch { return null; }
}

function buildMusicIframe(postEl, musicUrl) {
  if (!musicUrl) return;
  let embedUrl = musicUrl;
  try {
    const u = new URL(musicUrl);
    if (u.hostname.includes('youtube') || u.hostname.includes('youtu.be')) {
      const videoId = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      if (videoId) embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&mute=1&loop=1&playlist=${videoId}&enablejsapi=1&controls=0`;
    }
  } catch {}

  const iframe = document.createElement('iframe');
  iframe.className = 'post-music-iframe';
  iframe.src = embedUrl;
  iframe.allow = 'autoplay; encrypted-media';
  iframe.setAttribute('allowfullscreen', '');
  iframe.dataset.musicUrl = musicUrl;
  iframe.dataset.muted = 'false';
  postEl.appendChild(iframe);
}

const ytCmd = (iframe, func, args = []) => {
  try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch {}
};

function setMusicIcon(postEl, playing, muted) {
  const icon = postEl.querySelector('.post-music-icon');
  if (!icon) return;
  icon.innerHTML = !playing
    ? '<i class="fas fa-music"></i>'
    : muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
}

function playMusicPost(postEl) {
  if (currentMusicPost && currentMusicPost !== postEl) pauseMusicPost(currentMusicPost);
  const iframe = postEl.querySelector('.post-music-iframe');
  if (!iframe) return;
  currentMusicPost = postEl;
  ytCmd(iframe, 'playVideo');
  ytCmd(iframe, 'mute');
  iframe.dataset.muted = 'true';
  postEl.classList.add('post-music-playing');
  postEl.classList.remove('post-music-muted');
  setMusicIcon(postEl, true, true);
}

function pauseMusicPost(postEl) {
  const iframe = postEl.querySelector('.post-music-iframe');
  if (iframe) { ytCmd(iframe, 'pauseVideo'); ytCmd(iframe, 'mute'); iframe.dataset.muted = 'true'; }
  postEl.classList.remove('post-music-playing', 'post-music-unmuted');
  postEl.classList.add('post-music-muted');
  setMusicIcon(postEl, false, true);
  if (currentMusicPost === postEl) currentMusicPost = null;
}

function toggleMute(postEl) {
  const iframe = postEl.querySelector('.post-music-iframe');
  if (!iframe) return;
  const muted = iframe.dataset.muted === 'true';
  if (muted) {
    ytCmd(iframe, 'unMute');
    ytCmd(iframe, 'setVolume', [80]);
    iframe.dataset.muted = 'false';
    postEl.classList.add('post-music-unmuted');
    postEl.classList.remove('post-music-muted');
    setMusicIcon(postEl, true, false);
  } else {
    ytCmd(iframe, 'mute');
    iframe.dataset.muted = 'true';
    postEl.classList.remove('post-music-unmuted');
    postEl.classList.add('post-music-muted');
    setMusicIcon(postEl, true, true);
  }
}

function initMusicBanner(postEl, musicUrl) {
  const dateEl = postEl.querySelector('.post-music-date');
  const titleEl = postEl.querySelector('.post-music-title');
  const metaDate = postEl.querySelector('.post-music-meta-date');
  const metaTitle = postEl.querySelector('.post-music-meta-title');

  fetchMusicTitle(musicUrl).then(title => {
    const t = title || '♪ Música';
    if (titleEl) titleEl.textContent = t;
    if (metaTitle) metaTitle.textContent = t;
  });

  dateEl?.classList.add('visible');
  metaDate?.classList.add('visible');
  let showing = 'data';

  postEl._musicBannerTimer = setInterval(() => {
    if (showing === 'data') {
      dateEl?.classList.remove('visible'); titleEl?.classList.add('visible');
      metaDate?.classList.remove('visible'); metaTitle?.classList.add('visible');
      showing = 'titulo';
    } else {
      titleEl?.classList.remove('visible'); dateEl?.classList.add('visible');
      metaTitle?.classList.remove('visible'); metaDate?.classList.add('visible');
      showing = 'data';
    }
  }, 5000);
}

function observeMusicPost(postEl) {
  if (!musicObserver) {
    musicObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) playMusicPost(e.target);
        else if (!e.isIntersecting && currentMusicPost === e.target) pauseMusicPost(e.target);
      });
    }, { threshold: [0, 0.6] });
  }
  musicObserver.observe(postEl);
}


// ─── RENDER POST ─────────────────────────────────────────────

function renderPost(postData, container) {
  if (postData.visible === false) return;

  const hasMusic = !!(postData.musicUrl?.trim());
  const rawMedia = buildMediaHTML(postData);
  const musicBtn = hasMusic ? `
    <button class="post-music-btn" title="Alternar som" type="button">
      <span class="post-music-icon"><i class="fas fa-volume-mute"></i></span>
      <div class="post-music-info">
        <span class="post-music-date visible">${formatRelativeDate(postData.create)}</span>
        <span class="post-music-title"></span>
      </div>
    </button>` : '';

  const mediaHTML = hasMusic && rawMedia
    ? `<div class="post-media-wrapper">${rawMedia}${musicBtn}</div>`
    : rawMedia;

  const sugeridoPorHTML = postData._feedTipo === 'amigoDosAmigos' && postData._sugeridoPor
    ? `<p class="post-sugerido-por"><i class="fas fa-user-friends"></i> Sugerido por <strong>@${postData._sugeridoPor}</strong></p>`
    : '';

  const postEl = document.createElement('div');
  postEl.className = 'post-card';
  postEl.dataset.postId = postData.postid;
  if (hasMusic) postEl.dataset.hasMusic = '1';

  postEl.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="${DEFAULT_AVATAR}" alt="Avatar do usuário" class="avatar" onerror="this.src='./src/img/default.jpg'">
        <div class="user-meta">
          <strong class="user-name-link" data-username="${postData.creatorid}"></strong>
          <small class="post-date-mobile">${formatRelativeDate(postData.create)}</small>
          ${hasMusic ? `<div class="post-music-meta">
            <span class="post-music-meta-date">${formatRelativeDate(postData.create)}</span>
            <span class="post-music-meta-title"></span>
          </div>` : ''}
        </div>
      </div>
      <div class="left-space-options">
        <div class="post-icon">${postTypeIcon(postData)}</div>
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
            <p>Comentar</p>
            <span>${postData.comentarios || 0}</span>
          </button>
        </div>
      </div>
      <div class="post-footer-infos">
        <div class="post-footer-box">
          <div class="post-footer-label">
            <svg class="liked-by-svg" xmlns="http://www.w3.org/2000/svg" shape-rendering="geometricPrecision" text-rendering="geometricPrecision" image-rendering="optimizeQuality" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 512 456.549"><path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/></svg>
            <p class="post-liked-by" style="min-height:28px;visibility:hidden;"></p>
            ${sugeridoPorHTML}
          </div>
        </div>
      </div>
    </div>`;

  container.appendChild(postEl);
  initCarousel(postEl);

  if (hasMusic) {
    buildMusicIframe(postEl, postData.musicUrl);
    observeMusicPost(postEl);
    initMusicBanner(postEl, postData.musicUrl);
    postEl.querySelectorAll('.post-image, .post-carousel, .post-text').forEach(el => {
      el.addEventListener('click', (e) => { if (!e.defaultPrevented) toggleMute(postEl); });
    });
    postEl.querySelector('.post-music-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMute(postEl);
    });
  }

  const user = auth.currentUser;
  if (user) {
    updateLikedByFooter(postEl, postData.postid);
    const likerRef = doc(db, `posts/${postData.postid}/likers/${user.uid}`);
    getDoc(likerRef).then(s => {
      if (s.exists() && s.data().like === true) postEl.querySelector('.btn-like')?.classList.add('liked');
    });
  }

  getUserCached(postData.creatorid).then(userData => {
    if (!userData) return;
    const avatar = postEl.querySelector('.avatar');
    const nameEl = postEl.querySelector('.user-name-link');
    if (avatar) avatar.src = userData.userphoto || DEFAULT_AVATAR;
    if (nameEl) {
      nameEl.textContent = userData.username || userData.displayname || userData.name || '...';
      if (userData.verified) {
        nameEl.innerHTML += ' <i class="fas fa-check-circle" style="margin-left:2px;font-size:0.8em;color:#4A90E2;"></i>';
      }
    }
  });

  countLikes(postData.postid).then(n => {
    const span = postEl.querySelector('.btn-like span');
    if (span) span.textContent = n;
  }).catch(() => {});

  countComments(postData.postid).then(n => {
    const span = postEl.querySelector('.btn-comment span');
    if (span) span.textContent = n;
  }).catch(() => {});
}


// ─── FEED / CARREGAMENTO ─────────────────────────────────────

async function fetchFriends(uid) {
  try {
    return (await getDocs(collection(db, `users/${uid}/friends`))).docs.map(d => d.id);
  } catch { return []; }
}

async function fetchFriendsOfFriends(uid, friendUids) {
  const map = new Map();
  await Promise.all(friendUids.slice(0, 20).map(async fUid => {
    try {
      const [snap, userData] = await Promise.all([
        getDocs(collection(db, `users/${fUid}/friends`)),
        getUserCached(fUid)
      ]);
      const username = userData?.username || fUid;
      snap.docs.forEach(d => {
        if (d.id !== uid && !friendUids.includes(d.id) && !map.has(d.id)) {
          map.set(d.id, username);
        }
      });
    } catch {}
  }));
  return map;
}

function buildChronologicalFeed(uid, posts, friendUids, fofMap) {
  const buckets = { friends: [], fof: [], discover: [] };

  for (const post of posts) {
    if (!post || post.visible === false) continue;
    const cid = post.creatorid;
    if (cid === uid || friendUids.includes(cid)) {
      buckets.friends.push({ ...post, _feedTipo: 'amigo' });
    } else if (fofMap.has(cid)) {
      buckets.fof.push({ ...post, _feedTipo: 'amigoDosAmigos', _sugeridoPor: fofMap.get(cid) });
    } else {
      buckets.discover.push({ ...post, _feedTipo: 'descoberta' });
    }
  }

  sortChronological(buckets.friends);
  sortChronological(buckets.fof);
  sortChronological(buckets.discover);

  const result = [];
  let iF = 0, iFF = 0, iD = 0;
  const total = posts.filter(p => p?.visible !== false).length;

  while (result.length < total) {
    const batch = [];
    for (let i = 0; i < 6 && iF < buckets.friends.length; i++, iF++) batch.push(buckets.friends[iF]);
    for (let i = 0; i < 3 && iFF < buckets.fof.length; i++, iFF++) batch.push(buckets.fof[iFF]);
    for (let i = 0; i < 1 && iD < buckets.discover.length; i++, iD++) batch.push(buckets.discover[iD]);
    if (!batch.length) break;
    sortChronological(batch);
    result.push(...batch);
  }

  return result;
}

async function loadPosts() {
  if (loading || !hasMorePosts) return;
  loading = true;

  const isFirst = !feed.children.length;

  if (isFirst) {
    const cached = getPostsCache();
    if (cached) {
      allItems = sortChronological([...cached]);
      allItems.forEach(p => renderPost(p, feed));
    }
  }

  let indicator = document.getElementById('scroll-loading-indicator');
  if (!isFirst && !indicator) {
    indicator = document.createElement('div');
    indicator.id = 'scroll-loading-indicator';
    indicator.style.cssText = 'text-align:center;padding:20px;color:#888;font-size:14px;';
    indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando mais...';
    feed.appendChild(indicator);
  }

  if (loadMoreBtn) {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = isFirst ? 'Carregando...' : 'Carregando mais...';
  }

  try {
    let user = auth.currentUser;
    if (!user) {
      user = await new Promise(resolve => {
        const unsub = onAuthStateChanged(auth, u => { unsub(); resolve(u); });
      });
    }
    if (!user) { loading = false; return; }

    const currentUid = user.uid;
    const baseQuery = [collection(db, 'posts'), orderBy('create', 'desc'), limit(POSTS_LIMIT)];
    const postsQuery = lastPostSnapshot
      ? query(...baseQuery.slice(0, -1), startAfter(lastPostSnapshot), limit(POSTS_LIMIT))
      : query(...baseQuery);

    const [postsSnap, friendUids] = await Promise.all([
      getDocs(postsQuery),
      isFirst || !lastPostSnapshot ? fetchFriends(currentUid) : Promise.resolve([])
    ]);

    if (postsSnap.empty) {
      hasMorePosts = false;
      if (loadMoreBtn) { loadMoreBtn.textContent = 'Não há mais posts'; loadMoreBtn.disabled = true; }
      indicator?.remove();
      loading = false;
      return;
    }

    lastPostSnapshot = postsSnap.docs.at(-1);
    const rawPosts = postsSnap.docs.map(d => ({ ...d.data(), postid: d.id, tipo: 'post' }));

    const fofMap = friendUids.length ? await fetchFriendsOfFriends(currentUid, friendUids) : new Map();
    const ordered = buildChronologicalFeed(currentUid, rawPosts, friendUids, fofMap);

    if (isFirst) {
      setPostsCache(ordered);
      allItems = sortChronological([...ordered]);
      feed.innerHTML = '';
      allItems.forEach(p => renderPost(p, feed));
      startSync();
    } else {
      const existingCache = getPostsCache() ?? [];
      setPostsCache(sortChronological([...existingCache, ...ordered]));
      ordered.forEach(p => renderPost(p, feed));
    }

    const done = postsSnap.size < POSTS_LIMIT;
    hasMorePosts = !done;
    if (loadMoreBtn) {
      loadMoreBtn.textContent = done ? 'Não há mais posts' : 'Carregar mais';
      loadMoreBtn.disabled = done;
    }

  } catch (err) {
    console.error('Erro ao carregar posts:', err);
    if (loadMoreBtn) loadMoreBtn.textContent = 'Erro ao carregar';
    document.getElementById('scroll-loading-indicator')?.remove();
  }

  indicator?.remove();
  loading = false;
}

function resetFeed() {
  feed.innerHTML = '';
  lastPostSnapshot = null;
  hasMorePosts = true;
  loading = false;
  clearPostsCache();
}


// ─── UPLOAD DE IMAGEM ────────────────────────────────────────

function compressImage(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ({ target }) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) { height = (height * maxWidth) / width; width = maxWidth; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() })), 'image/jpeg', quality);
      };
      img.src = target.result;
    };
    reader.readAsDataURL(file);
  });
}

const fileToBase64 = (file) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(file);
});

async function uploadImage(file, userId) {
  try {
    if (!file) throw new Error('Nenhum arquivo selecionado.');
    if (!IMGBB_TYPES.includes(file.type)) throw new Error('Tipo de arquivo não suportado.');
    if (file.size > IMGBB_MAX_SIZE) throw new Error('Arquivo muito grande. Máximo 32MB.');

    const toUpload = file.type !== 'image/gif' && file.size > 2 * 1024 * 1024
      ? await compressImage(file)
      : file;

    const base64 = (await fileToBase64(toUpload)).split(',')[1];
    const form = new FormData();
    form.append('image', base64);
    form.append('name', `post_${userId}_${Date.now()}`);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('Erro na conexão com o ImgBB');

    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Erro ao fazer upload');

    return { success: true, url: data.data.url, deleteUrl: data.data.delete_url };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function uploadWithRetry(file, userId, tries = 3) {
  for (let t = 0; t < tries; t++) {
    if (t > 0) await sleep(1000 * t);
    const res = await uploadImage(file, userId);
    if (res.success) return res;
  }
  return { success: false, error: 'Falhou após várias tentativas' };
}


// ─── ENVIO DE POST ───────────────────────────────────────────

function createProgressBar() {
  if (!document.getElementById('plb-style')) {
    const s = document.createElement('style');
    s.id = 'plb-style';
    s.textContent = `#post-loading-bar{position:fixed;bottom:80px;left:0;width:100%;height:3px;background:var(--bg-primary);z-index:99997}#post-loading-bar .plb-inner{height:100%;width:0%;background:linear-gradient(90deg,#4A90E2,#4A90E2);transition:width 0.4s ease}`;
    document.head.appendChild(s);
  }
  document.getElementById('post-loading-bar')?.remove();
  const bar = document.createElement('div');
  bar.id = 'post-loading-bar';
  bar.innerHTML = '<div class="plb-inner"></div>';
  document.body.appendChild(bar);
  return bar;
}

const advanceBar = (bar, pct) => { const el = bar?.querySelector('.plb-inner'); if (el) el.style.width = pct + '%'; };
const removeBar = (bar) => { if (!bar) return; advanceBar(bar, 100); setTimeout(() => bar.remove(), 400); };

async function submitPost(user, text, imageFiles) {
  const files = Array.isArray(imageFiles) ? imageFiles.filter(Boolean) : (imageFiles ? [imageFiles] : []);
  if (!text && !files.length) { alert('Escreva algo ou adicione uma imagem!'); return; }

  document.getElementById('postLayer')?.classList.remove('active');
  document.getElementById('feedPage')?.classList.remove('closed');
  document.body.style.overflow = '';
  clearPostInputs();

  const bar = createProgressBar();
  advanceBar(bar, 10);

  try {
    const postId = uid('post');
    const urls = [], deleteUrls = [];

    if (files.length) {
      const step = 50 / files.length;
      for (let i = 0; i < files.length; i++) {
        advanceBar(bar, 10 + step * i);
        if (i > 0) await sleep(800);
        const res = await uploadWithRetry(files[i], user.uid);
        if (!res.success) { removeBar(bar); alert('Erro no upload: ' + res.error); return; }
        urls.push(res.url);
        deleteUrls.push(res.deleteUrl);
      }
      advanceBar(bar, 70);
    } else {
      advanceBar(bar, 60);
    }

    const locationInput = document.getElementById('add-location');
    const location = locationInput?.value.trim() ?? '';
    if (locationInput) locationInput.value = '';

    const postData = {
      content: text,
      img: urls.length === 1 ? urls[0] : '',
      imgs: urls.length > 1 ? urls : [],
      imgDeleteUrl: deleteUrls.length === 1 ? deleteUrls[0] : '',
      imgDeleteUrls: deleteUrls.length > 1 ? deleteUrls : [],
      likes: 0, saves: 0, comentarios: 0,
      postid: postId,
      creatorid: user.uid,
      reports: 0,
      visible: true,
      create: serverTimestamp(),
      musicUrl: typeof selectedMusic !== 'undefined' && selectedMusic ? selectedMusic.url : ''
    };
    if (location) postData.location = location;

    advanceBar(bar, 85);
    await Promise.all([
      setDoc(doc(db, 'posts', postId), postData),
      setDoc(doc(db, 'users', user.uid, 'posts', postId), postData)
    ]);
    triggerNovoPost(postId).catch(console.warn);

    advanceBar(bar, 100);
    setTimeout(() => removeBar(bar), 400);

    resetFeed();
    await loadPosts();

  } catch (err) {
    console.error('Erro ao enviar post:', err);
    removeBar(bar);
    alert('Erro ao enviar post: ' + err.message);
  }
}

async function handleSendPost() {
  const user = auth.currentUser;
  if (!user) return;
  const activeContent = document.querySelector('.post-content-type.active');
  const textarea = activeContent?.querySelector('.np-text-input') ?? document.querySelector('.np-text-input');
  await submitPost(user, textarea?.value.trim() ?? '', postImageFiles);
}


// ─── LOADING OVERLAY ─────────────────────────────────────────

function showLoading(msg) {
  if (!document.getElementById('plb-loading-style')) {
    const s = document.createElement('style');
    s.id = 'plb-loading-style';
    s.textContent = `.loading-overlay{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7);z-index:99999;display:flex;align-items:center;justify-content:center}.loading-content{text-align:center;color:#fff}.spinner{width:40px;height:40px;border:4px solid rgba(255,255,255,.3);border-top:4px solid #fff;border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 15px}@keyframes spin{to{transform:rotate(360deg)}}`;
    document.head.appendChild(s);
  }
  const el = document.createElement('div');
  el.className = 'loading-overlay';
  el.id = 'loadingOverlay';
  el.innerHTML = `<div class="loading-content"><div class="spinner"></div><p class="loading-text">${msg}</p></div>`;
  document.body.appendChild(el);
}

const hideLoading = () => document.getElementById('loadingOverlay')?.remove();
const updateLoadingText = (msg) => {
  const el = document.getElementById('loadingOverlay')?.querySelector('.loading-text');
  if (el) el.textContent = msg;
};


// ─── COMENTÁRIOS MODAL ───────────────────────────────────────

async function openCommentsModal(postId, creatorId) {
  document.querySelector('.mobile-comments-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'mobile-comments-modal';
  modal.innerHTML = `
    <div class="mobile-comments-content">
      <div class="modal-comments-header">
        <div class="modal-grab"></div>
        <div class="modal-info"><h3>Comentários</h3></div>
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
  const scrollY = window.scrollY;
  Object.assign(document.body.style, { overflow: 'hidden', position: 'fixed', width: '100%', top: `-${scrollY}px` });
  requestAnimationFrame(() => modal.classList.add('active'));

  modal.addEventListener('click', (e) => { if (e.target === modal) closeCommentsModal(); });

  const content = modal.querySelector('.mobile-comments-content');
  const grab = modal.querySelector('.modal-grab');
  const header = modal.querySelector('.modal-comments-header');
  let startY = 0, curY = 0, dragging = false;

  const onStart = (e) => { startY = e.touches[0].clientY; dragging = true; content.style.transition = 'none'; };
  const onMove = (e) => {
    if (!dragging) return;
    curY = e.touches[0].clientY;
    const dy = curY - startY;
    if (dy > 0) { content.style.transform = `translateY(${dy}px)`; modal.style.backgroundColor = `rgba(0,0,0,${Math.max(0, 1 - dy / 300) * 0.5})`; }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    content.style.transition = 'transform 0.3s cubic-bezier(0.4,0,0.2,1)';
    if (curY - startY > 150) closeCommentsModal();
    else { content.style.transform = 'translateY(0)'; modal.style.backgroundColor = 'rgba(0,0,0,0.5)'; }
  };

  [grab, header].forEach(el => {
    el.addEventListener('touchstart', onStart);
    el.addEventListener('touchmove', onMove);
    el.addEventListener('touchend', onEnd);
  });

  const list = modal.querySelector('.comments-list-mobile');
  await renderComments(postId, list);

  const submitComment = async (input) => {
    const text = input.value.trim();
    if (!text) return;
    const ok = await addComment(postId, text);
    if (ok) {
      triggerNovoComentario(postId, creatorId).catch(console.warn);
      input.value = '';
      invalidateCommentsCache(postId);
      await renderComments(postId, list);
      const btn = document.querySelector(`.btn-comment[data-id="${postId}"] span`);
      if (btn) btn.textContent = await countComments(postId);
    }
  };

  modal.querySelector('.comment-submit-mobile').addEventListener('click', () => submitComment(modal.querySelector('.comment-input-mobile')));
  modal.querySelector('.comment-input-mobile').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitComment(e.target); } });
}

function closeCommentsModal() {
  const modal = document.querySelector('.mobile-comments-modal');
  if (!modal) return;
  const content = modal.querySelector('.mobile-comments-content');
  content.style.transition = 'transform 0.3s ease';
  content.style.transform = 'translateY(100%)';
  modal.style.opacity = '0';
  setTimeout(() => {
    const scrollY = document.body.style.top;
    modal.remove();
    Object.assign(document.body.style, { position: '', top: '', width: '', overflow: '' });
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }, 300);
}

window.fecharModalComentarios = closeCommentsModal;


// ─── MENU BOTTOM ─────────────────────────────────────────────

function openBottomMenu(postId, ownerId, postElement = null) {
  const menu = document.querySelector('.menu-bottom-layer');
  const user = auth.currentUser;
  if (!menu || !user) return;
  currentMenuPost = { postId, ownerId, postElement };
  const isOwn = user.uid === ownerId;
  menu.querySelectorAll('.menu-bottom-btn').forEach(btn => {
    const a = btn.dataset.action;
    btn.style.display = a === 'delete' ? (isOwn ? 'block' : 'none') : a === 'report' ? (isOwn ? 'none' : 'block') : 'block';
  });
  menu.classList.add('active');
  document.body.classList.add('menu-bottom-open');
}

function closeBottomMenu() {
  const menu = document.querySelector('.menu-bottom-layer');
  if (!menu) return;
  menu.classList.add('closing');
  setTimeout(() => {
    menu.classList.remove('active', 'closing');
    document.body.classList.remove('menu-bottom-open');
    currentMenuPost = null;
  }, 300);
}

function setupBottomMenuListeners() {
  const menu = document.querySelector('.menu-bottom-layer');
  if (!menu) return;
  menu.addEventListener('click', async (e) => {
    if (e.target === menu) { closeBottomMenu(); return; }
    const btn = e.target.closest('.menu-bottom-btn');
    if (!btn || !currentMenuPost) return;
    const { postId, ownerId, postElement } = currentMenuPost;
    const action = btn.dataset.action;
    closeBottomMenu();
    if (action === 'delete') handleDeletePost(postId, ownerId, postElement);
    if (action === 'report') await handleReportPost(postId, ownerId);
  });
}

async function handleDeletePost(postId, ownerId, postElement) {
  const user = auth.currentUser;
  if (!user || user.uid !== ownerId || !postId) return;
  const el = postElement ?? document.querySelector(`.post-card[data-post-id="${postId}"]`);
  if (el) {
    Object.assign(el.style, { transition: 'opacity 0.3s ease,transform 0.3s ease', opacity: '0', transform: 'translateY(-16px)' });
    setTimeout(() => el.remove(), 300);
  }
  clearPostsCache();
  await Promise.all([
    deleteDoc(doc(db, 'posts', postId)),
    deleteDoc(doc(db, 'users', ownerId, 'posts', postId))
  ]).catch(console.error);
}

async function handleReportPost(postId, ownerId, reason = 'other') {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const reportId = `report_${Date.now()}`;
    await setDoc(doc(db, 'reports', reportId), {
      reportId, type: 'post', targetId: postId, targetOwnerId: ownerId,
      reportedBy: user.uid, reason, timestamp: serverTimestamp(), status: 'pending'
    });
    alert('Denúncia enviada com sucesso!');
  } catch (err) {
    console.error('Erro ao denunciar:', err);
    alert('Erro ao enviar denúncia');
  }
}


// ─── POST LAYER ──────────────────────────────────────────────

function setupPostLayer() {
  const layer = document.getElementById('postLayer');
  if (!layer) return;
  const feedPage = document.getElementById('feedPage');

  const open = (type = 'post') => {
    document.querySelectorAll('.post-type-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.post-content-type').forEach(c => c.classList.remove('active'));
    document.querySelector(`.post-type-tab[data-type="${type}"]`)?.classList.add('active');
    document.querySelector(`.post-content-type[data-type="${type}"]`)?.classList.add('active');

    const user = auth.currentUser;
    if (user) {
      getUserCached(user.uid).then(data => {
        const avatar = layer.querySelector('.np-avatar');
        const nameEl = layer.querySelector('.np-username');
        if (avatar && data?.userphoto) avatar.src = data.userphoto;
        if (nameEl) nameEl.textContent = data?.username || data?.displayname || '';
      });
    }

    layer.classList.add('active');
    feedPage?.classList.add('closed');
    document.body.style.overflow = 'hidden';
    setTimeout(() => layer.querySelector('.post-content-type.active .np-text-input')?.focus(), 150);
  };

  const close = () => {
    layer.classList.remove('active');
    feedPage?.classList.remove('closed');
    document.body.style.overflow = '';
    clearPostInputs();
    document.querySelector('.image-preview-container')?.remove();
  };

  document.getElementById('closeLayerBtn')?.addEventListener('click', close);
  layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && layer.classList.contains('active')) close(); });

  document.getElementById('openPostLayerNav')?.addEventListener('click', () => open('post'));
  document.getElementById('openPostLayer')?.addEventListener('click', () => open('post'));

  const sidebarBtn = document.querySelector('.sidebar .postmodal');
  if (sidebarBtn) {
    sidebarBtn.removeAttribute('onclick');
    sidebarBtn.addEventListener('click', (e) => { e.preventDefault(); open('post'); });
  }

  window.abrirPostModal = () => open('post');
  window.fecharPostModal = close;

  let fileInput = document.getElementById('post-layer-file-input');
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'post-layer-file-input';
    fileInput.accept = 'image/jpeg,image/png,image/gif,image/webp,image/bmp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }

  const applyPreview = (file) => {
    if (!file || !IMGBB_TYPES.includes(file.type)) return;
    addImageToCarousel(file);
  };

  document.getElementById('post-file-input')?.addEventListener('click', () => fileInput.click());

  const fileBox = document.getElementById('post-file-input')?.closest('.file-box') ?? document.getElementById('post-file-input');
  if (fileBox) {
    fileBox.addEventListener('dragover', (e) => { e.preventDefault(); fileBox.classList.add('drag-over'); });
    fileBox.addEventListener('dragleave', () => fileBox.classList.remove('drag-over'));
    fileBox.addEventListener('drop', (e) => { e.preventDefault(); fileBox.classList.remove('drag-over'); Array.from(e.dataTransfer.files).forEach(applyPreview); });
  }

  fileInput.addEventListener('change', (e) => { Array.from(e.target.files).forEach(applyPreview); fileInput.value = ''; });
}


// ─── IMAGEM INPUT LEGADO ─────────────────────────────────────

function setupImageInput() {
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
      if (file?.type.startsWith('image/')) showPreview(file);
    });
  }
  fileBtn.addEventListener('click', () => fileInput.click());
}

function showPreview(file) {
  const postArea = document.querySelector('.post-area');
  if (!postArea) return;
  postArea.nextElementSibling?.classList.contains('image-preview-container') && postArea.nextElementSibling.remove();

  const preview = document.createElement('div');
  preview.className = 'image-preview-container';
  preview.innerHTML = `<div class="image-preview-content"><img src="" alt="Preview"><button class="remove-image-btn" type="button"><i class="fas fa-times"></i></button></div>`;
  postArea.parentNode.insertBefore(preview, postArea.nextSibling);

  const img = preview.querySelector('img');
  const r = new FileReader();
  r.onload = (e) => { img.src = e.target.result; setTimeout(() => preview.classList.add('aberta'), 10); };
  r.readAsDataURL(file);

  preview.querySelector('.remove-image-btn').addEventListener('click', () => {
    const fi = document.getElementById('image-file-input');
    if (fi) fi.value = '';
    preview.classList.remove('aberta');
    setTimeout(() => preview.remove(), 300);
  });
}


// ─── CARROSSEL DE PREVIEW ────────────────────────────────────

function initPostTypeSystem() {
  document.querySelectorAll('.np-text-input').forEach(ta => {
    ta.addEventListener('input', () => {
      const counter = ta.parentElement?.querySelector('.char-counter');
      if (!counter) return;
      const max = parseInt(ta.getAttribute('maxlength'));
      counter.textContent = `${ta.value.length}/${max}`;
      counter.classList.toggle('limit', ta.value.length >= max * 0.9);
    });
  });

  document.getElementById('np-add-img')?.addEventListener('click', () => {
    if (postImageFiles.length >= MAX_IMAGES) { alert(`Máximo de ${MAX_IMAGES} imagens atingido.`); return; }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => Array.from(e.target.files).forEach(addImageToCarousel);
    input.click();
  });

  document.querySelector('.image-preview-carrosel')?.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.remove-image');
    if (!removeBtn) return;
    const index = parseInt(removeBtn.closest('.img-preview')?.dataset.index ?? '-1');
    if (index >= 0) { postImageFiles.splice(index, 1); renderCarouselPreviews(); }
  });

  document.getElementById('btn-post')?.addEventListener('click', async () => {
    const user = auth.currentUser;
    const text = document.querySelector('.np-text-input')?.value.trim() ?? '';
    await submitPost(user, text, postImageFiles);
  });
}

function addImageToCarousel(file) {
  if (!file?.type.startsWith('image/')) return;
  if (postImageFiles.length >= MAX_IMAGES) { alert(`Máximo de ${MAX_IMAGES} imagens atingido.`); return; }
  postImageFiles.push(file);
  renderCarouselPreviews();
}

function renderCarouselPreviews() {
  const carousel = document.querySelector('.image-preview-carrosel');
  if (!carousel) return;
  carousel.innerHTML = '';

  if (!postImageFiles.length) { carousel.classList.remove('visible'); return; }
  carousel.classList.add('visible');

  postImageFiles.forEach((file, i) => {
    const div = document.createElement('div');
    div.className = 'img-preview';
    div.dataset.index = i;
    div.innerHTML = `<img src="" alt="Preview ${i + 1}"><button class="remove-image" type="button"><i class="fas fa-times"></i></button>`;
    carousel.appendChild(div);
    const reader = new FileReader();
    reader.onload = (e) => { div.querySelector('img').src = e.target.result; };
    reader.readAsDataURL(file);
  });

  const addBtn = document.getElementById('np-add-img');
  if (addBtn) addBtn.textContent = postImageFiles.length >= MAX_IMAGES ? `Máximo atingido (${MAX_IMAGES})` : `Adicionar Imagem (${postImageFiles.length}/${MAX_IMAGES})`;
}

function clearPostInputs() {
  document.querySelectorAll('.np-text-input').forEach(input => {
    input.value = '';
    const counter = input.parentElement?.querySelector('.char-counter');
    if (counter) { counter.textContent = `0/${input.getAttribute('maxlength')}`; counter.classList.remove('limit'); }
  });
  postImageFiles = [];
  renderCarouselPreviews();
  const loc = document.getElementById('add-location');
  if (loc) loc.value = '';
  const dot = document.getElementById('btnLocal')?.querySelector('.np-btn-dot');
  if (dot) dot.style.display = 'none';
  const fileArea = document.getElementById('post-file-input');
  if (fileArea) fileArea.style.display = '';
}


// ─── ANIMAÇÃO DE CORAÇÃO ─────────────────────────────────────

function animateHeartLike(carousel, e) {
  const rect = carousel.getBoundingClientRect();
  const heart = document.createElement('div');
  heart.innerHTML = '❤️';
  heart.style.cssText = `position:absolute;left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px;pointer-events:none;font-size:50px;animation:floatHeart 1.5s ease-out forwards;z-index:1000;`;

  if (!document.getElementById('heart-animation-style')) {
    const s = document.createElement('style');
    s.id = 'heart-animation-style';
    s.textContent = `@keyframes floatHeart{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-100px) scale(0.8)}}`;
    document.head.appendChild(s);
  }

  carousel.style.position = 'relative';
  carousel.appendChild(heart);
  setTimeout(() => heart.remove(), 1500);
}


// ─── PERFIL / FOTO ───────────────────────────────────────────

function loadProfilePhoto(user) {
  const navPic = document.getElementById('nav-pic');
  const cached = localStorage.getItem('user_photo_cache');
  if (cached && navPic) navPic.src = cached;

  if (!user) {
    if (navPic) navPic.src = DEFAULT_AVATAR;
    localStorage.removeItem('user_photo_cache');
    return;
  }

  (async () => {
    try {
      const snap = await getDoc(doc(db, `users/${user.uid}/user-infos/user-media`));
      if (snap.exists()) {
        const photo = snap.data().userphoto || DEFAULT_AVATAR;
        if (photo !== cached && navPic) { navPic.src = photo; localStorage.setItem('user_photo_cache', photo); }
      } else {
        if (navPic) navPic.src = DEFAULT_AVATAR;
        localStorage.removeItem('user_photo_cache');
      }
    } catch { if (!cached && navPic) navPic.src = DEFAULT_AVATAR; }
  })();
}


// ─── SAUDAÇÃO ────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours(), m = new Date().getMinutes();
  if (h >= 6 && h < 12) return 'Bom dia';
  if ((h >= 13 && h < 18) || (h === 18 && m < 30)) return 'Boa tarde';
  return 'Boa noite';
}

async function updateGreeting(userParam) {
  const user = userParam ?? auth.currentUser;
  if (!user) return;

  const greeting = getGreeting();
  const greetingEl = document.getElementById('greeting');
  if (greetingEl) greetingEl.textContent = greeting;

  cacheRemove(`user_cache_${user.uid}`);
  const userData = await fetchUser(user.uid);
  if (userData) {
    cacheSet(`user_cache_${user.uid}`, userData, CACHE.USERS_TTL);
    if (userData.userphoto) cacheSet(`user_photo_${user.uid}`, userData.userphoto, CACHE.USERS_TTL);
  }

  const greetingElFinal = document.getElementById('greeting');
  const usernameEl = document.getElementById('username');
  const fotoEl = document.querySelector('.user-welcome img') ?? document.querySelector('.welcome-box img');
  const name = userData?.username || userData?.displayname || userData?.name || '';
  const photo = userData?.userphoto || resolvePhoto();

  if (greetingElFinal) greetingElFinal.textContent = greeting;
  if (usernameEl) usernameEl.textContent = name;
  if (fotoEl && photo !== DEFAULT_AVATAR) { fotoEl.src = photo; fotoEl.onerror = () => fotoEl.src = DEFAULT_AVATAR; }
}


// ─── EVENT LISTENERS ─────────────────────────────────────────

function setupEventListeners() {
  postButton?.addEventListener('click', handleSendPost);
  postInput?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendPost(); } });

  feed?.addEventListener('click', async (e) => {
    const btnLike = e.target.closest('.btn-like');
    const btnComment = e.target.closest('.btn-comment');
    const userInfo = e.target.closest('.user-info');
    const btnMore = e.target.closest('.more-options-button');
    const commentSubmit = e.target.closest('.comment-submit');

    if (btnLike) {
      const uid = auth.currentUser?.uid;
      if (uid) await toggleLike(uid, btnLike.dataset.id, btnLike);
    }

    if (btnComment) openCommentsModal(btnComment.dataset.id, btnComment.dataset.username);

    if (userInfo && !e.target.closest('.more-options-button')) {
      const link = userInfo.querySelector('.user-name-link');
      if (link?.dataset.username) window.location.href = `profile.html?userid=${encodeURIComponent(link.dataset.username)}`;
      return;
    }

    if (btnMore) {
      const card = btnMore.closest('.post-card');
      const postId = card?.querySelector('.btn-like')?.dataset.id;
      const ownerId = card?.querySelector('.btn-like')?.dataset.username;
      if (postId && ownerId) openBottomMenu(postId, ownerId, card);
    }

    if (commentSubmit) {
      const { username: u, postId } = commentSubmit.dataset;
      const input = document.querySelector(`input[data-username="${u}"][data-post-id="${postId}"]`);
      if (input?.value.trim()) {
        const ok = await addComment(postId, input.value.trim());
        if (ok) {
          input.value = '';
          await renderComments(postId, commentSubmit.closest('.comments-section')?.querySelector('.comments-list'));
        }
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('comentario-nome') && e.target.dataset.username) {
      window.location.href = `profile.html?userid=${encodeURIComponent(e.target.dataset.username)}`;
    }
  });
}


// ─── AUTO UPDATE DATAS ───────────────────────────────────────

function autoUpdateDates() {
  setInterval(() => {
    document.querySelectorAll('.post-date-mobile').forEach(el => {
      const card = el.closest('.post-card');
      const likeBtn = card?.querySelector('.btn-like');
      if (!likeBtn) return;
      const item = allItems.find(i => i.postid === likeBtn.dataset.id);
      if (item?.create) el.textContent = formatRelativeDate(item.create);
    });
  }, 60000);
}


// ─── INICIALIZAÇÃO ───────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  feed = document.getElementById('feed');
  loadMoreBtn = document.getElementById('load-more-btn');
  postInput = document.querySelector('.post-box input[type="text"]');
  postButton = document.querySelector('.post-button');

  loadProfilePhoto(null);

  const user = await waitForAuth();

  loadProfilePhoto(user);
  setupImageInput();
  await updateGreeting(user);
  setupPostLayer();
  initPostTypeSystem();
  setupEventListeners();
  setupBottomMenuListeners();
  setupInfiniteScroll();
  await loadPosts();
  autoUpdateDates();
});

window.addEventListener('beforeunload', stopSync);
window.addEventListener('pagehide', stopSync);

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  try {
    await registerPushNotifications(user.uid);
    listenForegroundMessages();
  } catch (e) {
    console.warn('[FCM] Falha ao registrar notificações:', e);
  }
});