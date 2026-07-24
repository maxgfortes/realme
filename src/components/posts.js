import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, getDocs, doc, getDoc,
  updateDoc, setDoc, serverTimestamp, where,
  deleteDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── FIREBASE (singleton) ────────────────────────────────────

const _firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
};

const _app = getApps().length ? getApps()[0] : initializeApp(_firebaseConfig);
const db   = getFirestore(_app);
const auth = getAuth(_app);

// ─── CONSTANTES ──────────────────────────────────────────────

const DEFAULT_AVATAR    = '../public/img/default.jpg';
const CACHE_USERS_TTL   = 30 * 60 * 1000;
const CACHE_COMMENTS_TTL = 8 * 60 * 1000;
const TIMELINE_PAGE_SIZE = 10; // posts carregados por scroll na timeline

// ─── ESTADO INTERNO ──────────────────────────────────────────

let _currentMusicPost = null;
let _musicObserver    = null;
let _currentMenuPost  = null;

// ─── UTILS ───────────────────────────────────────────────────

export const toSeconds = (ts) =>
  !ts ? 0 : (ts.seconds ?? new Date(ts).getTime() / 1000);

export function resolvePhoto(...candidates) {
  for (const p of candidates) {
    if (p && typeof p === 'string') {
      try { new URL(p); return p; } catch {}
    }
  }
  return DEFAULT_AVATAR;
}

export function formatRelativeDate(data) {
  if (!data) return 'Data não disponível';
  try {
    const date = data?.seconds ? new Date(data.seconds * 1000) : new Date(data);
    const diff  = Date.now() - date.getTime();
    const m  = Math.floor(diff / 6e4);
    const h  = Math.floor(diff / 36e5);
    const d  = Math.floor(diff / 864e5);
    const w  = Math.floor(d / 7);
    const mo = Math.floor(d / 30);
    const y  = Math.floor(d / 365);
    if (m < 1)   return 'Agora mesmo';
    if (m < 60)  return `há ${m} minuto${m !== 1 ? 's' : ''}`;
    if (h < 24)  return `há ${h} hora${h !== 1 ? 's' : ''}`;
    if (d < 7)   return `há ${d} dia${d !== 1 ? 's' : ''}`;
    if (w < 4)   return `há ${w} semana${w !== 1 ? 's' : ''}`;
    if (mo < 12) return `há ${mo} mês${mo !== 1 ? 'es' : ''}`;
    return `há ${y} ano${y !== 1 ? 's' : ''}`;
  } catch { return 'Data inválida'; }
}

export function formatText(text) {
  return (text || '')
    .replace(/#(\w+)/g,       '<span class="hashtag">#$1</span>')
    .replace(/@([a-z0-9._]+)/g, (_, u) => `<a href="profile?u=${u}" class="mention">@${u}</a>`);
}

// ─── CACHE DE USUÁRIOS ───────────────────────────────────────

function _cacheGet(key) {
  try { return JSON.parse(localStorage.getItem(key))?.value ?? null; } catch { return null; }
}
function _cacheSet(key, value, ttl = CACHE_USERS_TTL) {
  try { localStorage.setItem(key, JSON.stringify({ time: Date.now(), value, ttl })); } catch {}
}
function _cacheExpired(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return true;
    const { time, ttl = CACHE_USERS_TTL } = JSON.parse(raw);
    return Date.now() - time > ttl;
  } catch { return true; }
}
function _cacheRemove(key) { try { localStorage.removeItem(key); } catch {} }

async function _fetchUser(uid) {
  try {
    const userSnap  = await getDoc(doc(db, 'users', uid));
    if (!userSnap.exists()) return null;
    const data = userSnap.data();
    let userphoto = '';
    try {
      const mediaSnap = await getDoc(doc(db, 'users', uid, 'user-infos', 'user-media'));
      if (mediaSnap.exists()) userphoto = mediaSnap.data().userphoto || '';
    } catch {}
    const name = data.name || '', surname = data.surname || '';
    return {
      userphoto,
      username:    data.username    || '',
      displayname: data.displayname || '',
      name, surname,
      fullname: `${name} ${surname}`.trim(),
      verified: data.verified || false
    };
  } catch { return null; }
}

export async function getUserCached(uid) {
  const key = `user_cache_${uid}`;
  const stale = _cacheGet(key);
  if (stale) {
    if (_cacheExpired(key)) _fetchUser(uid).then(d => { if (d) _cacheSet(key, d); }).catch(() => {});
    return stale;
  }
  const data = await _fetchUser(uid);
  if (data) _cacheSet(key, data);
  return data;
}

// ─── CACHE DE COMENTÁRIOS ────────────────────────────────────

