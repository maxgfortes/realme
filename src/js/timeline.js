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
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};
const _app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const _db  = getFirestore(_app);
const _auth = getAuth(_app);

const _userCache = new Map();

async function _getUser(uid) {
  if (!uid) return {};
  if (_userCache.has(uid)) return _userCache.get(uid);
  try {
    const [userSnap, mediaSnap] = await Promise.all([
      getDoc(doc(_db, 'users', uid)),
      getDoc(doc(_db, 'users', uid, 'user-infos', 'user-media'))
    ]);
    const u = userSnap.exists()  ? userSnap.data()  : {};
    const m = mediaSnap.exists() ? mediaSnap.data() : {};
    const result = {
      username:    u.username    || u.displayname || u.name || uid,
      displayname: u.displayname || u.username    || u.name || uid,
      userphoto:   m.userphoto   || m.pfp         || './src/img/default.jpg',
      verified:    u.verified    || false,
    };
    _userCache.set(uid, result);
    return result;
  } catch { return {}; }
}

function _rel(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    const m = Math.floor((Date.now() - d) / 60000);
    const h = Math.floor(m / 60), day = Math.floor(h / 24);
    if (m < 1)   return 'Agora';
    if (m < 60)  return `${m}min`;
    if (h < 24)  return `${h}h`;
    if (day < 7) return `${day}d`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return ''; }
}

function _fmt(txt) {
  if (!txt) return '';
  return String(txt)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/#(\w+)/g, '<span class="tl-hashtag">#$1</span>')
    .replace(/@(\w+)/g, '<span class="tl-mention">@$1</span>')
    .replace(/\n/g, '<br>');
}


function _injectStyles() {
  if (document.getElementById('timeline-styles')) return;
  const s = document.createElement('style');
  s.id = 'timeline-styles';
  s.textContent = `
    /* ── Overlay ── */
    #timeline-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: var(--bg-primary, #0a0a0a);
      display: flex;
      flex-direction: column;
      opacity: 0;
      transform: translateY(40px);
      transition: opacity .28s ease, transform .28s ease;
      pointer-events: none;
    }
    #timeline-overlay.tl-visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: all;
    }

    /* ── Header ── */
    #tl-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px 10px;
      border-bottom: 1px solid rgba(255,255,255,.07);
      background: var(--bg-primary, #0a0a0a);
      position: sticky;
      top: 0;
      z-index: 10;
      flex-shrink: 0;
    }
    #tl-back-btn {
      background: none;
      border: none;
      color: var(--text-primary, #f8f9f9);
      font-size: 20px;
      cursor: pointer;
      padding: 4px 8px 4px 0;
      display: flex;
      align-items: center;
    }
    #tl-header h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--text-primary, #f8f9f9);
    }

    /* ── Scroll container ── */
    #tl-feed {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 0 0 80px;
    }

    /* ── Post card (mesmo visual do feed.js) ── */
    .tl-post-card {
      border-bottom: 1px solid rgba(255,255,255,.06);
      padding: 0;
    }
    .tl-post-card.tl-highlight {
      background: rgba(74,144,226,.06);
    }

    /* ── Hashtags / mentions ── */
    .tl-hashtag { color: var(--accent, #4A90E2); }
    .tl-mention  { color: var(--accent, #4A90E2); }

    /* ── Spinner ── */
    .tl-spinner {
      text-align: center;
      padding: 40px 0;
      color: rgba(255,255,255,.4);
      font-size: 24px;
    }

    /* ── Empty state ── */
    .tl-empty {
      text-align: center;
      padding: 60px 20px;
      color: rgba(255,255,255,.35);
      font-size: 14px;
    }

    /* ── Modal de imagem ── */
    .tl-image-modal {
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0,0,0,.92);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tl-image-modal img {
      max-width: 94vw;
      max-height: 90vh;
      border-radius: 8px;
      object-fit: contain;
    }
    .tl-image-modal-close {
      position: absolute;
      top: 16px; right: 16px;
      background: rgba(255,255,255,.15);
      border: none;
      color: #fff;
      font-size: 18px;
      width: 36px; height: 36px;
      border-radius: 50%;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
  `;
  document.head.appendChild(s);
}

