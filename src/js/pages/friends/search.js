import { auth, app, IS_LOCAL } from "/src/config/config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFunctions,
  httpsCallable,
  connectFunctionsEmulator
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

import {
  setCurrentUserId,
  coletarFiltros,
  coletarIdade
} from "/src/js/pages/friends/filters-state.js";

import {
  closeSearch
} from "/src/js/pages/friends/filters-modal.js";


// ==============================
// CONFIG
// ==============================

const NEXT_PAGE = 20;
const LOAD_MARGIN = '600px 0px';
const CACHE_KEY = 'friends_seen_v1';
const CACHE_TTL = 6 * 60 * 60 * 1000;
const CACHE_MAX_PEOPLE = 100;
const CACHE_MAX_QUEUE = 150;
const HISTORY_MAX = 300;

const functions = getFunctions(app, "us-central1");

if (IS_LOCAL) {
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

const searchPeople = httpsCallable(functions, "searchPeople");


// ==============================
// ELEMENTOS
// ==============================

const listaAmigos = document.querySelector('.friends-list');
const btnBuscar = document.querySelector('.search-btn');

const sentinela = document.createElement('div');
sentinela.className = 'friends-sentinel';
sentinela.style.cssText = 'grid-column:1/-1;width:100%;height:1px;pointer-events:none;';


// ==============================
// ESTADO
// ==============================

const estado = {
  pessoas: [],        // o que está na tela, na ordem
  fila: [],           // [{uid, score}] já ranqueados, ainda não mostrados
  vistos: new Set(),  // uids mostrados nesta sessão de busca
  historico: [],      // últimos uids vistos (persistido no cache)
  carregando: false,
  acabou: false,
  versao: 0           // invalida respostas de buscas antigas
};

let usuarioRolou = false;

document.addEventListener('scroll', () => { usuarioRolou = true; }, { capture: true, passive: true });


// ==============================
// CACHE (últimas pessoas vistas)
// ==============================

function lerCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;

    const cache = JSON.parse(raw);

    if (!cache || cache.uid !== auth.currentUser?.uid) return null;
    if (Date.now() - cache.ts > CACHE_TTL) return null;

    return cache;
  } catch (_) {
    return null;
  }
}

function salvarCache(chave, pessoas, fila) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      uid: auth.currentUser?.uid,
      ts: Date.now(),
      key: chave,
      people: pessoas.slice(0, CACHE_MAX_PEOPLE),
      queue: fila.slice(0, CACHE_MAX_QUEUE),
      history: estado.historico.slice(-HISTORY_MAX)
    }));
  } catch (_) {
    // storage cheio ou bloqueado: segue sem cache
  }
}

function persistirEstado(chave) {
  salvarCache(chave, estado.pessoas, estado.fila);
}


// ==============================
// REQUISIÇÃO
// ==============================

function montarRequisicao() {
  const age = coletarIdade();

  return {
    filters: coletarFiltros(),
    age: age ?? null
  };
}

async function chamar(payload) {
  const resposta = await searchPeople(payload);
  return resposta.data || {};
}