const _commentCacheKey = (postId) => `coments_cache_${postId}`;

function _getCommentsCache(postId) {
  try {
    const raw = localStorage.getItem(_commentCacheKey(postId));
    return raw ? JSON.parse(raw).comentarios : null;
  } catch { return null; }
}
function _setCommentsCache(postId, comentarios) {
  try {
    const serialized = comentarios.map(c => ({
      ...c,
      create: c.create?.seconds ? c.create.seconds * 1000 : c.create
    }));
    localStorage.setItem(_commentCacheKey(postId), JSON.stringify({ timestamp: Date.now(), comentarios: serialized }));
  } catch {}
}
function _invalidateCommentsCache(postId) { _cacheRemove(_commentCacheKey(postId)); }
function _isCommentsCacheExpired(postId) {
  try {
    const raw = localStorage.getItem(_commentCacheKey(postId));
    if (!raw) return true;
    return Date.now() - JSON.parse(raw).timestamp > CACHE_COMMENTS_TTL;
  } catch { return true; }
}

// ─── LIKES ───────────────────────────────────────────────────

export async function countLikes(postId) {
  const snap = await getDocs(query(collection(db, `posts/${postId}/likers`), where('like', '==', true)));
  return snap.size;
}

export async function countComments(postId) {
  return (await getDocs(collection(db, `posts/${postId}/coments`))).size;
}

export async function toggleLike(uid, postId, btn) {
  const ref  = doc(db, `posts/${postId}/likers/${uid}`);
  try {
    const snap  = await getDoc(ref);
    const span  = btn.querySelector('span');
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
    _updateLikedByFooter(btn.closest('.post-card'), postId);
  } catch (err) { console.error('Erro ao curtir/descurtir:', err); }
}

async function _getLikedByInfo(postId, currentUid) {
  const snap   = await getDocs(collection(db, `posts/${postId}/likers`));
  const likers = snap.docs.filter(d => d.data().like === true).map(d => ({ uid: d.id, timestamp: d.data().timestamp || 0 }));
  const total  = likers.length;
  if (total === 0) return { usernames: [], total: 0, fotos: [] };
  if (total === 1 && likers[0].uid === currentUid) {
    const me = await getUserCached(currentUid);
    return { usernames: ['você'], total, fotos: [me?.userphoto || DEFAULT_AVATAR] };
  }
  const others = likers.filter(l => l.uid !== currentUid).sort((a, b) => b.timestamp - a.timestamp);
  if (!others.length) return { usernames: ['você'], total, fotos: [] };
  const friendsSnap = await getDocs(collection(db, `users/${currentUid}/friends`));
  const friendUids  = friendsSnap.docs.map(d => d.id);
  const friends = others.filter(l => friendUids.includes(l.uid));
  const rest    = others.filter(l => !friendUids.includes(l.uid));
  const toShow  = [...friends, ...rest].slice(0, 2);
  const userData = await Promise.all(toShow.map(p => getUserCached(p.uid)));
  return {
    usernames: userData.map(d => d?.username || d?.displayname || 'usuário'),
    fotos:     userData.map(d => d?.userphoto || DEFAULT_AVATAR),
    total
  };
}

async function _updateLikedByFooter(postEl, postId) {
  const user = auth.currentUser;
  if (!user || !postEl) return;
  const footer    = postEl.querySelector('.post-liked-by');
  const footerBox = postEl.querySelector('.post-footer-box');
  if (!footer) return;
  const info = await _getLikedByInfo(postId, user.uid);
  if (info.total === 0) {
    if (footerBox) footerBox.style.display = 'none';
    footer.innerHTML = ''; footer.style.visibility = 'hidden'; return;
  }
  const fotosHTML = info.fotos.length
    ? `<div style="display:flex;margin-right:4px;">${info.fotos.map((f, i) =>
        `<img src="${f}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;${i > 0 ? 'margin-left:-6px;' : ''}">`
      ).join('')}</div>` : '';
  let text = '<span>Curtido por ';
  if (info.usernames.length === 1) text += `<strong>${info.usernames[0]}</strong>`;
  else if (info.usernames.length >= 2) text += `<strong>${info.usernames[0]}</strong>, <strong>${info.usernames[1]}</strong>`;
  const outros = info.total - info.usernames.length;
  if (outros === 1) text += ` e outra <strong>1 pessoa</strong>`;
  else if (outros > 1) text += ` e outras <strong>${outros} pessoas</strong>`;
  text += '</span>';
  footer.style.cssText = 'display:flex;align-items:flex-start;gap:8px;visibility:visible;';
  footer.innerHTML = fotosHTML + text;
  if (footerBox) footerBox.style.display = 'flex';
}

