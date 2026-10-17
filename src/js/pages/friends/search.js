import { auth, app, db } from "/src/config/config.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  setCurrentUserId,
  coletarFiltros,
  preencherFiltros
} from "/src/js/pages/friends/filters-state.js";

import {
  closeSearch
} from "/src/js/pages/friends/filters-modal.js";


// ==============================
// O front não categoriza nada:
// pede o feed de busca ao servidor e renderiza na ordem em que ele manda.
//   • cold start e "Igual a mim"  → { similar: true }
//   • "Buscar"                    → { filters: { campo: "texto digitado" } }
// ==============================

const PAGE_SIZE = 24;     // pessoas por pedido (o servidor devolve 24 por vez)
const LOAD_AT = 0.7;      // pede mais ao passar de 70% do scroll
const MAX_AUTO = 6;       // pedidos seguidos sem o usuário rolar (evita laço)

const CACHE_KEY = "friends_seen_v2";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const CACHE_MAX_PEOPLE = 100;
const CACHE_MAX_QUEUE = 150;
const HISTORY_MAX = 300;

const functions = getFunctions(app, "us-central1");

const searchPeople = httpsCallable(functions, "searchPeople");

const listaAmigos = document.querySelector(".friends-list");

// são dois botões .search-btn: "Igual a mim" (.sec) e "Buscar"
const btnIgualAMim = document.querySelector(".search-btn.sec");
const btnBuscar = document.querySelector(".search-btn:not(.sec)");


// ==============================
// ESTADO
// ==============================

const estado = {
  pessoas: [],
  fila: [],
  vistos: new Set(),
  historico: [],
  carregando: false,
  acabou: false,
  versao: 0
};

let usuarioRolou = false;
let autoSeguidas = 0;
let chaveAtual = "";


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
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        uid: auth.currentUser?.uid,
        ts: Date.now(),
        key: chave,
        people: pessoas.slice(0, CACHE_MAX_PEOPLE),
        queue: fila.slice(0, CACHE_MAX_QUEUE),
        history: estado.historico.slice(-HISTORY_MAX)
      })
    );
  } catch (_) {
  }
}

function persistirEstado() {
  salvarCache(chaveAtual, estado.pessoas, estado.fila);
}


// ==============================
// SERVIDOR
// ==============================

async function chamar(payload) {
  const resposta = await searchPeople(payload);
  return resposta.data || {};
}


// ==============================
// RENDER
// ==============================

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function fotoSegura(url) {
  return /^(https?:\/\/|data:image\/)/i.test(url || "") ? url : "";
}

const IMG_BANNER_PADRAO = "../public/img/bg.jpg";
const IMG_FOTO_PADRAO = "../public/img/default.jpg";

function cardHTML(pessoa) {
  const username = pessoa.username || "";
  const nome = pessoa.name || username || "Usuário";
  const foto = fotoSegura(pessoa.photo);
  const banner = fotoSegura(pessoa.banner) || foto;

  return `
    <a
      class="user"
      href="profile.html?userid=${encodeURIComponent(pessoa.uid)}"
      data-uid="${esc(pessoa.uid)}"
      data-username="${esc(username)}"
      data-score="${Number(pessoa.score) || 0}"
    >
      <div class="card-media">
        <img
          src="${esc(banner || IMG_BANNER_PADRAO)}"
          class="card-banner"
          loading="lazy"
          onerror="this.onerror=null;this.src='${IMG_BANNER_PADRAO}'"
        >
        <img
          src="${esc(foto || IMG_FOTO_PADRAO)}"
          alt="${esc(nome)}"
          class="card-image"
          loading="lazy"
          onerror="this.onerror=null;this.src='${IMG_FOTO_PADRAO}'"
        >
      </div>
      <div class="user-name">
        <div class="card-info">
          <div class="profile-username"><p>${esc(username || nome)}</p></div>
        </div>
        <button class="follow-btn${pessoa.sent ? " sent" : ""}" type="button"${pessoa.sent ? " disabled" : ""}>
          ${pessoa.sent ? "Enviado" : "Adicionar"}
        </button>
      </div>
    </a>
  `;
}