// ═══════════════════════════════════════════════════════════
// CRIAR ESTRUTURA DO OVERLAY
// ═══════════════════════════════════════════════════════════
function _buildOverlay() {
  let overlay = document.getElementById('timeline-overlay');
  if (overlay) return overlay;

  overlay = document.createElement('div');
  overlay.id = 'timeline-overlay';
  overlay.innerHTML = `
    <div id="tl-header">
      <button id="tl-back-btn" aria-label="Voltar">
        <i class="fas fa-arrow-left"></i>
      </button>
      <h2>Posts</h2>
    </div>
    <div id="tl-feed"></div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('tl-back-btn').addEventListener('click', closeTimeline);

  // Fechar com ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('tl-visible')) closeTimeline();
  });

  return overlay;
}

// ═══════════════════════════════════════════════════════════
// RENDERIZAR UM POST
// ═══════════════════════════════════════════════════════════
async function _renderPost(postData, container, isTarget = false) {
  const user = _auth.currentUser;
  const userData = await _getUser(postData.creatorid);

  const card = document.createElement('div');
  card.className = 'tl-post-card post-card' + (isTarget ? ' tl-highlight' : '');
  card.dataset.postId = postData.postid;

  const verifiedBadge = userData.verified
    ? `<i class="fas fa-check-circle" style="margin-left:3px;font-size:.8em;color:var(--verified-blue,#4A90E2);"></i>`
    : '';

  const mediaHTML = postData.img && postData.img.trim()
    ? `<div class="post-image">
         <img src="${postData.img}" loading="lazy" decoding="async"
              style="width:100%;height:auto;display:block;cursor:pointer;"
              data-tl-img="${postData.img}">
       </div>`
    : postData.urlVideo && postData.urlVideo.trim()
    ? `<div class="post-video">
         <video src="${postData.urlVideo}" muted playsinline controls preload="metadata"></video>
       </div>`
    : '';

  card.innerHTML = `
    <div class="post-header">
      <div class="user-info" style="cursor:pointer;" data-uid="${postData.creatorid}">
        <img src="${userData.userphoto}" alt="" class="avatar"
             onerror="this.src='./src/img/default.jpg'">
        <div class="user-meta">
          <strong class="user-name-link" data-username="${postData.creatorid}">
            ${userData.username}${verifiedBadge}
          </strong>
          <small class="post-date-mobile">${_rel(postData.create)}</small>
        </div>
      </div>
      <div class="left-space-options">
        <div class="more-options">
          <button class="more-options-button tl-more-btn"
                  data-post-id="${postData.postid}"
                  data-owner-id="${postData.creatorid}">
            <i class="fas fa-ellipsis-h"></i>
          </button>
        </div>
      </div>
    </div>

    <div class="post-content">
      <div class="post-text">${_fmt(postData.content)}</div>
      ${mediaHTML}

      <div class="post-actions">
        <div class="post-actions-left">
          <button class="btn-like tl-like-btn"
                  data-id="${postData.postid}"
                  data-username="${postData.creatorid}">
            <svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd"
                 viewBox="0 0 512 456.549">
              <path fill-rule="nonzero" d="M433.871 21.441c29.483 17.589 54.094 45.531 67.663 81.351
                46.924 123.973-73.479 219.471-171.871 297.485-22.829 18.11-44.418 35.228-61.078
                50.41-7.626 7.478-19.85 7.894-27.969.711-13.9-12.323-31.033-26.201-49.312-41.01
                C94.743 332.128-32.73 228.808 7.688 106.7c12.956-39.151 41.144-70.042
                75.028-88.266C99.939 9.175 118.705 3.147 137.724.943c19.337-2.232
                38.983-.556 57.65 5.619 22.047 7.302 42.601 20.751 59.55 41.271
                16.316-18.527 35.37-31.35 55.614-39.018 20.513-7.759 42.13-10.168
                63.283-7.816 20.913 2.324 41.453 9.337 60.05 20.442z"/>
            </svg>
            <span>0</span>
          </button>

          <button class="btn-comment tl-comment-btn"
                  data-id="${postData.postid}"
                  data-username="${postData.creatorid}">
            <svg viewBox="0 0 122.97 122.88" xmlns="http://www.w3.org/2000/svg">
              <path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,
                7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,
                77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,
                .51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/>
            </svg>
            <p>Comentar</p>
            <span>0</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Seção de comentários inline (oculta por padrão) -->
    <div class="comments-section" style="display:none;">
      <div class="comment-form">
        <input type="text" class="comment-input tl-comment-input"
               placeholder="Escreva um comentário..."
               data-username="${postData.creatorid}"
               data-post-id="${postData.postid}">
        <button class="comment-submit tl-comment-submit"
                data-username="${postData.creatorid}"
                data-post-id="${postData.postid}">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
      <div class="comments-area">
        <div class="comments-list"></div>
      </div>
    </div>
  `;

  container.appendChild(card);

  // ── Likes: verificar se já curtiu ──
  if (user) {
    const likerRef = doc(_db, `posts/${postData.postid}/likers/${user.uid}`);
    getDoc(likerRef).then(snap => {
      if (snap.exists() && snap.data().like === true) {
        card.querySelector('.tl-like-btn')?.classList.add('liked');
      }
    }).catch(() => {});
  }

  // ── Contadores ──
  _contarLikes(postData.postid).then(n => {
    const span = card.querySelector('.tl-like-btn span');
    if (span) span.textContent = n;
  }).catch(() => {});

  _contarComentarios(postData.postid).then(n => {
    const span = card.querySelector('.tl-comment-btn span');
    if (span) span.textContent = n;
  }).catch(() => {});

  // ── Eventos ──
  _attachCardEvents(card, postData);

  return card;
}

// ═══════════════════════════════════════════════════════════
// EVENTOS DO CARD
// ═══════════════════════════════════════════════════════════
function _attachCardEvents(card, postData) {
  const user = _auth.currentUser;

  // Curtir
  card.querySelector('.tl-like-btn')?.addEventListener('click', async () => {
    if (!user) return;
    await _toggleLike(user.uid, postData.postid, card.querySelector('.tl-like-btn'));
  });

  // Comentar — abre seção inline
  card.querySelector('.tl-comment-btn')?.addEventListener('click', async () => {
    const section = card.querySelector('.comments-section');
    if (!section) return;
    const isHidden = section.style.display === 'none';
    section.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      await _renderComentarios(postData.creatorid, postData.postid,
        card.querySelector('.comments-list'));
      card.querySelector('.tl-comment-input')?.focus();
    }
  });

  // Enviar comentário
  card.querySelector('.tl-comment-submit')?.addEventListener('click', async () => {
    const input = card.querySelector('.tl-comment-input');
    const txt = input?.value.trim();
    if (!txt || !user) return;
    const ok = await _addComentario(postData.creatorid, postData.postid, txt);
    if (ok) {
      input.value = '';
      await _renderComentarios(postData.creatorid, postData.postid,
        card.querySelector('.comments-list'));
    }
  });

  card.querySelector('.tl-comment-input')?.addEventListener('keypress', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const txt = e.target.value.trim();
    if (!txt || !user) return;
    const ok = await _addComentario(postData.creatorid, postData.postid, txt);
    if (ok) {
      e.target.value = '';
      await _renderComentarios(postData.creatorid, postData.postid,
        card.querySelector('.comments-list'));
    }
  });

  // Abrir imagem
  card.querySelector('[data-tl-img]')?.addEventListener('click', (e) => {
    _abrirImagem(e.currentTarget.dataset.tlImg);
  });

  // Perfil
  card.querySelector('.user-info')?.addEventListener('click', (e) => {
    if (e.target.closest('.more-options-button')) return;
    const uid = card.querySelector('.user-info').dataset.uid;
    if (uid) window.location.href = `profile.html?userid=${encodeURIComponent(uid)}`;
  });

  // Menu 3 pontinhos
  card.querySelector('.tl-more-btn')?.addEventListener('click', () => {
    const postId  = postData.postid;
    const ownerId = postData.creatorid;
    if (!user) return;

    const ehMeu = user.uid === ownerId;
    const acao = ehMeu
      ? confirm('Deletar este post?') ? 'delete' : null
      : confirm('Denunciar este post?') ? 'report' : null;

    if (acao === 'delete') {
      _deletarPost(postId, ownerId, card);
    } else if (acao === 'report') {
      _denunciarPost(postId, ownerId);
    }
  });
}

// ═══════════════════════════════════════════════════════════
// OPERAÇÕES FIREBASE
// ═══════════════════════════════════════════════════════════
async function _contarLikes(postId) {
  try {
    const snap = await getDocs(
      query(collection(_db, 'posts', postId, 'likers'), where('like', '==', true))
    );
    return snap.size;
  } catch { return 0; }
}

async function _contarComentarios(postId) {
  try {
    const snap = await getDocs(collection(_db, 'posts', postId, 'coments'));
    return snap.size;
  } catch { return 0; }
}

async function _toggleLike(uid, postId, btn) {
  const ref = doc(_db, `posts/${postId}/likers/${uid}`);
  try {
    const snap = await getDoc(ref);
    const span = btn.querySelector('span');
    let cur = parseInt(span?.textContent) || 0;
    if (snap.exists() && snap.data().like === true) {
      await updateDoc(ref, { like: false, timestamp: Date.now() });
      btn.classList.remove('liked');
      if (span) span.textContent = Math.max(0, cur - 1);
    } else {
      if (snap.exists()) {
        await updateDoc(ref, { like: true, timestamp: Date.now() });
      } else {
        await setDoc(ref, { uid, like: true, timestamp: Date.now() });
      }
      btn.classList.add('liked');
      if (span) span.textContent = cur + 1;
    }
  } catch (e) { console.error('Erro ao curtir:', e); }
}

async function _renderComentarios(creatorId, postId, container) {
  if (!container) return;
  container.innerHTML = '<p style="color:rgba(255,255,255,.4);font-size:13px;padding:8px 0;">Carregando...</p>';
  try {
    const snap = await getDocs(collection(_db, 'posts', postId, 'coments'));
    const comentarios = [];
    for (const d of snap.docs) {
      const data = d.data();
      const u = await _getUser(data.senderid);
      comentarios.push({ id: d.id, u, ...data });
    }
    comentarios.sort((a, b) => {
      const ta = a.create?.seconds || 0;
      const tb = b.create?.seconds || 0;
      return ta - tb;
    });
    container.innerHTML = '';
    if (!comentarios.length) {
      container.innerHTML = '<p class="no-comments">Nenhum comentário ainda.</p>';
      return;
    }
    comentarios.forEach(c => {
      const el = document.createElement('div');
      el.className = 'comentario-item';
      el.innerHTML = `
        <div class="comentario-header">
          <img src="${c.u?.userphoto || './src/img/default.jpg'}" class="comentario-avatar"
               onerror="this.src='./src/img/default.jpg'">
          <div class="comentario-meta">
            <strong class="comentario-nome">${c.u?.username || c.senderid}</strong>
            <small class="comentario-data">${_rel(c.create)}</small>
          </div>
        </div>
        <div class="comentario-conteudo">${_fmt(c.content)}</div>
      `;
      container.appendChild(el);
    });
  } catch (e) {
    container.innerHTML = '<p class="error-comments">Erro ao carregar comentários.</p>';
  }
}

async function _addComentario(creatorId, postId, conteudo) {
  const user = _auth.currentUser;
  if (!user) return false;
  try {
    const id = `comentid-${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const data = { content: conteudo, create: serverTimestamp(), senderid: user.uid, report: 0 };
    await Promise.all([
      setDoc(doc(_db, 'users', creatorId, 'posts', postId, 'coments', id), data),
      setDoc(doc(_db, 'posts', postId, 'coments', id), data),
    ]);
    return true;
  } catch (e) { console.error('Erro ao comentar:', e); return false; }
}