// ─── COMENTÁRIOS ─────────────────────────────────────────────

async function _fetchComments(postId) {
  try {
    const snap = await getDocs(query(collection(db, 'posts', postId, 'coments'), orderBy('create', 'desc')));
    return await Promise.all(snap.docs.map(async d => ({
      id: d.id,
      userData: await getUserCached(d.data().senderid),
      ...d.data()
    })));
  } catch { return []; }
}

function _renderCommentsList(comments, container) {
  if (!comments.length) {
    container.innerHTML = `<div class="no-comments"><div class="no-comments-title">Ainda não há nenhum comentário</div><div class="no-comments-sub">Inicie a conversa</div></div>`;
    return;
  }
  container.innerHTML = comments.map(c => {
    const name     = c.userData?.displayname || c.userData?.username || c.senderid;
    const username = c.userData?.username ? `${c.userData.username}` : name;
    const photo    = resolvePhoto(c.userData?.userphoto);
    const verified = c.userData?.verified
      ? '<i class="fas fa-check-circle" style="margin-left:4px;font-size:0.85em;color:var(--verified-blue)"></i>' : '';
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

async function _renderComments(postId, container) {
  const cached = _getCommentsCache(postId);
  if (cached) {
    _renderCommentsList(cached, container);
    if (_isCommentsCacheExpired(postId)) {
      _fetchComments(postId).then(fresh => { _setCommentsCache(postId, fresh); _renderCommentsList(fresh, container); }).catch(() => {});
    }
    return;
  }
  container.innerHTML = '<p class="no-comments" style="opacity:0.5">Carregando comentários...</p>';
  const comments = await _fetchComments(postId);
  _setCommentsCache(postId, comments);
  _renderCommentsList(comments, container);
}

async function _addComment(postId, content) {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const _uid = `comentid-${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    await setDoc(doc(db, 'posts', postId, 'coments', _uid), {
      content, create: serverTimestamp(), senderid: user.uid, report: 0
    });
    return true;
  } catch { return false; }
}

// ─── COMENTÁRIOS MODAL ───────────────────────────────────────

export function openCommentsModal(postId, creatorId) {
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 404 511.5" style="width:18px;height:18px;fill:currentColor"><path fill-rule="nonzero" d="m219.24 72.97.54 438.53h-34.95l-.55-442.88L25.77 241.96 0 218.39 199.73 0 404 222.89l-25.77 23.58z"/></svg>
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
  const grab    = modal.querySelector('.modal-grab');
  const header  = modal.querySelector('.modal-comments-header');
  let startY = 0, curY = 0, dragging = false;
  const onStart = (e) => { startY = e.touches[0].clientY; dragging = true; content.style.transition = 'none'; };
  const onMove  = (e) => {
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
    el.addEventListener('touchmove',  onMove);
    el.addEventListener('touchend',   onEnd);
  });

  const list = modal.querySelector('.comments-list-mobile');
  _renderComments(postId, list);

  const submitComment = async (input) => {
    const text = input.value.trim();
    if (!text) return;
    const ok = await _addComment(postId, text);
    if (ok) {
      input.value = '';
      _invalidateCommentsCache(postId);
      await _renderComments(postId, list);
      const btn = document.querySelector(`.btn-like[data-id="${postId}"]`)
        ?.closest('.post-card')
        ?.querySelector('.btn-comment span');
      if (btn) btn.textContent = await countComments(postId);
    }
  };

  modal.querySelector('.comment-submit-mobile').addEventListener('click', () => submitComment(modal.querySelector('.comment-input-mobile')));
  modal.querySelector('.comment-input-mobile').addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitComment(e.target); } });
}

export function closeCommentsModal() {
  const modal = document.querySelector('.mobile-comments-modal');
  if (!modal) return;
  const content = modal.querySelector('.mobile-comments-content');
  content.style.transition = 'transform 0.3s ease';
  content.style.transform  = 'translateY(100%)';
  modal.style.opacity = '0';
  setTimeout(() => {
    const scrollY = document.body.style.top;
    modal.remove();
    Object.assign(document.body.style, { position: '', top: '', width: '', overflow: '' });
    window.scrollTo(0, parseInt(scrollY || '0') * -1);
  }, 300);
}

// ─── MENU BOTTOM (delete / report) ───────────────────────────

export function openBottomMenu(postId, ownerId, postElement = null) {
  const menu = document.querySelector('.menu-bottom-layer');
  const user = auth.currentUser;
  if (!menu || !user) return;
  _currentMenuPost = { postId, ownerId, postElement };
  const isOwn = user.uid === ownerId;
  menu.querySelectorAll('.menu-bottom-btn').forEach(btn => {
    const a = btn.dataset.action;
    btn.style.display = a === 'delete'
      ? (isOwn  ? 'block' : 'none')
      : a === 'report'
        ? (isOwn  ? 'none'  : 'block')
        : 'block';
  });
  menu.classList.add('active');
  document.body.classList.add('menu-bottom-open');
}

export function closeBottomMenu() {
  const menu = document.querySelector('.menu-bottom-layer');
  if (!menu) return;
  menu.classList.add('closing');
  setTimeout(() => { menu.classList.remove('active', 'closing'); document.body.classList.remove('menu-bottom-open'); _currentMenuPost = null; }, 300);
}

export function setupBottomMenuListeners() {
  const menu = document.querySelector('.menu-bottom-layer');
  if (!menu) return;
  menu.addEventListener('click', async (e) => {
    if (e.target === menu) { closeBottomMenu(); return; }
    const btn = e.target.closest('.menu-bottom-btn');
    if (!btn || !_currentMenuPost) return;
    const { postId, ownerId, postElement } = _currentMenuPost;
    const action = btn.dataset.action;
    closeBottomMenu();
    if (action === 'delete') _handleDeletePost(postId, ownerId, postElement);
    if (action === 'report') await _handleReportPost(postId, ownerId);
  });
}

async function _handleDeletePost(postId, ownerId, postElement) {
  const user = auth.currentUser;
  if (!user || user.uid !== ownerId || !postId) return;
  const el = postElement ?? document.querySelector(`.post-card[data-post-id="${postId}"]`);
  if (el) {
    Object.assign(el.style, { transition: 'opacity 0.3s ease,transform 0.3s ease', opacity: '0', transform: 'translateY(-16px)' });
    setTimeout(() => el.remove(), 300);
  }
  await Promise.all([
    deleteDoc(doc(db, 'posts', postId)),
    deleteDoc(doc(db, 'users', ownerId, 'posts', postId))
  ]).catch(console.error);
}

async function _handleReportPost(postId, ownerId, reason = 'other') {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const reportId = `report_${Date.now()}`;
    await setDoc(doc(db, 'reports', reportId), {
      reportId, type: 'post', targetId: postId, targetOwnerId: ownerId,
      reportedBy: user.uid, reason, timestamp: serverTimestamp(), status: 'pending'
    });
    alert('Denúncia enviada com sucesso!');
  } catch (err) { console.error('Erro ao denunciar:', err); alert('Erro ao enviar denúncia'); }
}

// ─── MÚSICA ──────────────────────────────────────────────────

function _buildMusicIframe(postEl, musicUrl) {
  const existing = postEl.querySelector('.post-music-iframe');
  if (existing) return;
  const videoId = musicUrl.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
  if (!videoId) return;
  const iframe = document.createElement('iframe');
  iframe.className = 'post-music-iframe';
  iframe.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1&autoplay=0&controls=0&loop=1&playlist=${videoId}&playsinline=1&modestbranding=1&rel=0`;
  iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;';
  iframe.allow = 'autoplay; encrypted-media';
  iframe.setAttribute('allowfullscreen', '');
  iframe.dataset.musicUrl = musicUrl;
  iframe.dataset.muted = 'false';
  postEl.appendChild(iframe);
}

const _ytCmd = (iframe, func, args = []) => {
  try { iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args }), '*'); } catch {}
};

