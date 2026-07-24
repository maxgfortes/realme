import { db, auth } from "/src/config/config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  collection, getDocs, doc, getDoc, query, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { setCurrentUserId, coletarFiltros, normalizar } from "/src/js/pages/friends/filters-state.js";
import { fecharModal } from "/src/js/pages/friends/filters-modal.js";


let todosUsuarios  = [];
let preloadPronto  = false;
let preloadPromise = null;

const btnBuscar   = document.querySelector('.search-btn');
const friendsList = document.querySelector('.friends-list');
const alertArea   = document.querySelector('.alert-area');

const CACHE_KEY    = 'find-friends-cache';
const CACHE_TTL_MS = 10 * 60 * 1000;

function salvarCacheLista(usuarios) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: usuarios.slice(0, 60) }));
  } catch (_) {}
}

function lerCacheLista() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (_) { return null; }
}

async function montarUsuario(docSnap) {
  const userId   = docSnap.id;
  const userData = docSnap.data();

  const [mediaSnap, aboutSnap, likesSnap] = await Promise.all([
    getDoc(doc(db, "users", userId, "user-infos", "user-media")),
    getDoc(doc(db, "users", userId, "user-infos", "about")),
    getDoc(doc(db, "users", userId, "user-infos", "likes")),
  ]);

  const media = mediaSnap.exists() ? mediaSnap.data() : {};
  const about = aboutSnap.exists() ? aboutSnap.data() : {};
  const likes = likesSnap.exists() ? likesSnap.data() : {};

  const banner = media.banner?.trim() || media.headerphoto?.trim() || '../public/img/bg.jpg';
  const userphoto = media.pfp?.trim() || media.userphoto?.trim() || '../public/img/default.jpg';

  return {
    id: userId,
    displayname: userData.displayname || userData.username || 'Usuário',
    username: userData.username || '',
    userphoto,
    banner,
    _perfil: { ...userData, ...media, ...about, ...likes }
  };
}

async function iniciarPreload(uid) {
  const snapshot = await getDocs(query(collection(db, 'users'), limit(150)));

  const resultados = await Promise.all(
    snapshot.docs.filter(d => d.id !== uid).map(d => montarUsuario(d).catch(() => null))
  );

  todosUsuarios = resultados.filter(Boolean);
  preloadPronto = true;
  salvarCacheLista(todosUsuarios);

  const filtros = coletarFiltros();
  const temFiltro = Object.values(filtros).some(v => v);
  if (!temFiltro) renderizarLista(todosUsuarios.slice(0, 40));
}

// ─── Auth ───────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  setCurrentUserId(user.uid);
  preloadPromise = iniciarPreload(user.uid);
});

// ─── Busca ──────────────────────────────────────────────────────────────────
async function buscarUsuariosSemelhantes() {
  fecharModal();

  if (!preloadPronto) {
    mostrarLoadingLeve();
    await preloadPromise;
  }

  const filtros = coletarFiltros();
  const temFiltro = Object.values(filtros).some(v => v);

  let resultados;
  if (!temFiltro) {
    resultados = todosUsuarios.slice(0, 40);
  } else {
    resultados = todosUsuarios
      .map(u => ({ ...u, score: calcularSimilaridadeCampos(u._perfil, filtros) }))
      .filter(u => u.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  renderizarLista(resultados);
}

if (btnBuscar) btnBuscar.addEventListener('click', buscarUsuariosSemelhantes);

// ─── Render ─────────────────────────────────────────────────────────────────
function renderizarLista(resultados) {
  if (alertArea) alertArea.classList.add('hidden');
  if (!friendsList) return;

  friendsList.innerHTML = '';
  if (!resultados.length) {
    friendsList.innerHTML = '<div class="error-area"><p>Nenhum usuário parecido encontrado</p></div>';
    return;
  }

  const frag = document.createDocumentFragment();
  deduplicar(resultados).forEach(u => {
    const userEl = document.createElement('a');
    userEl.className = 'user';
    userEl.href = `profile.html?userid=${u.id}`;
    userEl.setAttribute('data-username', u.username);
    userEl.innerHTML = `
      <div class="card-media">
        <img src="${u.banner}" class="card-banner" loading="lazy" onerror="this.src='../public/img/bg.jpg'">
        <img src="${u.userphoto}" alt="${u.displayname}" class="card-image" loading="lazy" onerror="this.src='../public/img/default.jpg'">
      </div>
      <div class="user-name">
        <div class="card-info">
          <div class="profile-username"><p>${u.username}</p></div>
        </div>
        <button class="follow-btn">Adicionar</button>
      </div>`;
    frag.appendChild(userEl);
  });
  friendsList.appendChild(frag);
  ativarCliqueNosUsuarios();
}

function ativarCliqueNosUsuarios() {
  document.querySelectorAll('.user').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = `profile.html?username=${link.getAttribute('data-username')}`;
    });
  });
}

function deduplicar(lista) {
  const vistos = new Set();
  return lista.filter(u => {
    if (vistos.has(u.id)) return false;
    vistos.add(u.id);
    return true;
  });
}

function mostrarLoadingLeve() {
  if (friendsList && !friendsList.querySelector('.user')) {
    friendsList.innerHTML = `<div class="loading-spinner"><div class="spinner-center"><div class="spinner"></div><p>Quase lá...</p></div></div>`;
  }
}

// ─── Similaridade ───────────────────────────────────────────────────────────
function calcularSimilaridadeCampos(perfil, filtros) {
  let score = 0;
  let campos = 0;

  function termosFiltro(valor) {
    if (!valor) return [];
    return valor.split(',').map(t => t.trim()).filter(Boolean).flatMap(t => t.split(' ')).filter(Boolean);
  }

  const mapaCampos = {
    'estilo': 'styles',
    'personalidade': 'personality',
    'sonhos e desejos': 'dreams',
    'musicas': 'music',
    'personagens': 'characters',
    'hobbies': 'hobbies',
  };

  for (const [chaveFiltro, chavePerfil] of Object.entries(mapaCampos)) {
    if (filtros[chaveFiltro]) {
      const termos = termosFiltro(filtros[chaveFiltro]);
      const campo = normalizar(perfil[chavePerfil] || '');
      if (termos.some(t => campo.includes(normalizar(t)))) score += 2;
      campos++;
    }
  }

  if (filtros['localização']) {
    const termos = termosFiltro(filtros['localização']);
    const campo = normalizar(perfil.location || perfil.localizacao || '');
    if (termos.some(t => campo.includes(normalizar(t)))) score += 2;
    campos++;
  }

  const palavrasFiltro = Object.values(filtros).filter(Boolean).flatMap(termosFiltro).map(normalizar);
  const textoUsuario = [
    perfil.bio, perfil.displayname, perfil.username, perfil.name, perfil.surname,
    perfil.music, perfil.hobbies, perfil.characters, perfil.dreams, perfil.fears,
    perfil.location, perfil.localizacao, perfil.tags, perfil.books, perfil.foods,
    perfil.games, perfil.movies, perfil.overview, perfil.others
  ].filter(Boolean).join(' ').toLowerCase();

  palavrasFiltro.forEach(palavra => { if (textoUsuario.includes(palavra)) score += 1; });

  return campos ? score / campos : 0;
}

// ─── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const cache = lerCacheLista();
  if (cache && cache.length) {
    alertArea?.classList.add('hidden');
    renderizarLista(cache);
    todosUsuarios = cache;
  } else {
    alertArea?.classList.remove('hidden');
  }
});