async function _deletarPost(postId, ownerId, cardEl) {
  const user = _auth.currentUser;
  if (!user || user.uid !== ownerId) return;
  try {
    if (cardEl) {
      cardEl.style.transition = 'opacity .3s ease, transform .3s ease';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'translateY(-16px)';
      setTimeout(() => cardEl.remove(), 300);
    }
    await Promise.all([
      deleteDoc(doc(_db, 'posts', postId)),
      deleteDoc(doc(_db, 'users', ownerId, 'posts', postId)),
    ]);
  } catch (e) { console.error('Erro ao deletar:', e); }
}

async function _denunciarPost(postId, ownerId) {
  const user = _auth.currentUser;
  if (!user) return;
  try {
    await setDoc(doc(_db, 'reports', `${postId}_${user.uid}`), {
      postId, ownerId, reportedBy: user.uid, create: serverTimestamp()
    });
    alert('Post denunciado. Obrigado!');
  } catch (e) { console.error('Erro ao denunciar:', e); }
}

// ═══════════════════════════════════════════════════════════
// MODAL DE IMAGEM
// ═══════════════════════════════════════════════════════════
function _abrirImagem(url) {
  const m = document.createElement('div');
  m.className = 'tl-image-modal';
  m.innerHTML = `
    <button class="tl-image-modal-close"><i class="fas fa-times"></i></button>
    <img src="${url}" alt="Imagem">
  `;
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('.tl-image-modal-close')) m.remove();
  });
  document.body.appendChild(m);
}