function _setMusicIcon(postEl, playing, muted) {
  const icon = postEl.querySelector('.post-music-icon');
  if (!icon) return;
  icon.innerHTML = !playing
    ? '<i class="fas fa-music"></i>'
    : muted ? '<i class="fas fa-volume-mute"></i>' : '<i class="fas fa-volume-up"></i>';
}

function _playMusicPost(postEl) {
  if (_currentMusicPost && _currentMusicPost !== postEl) _pauseMusicPost(_currentMusicPost);
  const iframe = postEl.querySelector('.post-music-iframe');
  if (!iframe) return;
  _currentMusicPost = postEl;
  _ytCmd(iframe, 'playVideo'); _ytCmd(iframe, 'mute');
  iframe.dataset.muted = 'true';
  postEl.classList.add('post-music-playing'); postEl.classList.remove('post-music-muted');
  _setMusicIcon(postEl, true, true);
}

function _pauseMusicPost(postEl) {
  const iframe = postEl.querySelector('.post-music-iframe');
  if (iframe) { _ytCmd(iframe, 'pauseVideo'); _ytCmd(iframe, 'mute'); iframe.dataset.muted = 'true'; }
  postEl.classList.remove('post-music-playing', 'post-music-unmuted'); postEl.classList.add('post-music-muted');
  _setMusicIcon(postEl, false, true);
  if (_currentMusicPost === postEl) _currentMusicPost = null;
}