function esc(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function fotoSegura(url) {
  return /^(https?:\/\/|data:image\/)/i.test(url || '') ? url : '';
}

function cardHTML(pessoa) {

  const nome = pessoa.name || pessoa.username || 'Usuário';
  const foto = fotoSegura(pessoa.photo);

  const meta = [
    Number.isFinite(pessoa.age) ? `${pessoa.age} anos` : '',
    pessoa.location || ''
  ].filter(Boolean).join(' · ');

  return `
    <div class="friend-card" data-uid="${esc(pessoa.uid)}" data-score="${Number(pessoa.score) || 0}">

      <div class="friend-card-photo">
        ${
          foto
            ? `<img src="${esc(foto)}" alt="${esc(nome)}" loading="lazy" decoding="async">`
            : `<div class="friend-photo-placeholder">${esc(nome.charAt(0).toUpperCase())}</div>`
        }
      </div>

      <div class="friend-card-info">
        <div class="friend-card-name">${esc(nome)}</div>
        ${meta ? `<div class="friend-card-meta">${esc(meta)}</div>` : ''}
      </div>

    </div>
  `;
}

function renderizar(pessoas) {

  if (!listaAmigos) return;

  if (!pessoas.length) {
    listaAmigos.innerHTML = '<div class="empty-search">Nenhuma pessoa encontrada.</div>';
    return;
  }

  listaAmigos.innerHTML = pessoas.map(cardHTML).join('');
  listaAmigos.appendChild(sentinela);
}

function anexar(pessoas) {

  if (!listaAmigos || !pessoas.length) return;

  listaAmigos.querySelector('.empty-search')?.remove();

  if (!sentinela.isConnected) listaAmigos.appendChild(sentinela);

  sentinela.insertAdjacentHTML('beforebegin', pessoas.map(cardHTML).join(''));
}

function mostrarLoadingLeve() {
  if (!listaAmigos) return;
  listaAmigos.innerHTML = '<div class="loading-search">Procurando pessoas parecidas...</div>';
}

function mostrarErro() {
  if (!listaAmigos) return;
  listaAmigos.innerHTML = '<div class="empty-search">Não foi possível buscar agora. Tente novamente.</div>';
}

listaAmigos?.addEventListener('click', (e) => {
  const card = e.target.closest('.friend-card');
  if (card?.dataset.uid) {
    window.location.href = `profile.html?uid=${encodeURIComponent(card.dataset.uid)}`;
  }
});


// ==============================
// ESTADO + HISTÓRICO
// ==============================

function aplicarEstado(pessoas, fila) {
  estado.pessoas = pessoas.slice();
  estado.fila = (fila || []).slice();
  estado.vistos = new Set(pessoas.map(p => p.uid));
  estado.acabou = false;
  registrarVistos(pessoas);
}

function registrarVistos(pessoas) {
  const recentes = new Set(estado.historico);
  pessoas.forEach(p => recentes.add(p.uid));
  estado.historico = [...recentes].slice(-HISTORY_MAX);
}


// ==============================
// BUSCA INICIAL (cold start: 50 pessoas)
// ==============================

async function buscar({ explicita = false } = {}) {

  const versao = ++estado.versao;
  const req = montarRequisicao();
  const chave = JSON.stringify(req);

  if (explicita) {
    usuarioRolou = false;
    window.scrollTo({ top: 0 });
    if (listaAmigos) listaAmigos.scrollTop = 0;
  }

  // Cold start: pinta na hora o que você viu por último e atualiza em seguida
  let pintouCache = false;

  if (!explicita) {
    const cache = lerCache();

    if (cache && cache.key === chave && cache.people?.length) {
      estado.historico = cache.history || [];
      aplicarEstado(cache.people, cache.queue);
      renderizar(estado.pessoas);
      pintouCache = true;
    }
  }

  if (!pintouCache) mostrarLoadingLeve();

  estado.carregando = true;

  try {

    const dados = await chamar({ mode: 'search', ...req });

    if (versao !== estado.versao) return; // chegou outra busca

    const pessoas = dados.people || [];
    const fila = dados.queue || [];

    // o usuário já está rolando a lista em cache: não troca nada na frente dele,
    // só guarda o resultado novo para a próxima abertura
    if (pintouCache && usuarioRolou) {
      salvarCache(chave, pessoas, fila);
      return;
    }

    aplicarEstado(pessoas, fila);
    renderizar(estado.pessoas);
    persistirEstado(chave);

  } catch (error) {

    console.error('Erro na busca:', error);

    if (!pintouCache && versao === estado.versao) mostrarErro();

  } finally {

    if (versao === estado.versao) {
      estado.carregando = false;
      requestAnimationFrame(verificarSentinela);
    }
  }
}


// ==============================
// CARREGAR MAIS (20 por vez, perto do fim)
// ==============================

async function carregarMais() {

  if (estado.carregando || estado.acabou || !estado.pessoas.length) return;

  estado.carregando = true;

  const versao = estado.versao;
  const chave = JSON.stringify(montarRequisicao());

  try {

    let novas = [];

    if (estado.fila.length) {

      // próximos da fila, já ranqueados (mais parecidos primeiro)
      const lote = estado.fila.splice(0, NEXT_PAGE);
      const scores = new Map(lote.map(item => [item.uid, item.score]));

      const dados = await chamar({ mode: 'profiles', uids: lote.map(item => item.uid) });

      novas = (dados.people || []).map(p => ({ ...p, score: scores.get(p.uid) ?? p.score }));

    } else {

      // acabaram os parecidos: completa com pessoas variadas (nota baixa)
      const exclude = [...new Set([...estado.vistos, ...estado.historico])].slice(-400);

      const dados = await chamar({ mode: 'random', exclude });

      novas = dados.people || [];

      if (novas.length < NEXT_PAGE) estado.acabou = true;
    }

    if (versao !== estado.versao) return; // buscou de novo no meio do caminho

    novas = novas.filter(p => !estado.vistos.has(p.uid));

    novas.forEach(p => estado.vistos.add(p.uid));
    estado.pessoas.push(...novas);
    registrarVistos(novas);

    anexar(novas);
    persistirEstado(chave);

  } catch (error) {

    console.error('Erro ao carregar mais pessoas:', error);

  } finally {

    if (versao === estado.versao) {
      estado.carregando = false;
      requestAnimationFrame(verificarSentinela);
    }
  }
}

// Se a sentinela continua perto da tela depois de carregar, carrega de novo
// (o IntersectionObserver só avisa quando a visibilidade muda).
function verificarSentinela() {
  if (!sentinela.isConnected) return;

  const topo = sentinela.getBoundingClientRect().top;

  if (topo < window.innerHeight + 600) carregarMais();
}

if ('IntersectionObserver' in window) {

  new IntersectionObserver((entradas) => {
    if (entradas.some(e => e.isIntersecting)) carregarMais();
  }, { rootMargin: LOAD_MARGIN }).observe(sentinela);

} else {

  document.addEventListener('scroll', verificarSentinela, { capture: true, passive: true });
}


btnBuscar?.addEventListener('click', () => {
  closeSearch();
  buscar({ explicita: true });
});

let iniciou = false;

onAuthStateChanged(auth, (user) => {

  if (!user) {
    console.warn('Nenhum usuário autenticado.');
    return;
  }

  setCurrentUserId(user.uid);

  if (iniciou) return;
  iniciou = true;

  buscar();
});