import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { formatarTexto, formatarDataRelativa, gerarIdUnico, buscarDadosUsuarioPorUid, obterFotoPerfil } from './utilities.js';
import { triggerNovoComentario } from '../../components/activitie-creator.js';

const db = getFirestore();
const auth = getAuth();

const COMENTARIOS_CACHE_TTL = 8 * 60 * 1000;
const COMENTARIOS_CACHE_PREFIX = 'coments_cache_';
const COMENTARIOS_CACHE_MAX_POSTS = 30;

function _getCommentCacheKey(postId) {
  return COMENTARIOS_CACHE_PREFIX + postId;
}

export function getComentariosCache(postId) {
  try {
    const raw = localStorage.getItem(_getCommentCacheKey(postId));
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry.comentarios;
  } catch {
    return null;
  }
}

export function comentariosCacheExpirado(postId) {
  try {
    const raw = localStorage.getItem(_getCommentCacheKey(postId));
    if (!raw) return true;
    const entry = JSON.parse(raw);
    return Date.now() - entry.timestamp > COMENTARIOS_CACHE_TTL;
  } catch {
    return true;
  }
}

export function setComentariosCache(postId, comentarios) {
  try {
    const serializados = comentarios.map(c => ({
      ...c,
      create: (c.create && c.create.seconds) ? c.create.seconds * 1000 : c.create
    }));

    localStorage.setItem(_getCommentCacheKey(postId), JSON.stringify({
      timestamp: Date.now(),
      comentarios: serializados
    }));

    _limparExcessoCache();
  } catch (e) {
    console.warn('Erro ao salvar cache de comentários:', e);
  }
}

export function invalidarCacheComentarios(postId) {
  try {
    localStorage.removeItem(_getCommentCacheKey(postId));
  } catch {}
}

function _limparExcessoCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(COMENTARIOS_CACHE_PREFIX)) keys.push(k);
    }
    if (keys.length <= COMENTARIOS_CACHE_MAX_POSTS) return;

    const comTimestamp = keys.map(k => {
      try {
        return { k, t: JSON.parse(localStorage.getItem(k)).timestamp };
      } catch {
        return { k, t: 0 };
      }
    });
    comTimestamp.sort((a, b) => a.t - b.t);
    const excesso = comTimestamp.slice(0, comTimestamp.length - COMENTARIOS_CACHE_MAX_POSTS);
    excesso.forEach(({ k }) => localStorage.removeItem(k));
  } catch {}
}

export async function carregarComentarios(postId) {
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
             onerror="this.src='./public/img/default.jpg'" />
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

export async function renderizarComentarios(uid, postId, container) {
  const cached = getComentariosCache(postId);

  if (cached) {
    renderListaComentarios(cached, container);
    if (comentariosCacheExpirado(postId)) {
      carregarComentarios(postId)
        .then(novos => {
          setComentariosCache(postId, novos);
          renderListaComentarios(novos, container);
        })
        .catch(() => {});
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

export async function adicionarComentario(uid, postId, conteudo) {
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

export async function contarComentarios(postId) {
  const comentariosRef = collection(db, 'posts', postId, 'coments');
  const snapshot = await getDocs(comentariosRef);
  return snapshot.size;
}

export async function abrirModalComentarios(postId, creatorId) {
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

      const opacity = Math.max(0, 1 - deltaY / 300);
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

export function fecharModalComentarios() {
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