function _toggleMute(postEl) {
  const iframe = postEl.querySelector('.post-music-iframe');
  if (!iframe) return;
  const muted = iframe.dataset.muted === 'true';
  if (muted) {
    _ytCmd(iframe, 'unMute'); _ytCmd(iframe, 'setVolume', [80]);
    iframe.dataset.muted = 'false';
    postEl.classList.add('post-music-unmuted'); postEl.classList.remove('post-music-muted');
    _setMusicIcon(postEl, true, false);
  } else {
    _ytCmd(iframe, 'mute'); iframe.dataset.muted = 'true';
    postEl.classList.remove('post-music-unmuted'); postEl.classList.add('post-music-muted');
    _setMusicIcon(postEl, true, true);
  }
}

async function _fetchMusicTitle(musicUrl) {
  try {
    const videoId = musicUrl.match(/(?:v=|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
    if (!videoId) return null;
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    return (await res.json()).title || null;
  } catch { return null; }
}

function _initMusicBanner(postEl, musicUrl) {
  const dateEl   = postEl.querySelector('.post-music-date');
  const titleEl  = postEl.querySelector('.post-music-title');
  const metaDate = postEl.querySelector('.post-music-meta-date');
  const metaTitleEl = postEl.querySelector('.post-music-meta-title');

  _fetchMusicTitle(musicUrl).then(title => {
    const t = title || '♪ Música';
    if (titleEl) titleEl.textContent = t;
    if (metaTitleEl) metaTitleEl.textContent = t;
  });

  dateEl?.classList.add('visible'); metaDate?.classList.add('visible');
  let showing = 'data';
  postEl._musicBannerTimer = setInterval(() => {
    if (showing === 'data') {
      dateEl?.classList.remove('visible'); titleEl?.classList.add('visible');
      metaDate?.classList.remove('visible'); metaTitleEl?.classList.add('visible');
      showing = 'titulo';
    } else {
      titleEl?.classList.remove('visible'); dateEl?.classList.add('visible');
      metaTitleEl?.classList.remove('visible'); metaDate?.classList.add('visible');
      showing = 'data';
    }
  }, 5000);
}

function _observeMusicPost(postEl) {
  if (!_musicObserver) {
    _musicObserver = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && e.intersectionRatio >= 0.6) _playMusicPost(e.target);
        else if (!e.isIntersecting && _currentMusicPost === e.target) _pauseMusicPost(e.target);
      });
    }, { threshold: [0, 0.6] });
  }
  _musicObserver.observe(postEl);
}

// ─── CARROSSEL ───────────────────────────────────────────────

function _initCarousel(postEl) {
  const carousel = postEl.querySelector('.post-carousel');
  if (!carousel) return;
  const track = carousel.querySelector('.post-carousel-track');
  const total = parseInt(carousel.dataset.total, 10);
  const dots  = postEl.querySelectorAll('.post-carousel-dot');
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
    if (movedX < -thr) goTo(current + 1);
    else if (movedX > thr) goTo(current - 1);
    else goTo(current);
    movedX = 0;
  };

  carousel.addEventListener('mousedown', e => { startX = e.clientX; dragging = true; track.style.transition = 'none'; e.preventDefault(); });
  carousel.addEventListener('mousemove', e => { if (!dragging) return; movedX = e.clientX - startX; track.style.transform = `translateX(calc(-${current * 100}% + ${movedX}px))`; });
  carousel.addEventListener('mouseup',   onDragEnd);
  carousel.addEventListener('mouseleave', onDragEnd);

  carousel.addEventListener('touchstart', e => { startX = e.touches[0].clientX; dragging = true; track.style.transition = 'none'; }, { passive: true });
  carousel.addEventListener('touchmove',  e => { if (!dragging) return; movedX = e.touches[0].clientX - startX; track.style.transform = `translateX(calc(-${current * 100}% + ${movedX}px))`; }, { passive: true });
  carousel.addEventListener('touchend', onDragEnd);

  dots.forEach((dot, i) => dot.addEventListener('click', () => goTo(i)));

  carousel.addEventListener('dblclick', e => {
    if (!document.getElementById('heart-animation-style')) {
      const s = document.createElement('style');
      s.id = 'heart-animation-style';
      s.textContent = `@keyframes floatHeart{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-100px) scale(0.8)}}`;
      document.head.appendChild(s);
    }
    const rect   = carousel.getBoundingClientRect();
    const heart  = document.createElement('div');
    heart.innerHTML = '❤️';
    heart.style.cssText = `position:absolute;left:${e.clientX - rect.left}px;top:${e.clientY - rect.top}px;pointer-events:none;font-size:50px;animation:floatHeart 1.5s ease-out forwards;z-index:1000;`;
    carousel.style.position = 'relative';
    carousel.appendChild(heart);
    setTimeout(() => heart.remove(), 1500);
    const uid = auth.currentUser?.uid;
    const btn  = document.querySelector(`.btn-like[data-id="${carousel.closest('.post-card')?.dataset.postId}"]`);
    if (uid && btn && !btn.classList.contains('liked')) toggleLike(uid, btn.dataset.id, btn);
  });
}