function renderizar(pessoas) {
  if (!listaAmigos) return;

  if (!pessoas.length) {
    listaAmigos.innerHTML =
      '<div class="empty-search">Nenhuma pessoa encontrada.</div>';
    return;
  }

  listaAmigos.innerHTML = pessoas.map(cardHTML).join("");
}

function anexar(pessoas) {
  if (!listaAmigos || !pessoas.length) return;

  listaAmigos.querySelector(".empty-search")?.remove();

  listaAmigos.insertAdjacentHTML("beforeend", pessoas.map(cardHTML).join(""));
}

function mostrarLoadingLeve() {
  if (!listaAmigos) return;

  listaAmigos.innerHTML =
    '<div class="empty-search"><img src="/public/img/loading.gif"></div>';
}

function mostrarErro() {
  if (!listaAmigos) return;

  listaAmigos.innerHTML =
    '<div class="empty-search">Não foi possível buscar agora. Tente novamente.</div>';
}


// ==============================
// "ADICIONAR" (pedido de amizade) — o card inteiro leva ao perfil
// ==============================

async function adicionar(uid, botao) {
  const eu = auth.currentUser?.uid;

  if (!eu || !uid || eu === uid) return;

  botao.disabled = true;
  botao.textContent = "Enviando...";

  try {
    const ref = doc(db, "friendRequests", `${eu}_${uid}`);

    if (!(await getDoc(ref)).exists()) {
      await setDoc(ref, {
        from: eu,
        to: uid,
        status: "pending",
        createdAt: serverTimestamp()
      });
    }

    botao.textContent = "Enviado";
    botao.classList.add("sent");

    const pessoa = estado.pessoas.find((p) => p.uid === uid);

    if (pessoa) {
      pessoa.sent = true;
      persistirEstado();
    }
  } catch (error) {
    console.error("Erro ao enviar pedido de amizade:", error);

    botao.disabled = false;
    botao.textContent = "Adicionar";
  }
}

listaAmigos?.addEventListener("click", (e) => {
  const botao = e.target.closest(".follow-btn");

  if (!botao) return; // fora do botão, o link do card abre o perfil

  e.preventDefault();
  e.stopPropagation();

  if (botao.disabled) return;

  adicionar(botao.closest(".user")?.dataset.uid, botao);
});


// ==============================
// ESTADO + HISTÓRICO
// ==============================

function aplicarEstado(pessoas, fila) {
  estado.pessoas = pessoas.slice();
  estado.fila = (fila || []).slice();
  estado.vistos = new Set(pessoas.map((p) => p.uid));
  estado.acabou = false;

  registrarVistos(pessoas);
}

function registrarVistos(pessoas) {
  const recentes = new Set(estado.historico);

  pessoas.forEach((p) => recentes.add(p.uid));

  estado.historico = [...recentes].slice(-HISTORY_MAX);
}


// ==============================
// BUSCA (inicial / igual a mim / específica)
// ==============================

async function buscar({ tipo = "inicial" } = {}) {
  const versao = ++estado.versao;

  const req = tipo === "especifica"
    ? { filters: coletarFiltros() }
    : { similar: true };

  const chave = JSON.stringify(req);

  chaveAtual = chave;
  autoSeguidas = 0;

  if (tipo !== "inicial") {
    usuarioRolou = false;

    window.scrollTo({ top: 0 });

    if (listaAmigos) listaAmigos.scrollTop = 0;
  }

  // Cold start: pinta na hora o que você viu por último e atualiza em seguida
  let pintouCache = false;

  if (tipo === "inicial") {
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
    const dados = await chamar({ mode: "search", ...req });

    if (versao !== estado.versao) return;

    const pessoas = dados.people || [];
    const fila = dados.queue || [];

    // "Igual a mim": mostra seus dados nos inputs equivalentes
    if (tipo === "similar" && dados.me?.fields) {
      preencherFiltros(dados.me.fields);
    }

    // o usuário já está rolando a lista em cache: não troca nada na frente
    // dele, só guarda o resultado novo para a próxima abertura
    if (pintouCache && usuarioRolou) {
      salvarCache(chave, pessoas, fila);
      return;
    }

    aplicarEstado(pessoas, fila);

    renderizar(estado.pessoas);

    persistirEstado();
  } catch (error) {
    console.error("Erro na busca:", error.code, error.message, error.details);

    if (!pintouCache && versao === estado.versao) mostrarErro();
  } finally {
    if (versao === estado.versao) {
      estado.carregando = false;

      agendarVerificacao();
    }
  }
}