// ═══════════════════════════════════════════════════════════
// CARREGAR POSTS DO USUÁRIO
// ═══════════════════════════════════════════════════════════
async function _carregarPostsUsuario(userId) {
  const q = query(
    collection(_db, 'users', userId, 'posts'),
    orderBy('create', 'desc'),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ ...d.data(), postid: d.id }))
    .filter(p => p.visible !== false);
}

// ═══════════════════════════════════════════════════════════
// API PÚBLICA
// ═══════════════════════════════════════════════════════════

/**
 * Abre a timeline do usuário e scrolla até o post alvo.
 *
 * @param {string} userId    - UID do dono dos posts
 * @param {string} targetPostId - ID do post que deve ficar visível
 */
export async function openTimeline(userId, targetPostId) {
  _injectStyles();
  const overlay = _buildOverlay();
  const feed    = document.getElementById('tl-feed');

  // Limpa feed anterior
  feed.innerHTML = `<div class="tl-spinner"><i class="fas fa-spinner fa-spin"></i></div>`;

  // Bloqueia scroll da página
  const scrollY = window.scrollY;
  document.body.style.overflow  = 'hidden';
  document.body.style.position  = 'fixed';
  document.body.style.width     = '100%';
  document.body.style.top       = `-${scrollY}px`;

  // Mostra overlay com animação
  requestAnimationFrame(() => {
    overlay.classList.add('tl-visible');
  });

  try {
    const posts = await _carregarPostsUsuario(userId);
    feed.innerHTML = '';

    if (!posts.length) {
      feed.innerHTML = '<div class="tl-empty">Nenhum post encontrado.</div>';
      return;
    }

    let targetCard = null;

    for (const post of posts) {
      const isTarget = post.postid === targetPostId;
      const card = await _renderPost(post, feed, isTarget);
      if (isTarget) targetCard = card;
    }

    // Scroll até o post alvo
    if (targetCard) {
      // Pequeno delay para garantir que o layout foi calculado
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          targetCard.scrollIntoView({ behavior: 'instant', block: 'start' });
          // Ajuste fino para não colar no topo (considera o header fixo ~60px)
          feed.scrollTop = Math.max(0, feed.scrollTop - 60);
        });
      });
    }
  } catch (e) {
    console.error('Timeline: erro ao carregar posts', e);
    feed.innerHTML = '<div class="tl-empty">Erro ao carregar posts.</div>';
  }
}

/**
 * Fecha a timeline manualmente.
 */
export function closeTimeline() {
  const overlay = document.getElementById('timeline-overlay');
  if (!overlay) return;

  overlay.classList.remove('tl-visible');

  // Restaura scroll da página
  const scrollY = document.body.style.top;
  document.body.style.position = '';
  document.body.style.top      = '';
  document.body.style.width    = '';
  document.body.style.overflow = '';
  window.scrollTo(0, parseInt(scrollY || '0') * -1);

  // Limpa feed após animação
  setTimeout(() => {
    const feed = document.getElementById('tl-feed');
    if (feed) feed.innerHTML = '';
  }, 320);
}

// ── Expõe globalmente para uso em onclick inline ──
window.openTimeline  = openTimeline;
window.closeTimeline = closeTimeline;