// ─── MEDIA HTML ──────────────────────────────────────────────

function _buildMediaHTML(postData) {
  const imgs = Array.isArray(postData.imgs) && postData.imgs.length > 0
    ? postData.imgs
    : (postData.img?.trim() ? [postData.img] : []);
  if (!imgs.length) return '';
  if (imgs.length === 1) return `<div class="post-image"><img src="${imgs[0]}" loading="lazy" decoding="async" style="width:100%;height:auto;display:block;"></div>`;
  const slides = imgs.map(url => `<div class="post-carousel-slide"><img src="${url}" loading="lazy" decoding="async" alt=""></div>`).join('');
  const dts    = imgs.map((_, i) => `<div class="post-carousel-dot${i === 0 ? ' active' : ''}" data-index="${i}"></div>`).join('');
  return `
    <div class="post-carousel" data-total="${imgs.length}">
      <div class="post-carousel-track">${slides}</div>
    </div>
    <div class="post-carousel-dots">${dts}</div>`;
}

function _postTypeIcon(postData) {
  if (postData.img?.trim() || (Array.isArray(postData.imgs) && postData.imgs.length)) {
    return `<svg width="22" height="22" viewBox="0 0 340 340" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#a)"><rect x="18.7" y="114.1" width="214.8" height="166.2" transform="rotate(-4 18.7 114.1)" fill="#D9D9D9"/><rect x="18.7" y="114.1" width="214.8" height="166.2" transform="rotate(-4 18.7 114.1)" stroke="#4E4E4E" stroke-width="2.4"/></g><rect x="40.2" y="129.5" width="174" height="132.6" transform="rotate(-4 40.2 129.5)" fill="#676868"/><g filter="url(#b)"><rect x="96.1" y="75.7" width="214.8" height="166.2" transform="rotate(-4 96.1 75.7)" fill="#D9D9D9"/><rect x="96.1" y="75.7" width="214.8" height="166.2" transform="rotate(-4 96.1 75.7)" stroke="#4E4E4E" stroke-width="2.4"/></g><rect x="117.6" y="91.1" width="174" height="132.6" transform="rotate(-4 117.6 91.1)" fill="#B1B8C2"/><defs><filter id="a" x="15" y="97.9" width="233.2" height="188.1" filterUnits="userSpaceOnUse"><feOffset dy="2.4"/><feGaussianBlur stdDeviation="1.2"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/></filter><filter id="b" x="92.4" y="59.5" width="233.2" height="188.1" filterUnits="userSpaceOnUse"><feOffset dy="2.4"/><feGaussianBlur stdDeviation="1.2"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/></filter></defs></svg>`;
  }
  return `<svg width="22" height="22" viewBox="0 0 122.97 122.88" xmlns="http://www.w3.org/2000/svg"><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z" fill="currentColor"/></svg>`;
}

// ─── RENDER POST ─────────────────────────────────────────────

/**
 * Renderiza um post-card num container.
 * @param {object}      postData  — dados do post (mesmo formato do feed.js)
 * @param {HTMLElement} container — elemento onde o card será appendado
 * @param {object}      [opts]
 * @param {boolean}     [opts.hideProfileLink=false] — esconde o link de perfil (útil na própria timeline do perfil)
 */