// ==============================
// CARREGAR MAIS (24 por pedido, ao passar de 70% do scroll)
// ==============================

async function carregarMais() {
  if (estado.carregando || estado.acabou || !estado.pessoas.length) return;

  estado.carregando = true;
  autoSeguidas++;

  const versao = estado.versao;

  try {
    let novas = [];

    if (estado.fila.length) {
      // próximos da fila: o servidor já ordenou, do mais para o menos parecido
      const lote = estado.fila.splice(0, PAGE_SIZE);
      const scores = new Map(lote.map((item) => [item.uid, item.score]));

      const dados = await chamar({
        mode: "profiles",
        uids: lote.map((item) => item.uid)
      });

      novas = (dados.people || []).map((p) => ({
        ...p,
        score: scores.get(p.uid) ?? p.score
      }));
    } else {
      // acabaram os parecidos: o servidor completa com pessoas variadas
      const exclude = [
        ...new Set([...estado.vistos, ...estado.historico])
      ].slice(-400);

      const dados = await chamar({ mode: "random", exclude });

      novas = dados.people || [];

      if (novas.length < PAGE_SIZE) estado.acabou = true;
    }

    if (versao !== estado.versao) return;

    novas = novas.filter((p) => !estado.vistos.has(p.uid));

    novas.forEach((p) => estado.vistos.add(p.uid));

    estado.pessoas.push(...novas);

    registrarVistos(novas);

    anexar(novas);

    persistirEstado();
  } catch (error) {
    console.error("Erro ao carregar mais pessoas:", error.code, error.message, error.details);
  } finally {
    if (versao === estado.versao) {
      estado.carregando = false;

      agendarVerificacao();
    }
  }
}


// ==============================
// SCROLL: 70%
// ==============================

// o que rola pode ser a janela ou um contêiner (.grid-view, .friends-list...)
function encontrarScroller() {
  let el = listaAmigos;

  while (el && el !== document.body && el !== document.documentElement) {
    const overflowY = getComputedStyle(el).overflowY;

    if ((overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight) {
      return el;
    }

    el = el.parentElement;
  }

  return document.scrollingElement || document.documentElement;
}

function progressoDoScroll() {
  const el = encontrarScroller();

  if (!el.scrollHeight) return 1;

  return (el.scrollTop + el.clientHeight) / el.scrollHeight;
}

function verificarScroll() {
  // lista escondida (filtros abertos): não adianta pedir mais
  if (!listaAmigos || !listaAmigos.offsetParent) return;

  if (usuarioRolou === false && autoSeguidas >= MAX_AUTO) return;

  if (progressoDoScroll() >= LOAD_AT) carregarMais();
}

let verificacaoPendente = false;

function agendarVerificacao() {
  if (verificacaoPendente) return;

  verificacaoPendente = true;

  requestAnimationFrame(() => {
    verificacaoPendente = false;
    verificarScroll();
  });
}

document.addEventListener(
  "scroll",
  () => {
    usuarioRolou = true;
    autoSeguidas = 0;

    agendarVerificacao();
  },
  { capture: true, passive: true }
);


// ==============================
// BOTÕES
// ==============================

// "Igual a mim": preenche os inputs com o seu perfil e busca com idade e
// localização aproximadas
btnIgualAMim?.addEventListener("click", () => {
  closeSearch();
  buscar({ tipo: "similar" });
});

// "Buscar": só o que está nos inputs, sem idade
btnBuscar?.addEventListener("click", () => {
  closeSearch();
  buscar({ tipo: "especifica" });
});


// ==============================
// AUTENTICAÇÃO / COLD START
// ==============================

let iniciou = false;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    iniciou = false;
    estado.versao++;

    console.warn("Nenhum usuário autenticado.");
    return;
  }

  setCurrentUserId(user.uid);

  if (iniciou) return;

  iniciou = true;

  buscar({ tipo: "inicial" });
});