export function renderPost(postData, container, opts = {}) {
  if (postData.visible === false) return;

  const hasMusic = !!(postData.musicUrl?.trim());
  const rawMedia = _buildMediaHTML(postData);
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
    ? `<p class="post-sugerido-por"><i class="fas fa-user-friends"></i> Sugerido por <strong>${postData._sugeridoPor}</strong></p>` : '';

  const postEl = document.createElement('div');
  postEl.className = 'post-card';
  postEl.dataset.postId = postData.postid;
  if (hasMusic) postEl.dataset.hasMusic = '1';

  postEl.innerHTML = `
    <div class="post-header">
      <div class="user-info${opts.hideProfileLink ? ' no-link' : ''}">
        <img src="${DEFAULT_AVATAR}" alt="Avatar" class="avatar" onerror="this.src='./src/img/default.jpg'">
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
        <div class="post-icon">${_postTypeIcon(postData)}</div>
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 456.549"><path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351 46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078 50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042 75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232 38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271 16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168 63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/></svg>
            <span>${postData.likes || 0}</span>
          </button>
          <button class="btn-comment" data-username="${postData.creatorid}" data-id="${postData.postid}">
            <svg viewBox="0 0 122.97 122.88" xmlns="http://www.w3.org/2000/svg"><path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/></svg>
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
  _initCarousel(postEl);

  if (hasMusic) {
    _buildMusicIframe(postEl, postData.musicUrl);
    _observeMusicPost(postEl);
    _initMusicBanner(postEl, postData.musicUrl);
    postEl.querySelectorAll('.post-image, .post-carousel, .post-text').forEach(el => {
      el.addEventListener('click', (e) => { if (!e.defaultPrevented) _toggleMute(postEl); });
    });
    postEl.querySelector('.post-music-btn')?.addEventListener('click', (e) => { e.stopPropagation(); _toggleMute(postEl); });
  }

  // Eventos do post-card
  postEl.addEventListener('click', async (e) => {
    const btnLike    = e.target.closest('.btn-like');
    const btnComment = e.target.closest('.btn-comment');
    const userInfo   = e.target.closest('.user-info');
    const btnMore    = e.target.closest('.more-options-button');

    if (btnLike) {
      const uid = auth.currentUser?.uid;
      if (uid) await toggleLike(uid, btnLike.dataset.id, btnLike);
      return;
    }
    if (btnComment) {
      openCommentsModal(btnComment.dataset.id, btnComment.dataset.username);
      return;
    }
    if (userInfo && !opts.hideProfileLink && !e.target.closest('.more-options-button')) {
      const link = userInfo.querySelector('.user-name-link');
      if (link?.dataset.username) window.location.href = `profile.html?userid=${encodeURIComponent(link.dataset.username)}`;
      return;
    }
    if (btnMore) {
      const postId  = postEl.querySelector('.btn-like')?.dataset.id;
      const ownerId = postEl.querySelector('.btn-like')?.dataset.username;
      if (postId && ownerId) openBottomMenu(postId, ownerId, postEl);
    }
  });

  // Likes / comentários
  const user = auth.currentUser;
  if (user) {
    _updateLikedByFooter(postEl, postData.postid);
    getDoc(doc(db, `posts/${postData.postid}/likers/${user.uid}`))
      .then(s => { if (s.exists() && s.data().like === true) postEl.querySelector('.btn-like')?.classList.add('liked'); });
  }
  getUserCached(postData.creatorid).then(userData => {
    if (!userData) return;
    const avatar = postEl.querySelector('.avatar');
    const nameEl = postEl.querySelector('.user-name-link');
    if (avatar) avatar.src = userData.userphoto || DEFAULT_AVATAR;
    if (nameEl) {
      nameEl.textContent = userData.username || userData.displayname || userData.name || '...';
      if (userData.verified) nameEl.innerHTML += ' <i class="fas fa-check-circle" style="margin-left:2px;font-size:0.8em;color:#4A90E2;"></i>';
    }
  });
  countLikes(postData.postid).then(n => { const s = postEl.querySelector('.btn-like span'); if (s) s.textContent = n; }).catch(() => {});
  countComments(postData.postid).then(n => { const s = postEl.querySelector('.btn-comment span'); if (s) s.textContent = n; }).catch(() => {});

  return postEl;
}

// ─── TIMELINE DO PERFIL ──────────────────────────────────────
// Abre um overlay full-screen de feed do perfil.
// • Header fixo: btn voltar | POSTS | {username}
// • Scrolla automaticamente até o post clicado
// • Carrega mais posts ao chegar no fim (infinite scroll)
//
// @param {Array}    posts        — array de { id, data } vindos do Firestore
// @param {number}   startIndex   — índice do post que deve aparecer primeiro (clicado)
// @param {string}   username     — exibido no header
// @param {Function} [loadMore]   — async () => Array<{id,data}> | null — chamada para buscar mais posts
//                                   retorne null/[] quando não houver mais

export function openProfileTimeline(posts, startIndex, username, loadMore = null) {
  _injectTimelineStyles();
  document.querySelector('#posts-timeline-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'posts-timeline-overlay';
  overlay.innerHTML = `
    <div class="ptl-header">
      <button class="ptl-back-btn" aria-label="Voltar">
        <svg viewBox="0 0 298 512" width="18" height="18" fill="currentColor">
          <path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16L12.23 285.39c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7L100.27 256.08 285.77 441z"/>
        </svg>
      </button>
      <div class="ptl-header-center">
        <span class="ptl-title">POSTS</span>
        <span class="ptl-username">${username || ''}</span>
      </div>
      <div class="ptl-spacer"></div>
    </div>
    <div class="ptl-feed" id="ptl-feed"></div>
    <div class="ptl-loading-more" id="ptl-loading-more" style="display:none;">
      <i class="fas fa-spinner fa-spin"></i>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => overlay.classList.add('active'));

  const feed = overlay.querySelector('#ptl-feed');
  let rendered     = [];
  let moreLoading  = false;
  let noMorePosts  = false;

  // Renderiza posts iniciais
  posts.forEach((p, i) => {
    const postData = { ...p.data, postid: p.id };
    renderPost(postData, feed, { hideProfileLink: true });
    rendered.push(i);
  });

  // Scrolla até o clicado após render
  setTimeout(() => {
    const cards = feed.querySelectorAll('.post-card');
    if (cards[startIndex]) {
      cards[startIndex].scrollIntoView({ behavior: 'instant', block: 'start' });
      // compensa o header fixo
      const headerH = overlay.querySelector('.ptl-header')?.offsetHeight || 56;
      overlay.scrollTop = overlay.scrollTop - headerH - 8;
    }
  }, 60);

  // Infinite scroll
  const loadingIndicator = overlay.querySelector('#ptl-loading-more');

  const _onScroll = async () => {
    if (moreLoading || noMorePosts || !loadMore) return;
    const scrollTop    = overlay.scrollTop;
    const clientHeight = overlay.clientHeight;
    const scrollHeight = overlay.scrollHeight;
    if (scrollTop + clientHeight >= scrollHeight - 1200) {
      moreLoading = true;
      loadingIndicator.style.display = 'flex';
      try {
        const newPosts = await loadMore();
        if (!newPosts || !newPosts.length) {
          noMorePosts = true;
          loadingIndicator.style.display = 'none';
          return;
        }
        newPosts.forEach(p => {
          const postData = { ...p.data, postid: p.id };
          renderPost(postData, feed, { hideProfileLink: true });
        });
      } catch (e) { console.error('[posts.js] loadMore error:', e); }
      finally { moreLoading = false; loadingIndicator.style.display = 'none'; }
    }
  };
  overlay.addEventListener('scroll', _onScroll, { passive: true });

  // Botão voltar
  overlay.querySelector('.ptl-back-btn').addEventListener('click', () => {
    overlay.classList.add('closing');
    overlay.addEventListener('animationend', () => {
      overlay.remove();
      document.body.style.overflow = '';
    }, { once: true });
  });

  // ESC fecha
  const _onKey = (e) => { if (e.key === 'Escape') { overlay.querySelector('.ptl-back-btn').click(); document.removeEventListener('keydown', _onKey); } };
  document.addEventListener('keydown', _onKey);
}

// ─── ESTILOS DA TIMELINE ─────────────────────────────────────

function _injectTimelineStyles() {
  if (document.getElementById('posts-timeline-styles')) return;
  const style = document.createElement('style');
  style.id = 'posts-timeline-styles';
  style.textContent = `
#posts-timeline-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: var(--bg-primary, #0e0e0e);
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;

  opacity: 0;
  transform: scale(0.85);
  transform-origin: center;
  pointer-events: none;
}

#posts-timeline-overlay.active {
  pointer-events: auto;
  animation: ptl-grow-in 0.32s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

#posts-timeline-overlay.closing {
  animation: ptl-grow-out 0.28s cubic-bezier(0.4, 0, 0.2, 1) forwards;
}

@keyframes ptl-grow-in {
  from {
    opacity: 0;
    transform: scale(0.85);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes ptl-grow-out {
  from {
    opacity: 1;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(0.85);
  }
}

    /* ── HEADER FIXO ── */
    .ptl-header {
      position: sticky;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
      padding: 0 12px;
      background: var(--bg-primary, #0e0e0e);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
    .ptl-back-btn {
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--text-primary, #f8f9f9);
      cursor: pointer;
      border-radius: 50%;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .ptl-header-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      flex: 1;
    }
    .ptl-title {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: #888;
      text-transform: uppercase;
    }
    .ptl-username {
      font-size: 15px !important;
      font-weight: 600;
      color: var(--text-primary, #f8f9f9);
    }
    .ptl-spacer { width: 40px; flex-shrink: 0; }

    /* ── FEED ── */
    .ptl-feed {
      padding-bottom: 80px;
    }
    .ptl-feed .post-card {
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    /* ── LOADING MORE ── */
    #ptl-loading-more {
      display: flex;
      justify-content: center;
      padding: 24px;
      color: #666;
      font-size: 20px;
    }
  `;
  document.head.appendChild(style);
}