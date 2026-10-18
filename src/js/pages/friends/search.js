import { t } from "/src/i18n/i18n.js";
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

const PAGE_SIZE = 24;
const LOAD_AT = 0.7;
const MAX_AUTO = 6;

const CACHE_KEY = "friends_seen_v2";
const CACHE_TTL = 6 * 60 * 60 * 1000;
const CACHE_MAX_PEOPLE = 100;
const CACHE_MAX_QUEUE = 150;
const HISTORY_MAX = 300;

const functions = getFunctions(app, "us-central1");

const searchPeople = httpsCallable(functions, "searchPeople");

const listaAmigos = document.querySelector(".friends-list");

const btnIgualAMim = document.querySelector(".search-btn.sec");
const btnBuscar = document.querySelector(".search-btn:not(.sec)");

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

async function chamar(payload) {
  const resposta = await searchPeople(payload);
  return resposta.data || {};
}

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
  const nome = pessoa.name || username || t("common.user");
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
          ${pessoa.sent ? t("friends.sent") : t("common.add")}
        </button>
      </div>
    </a>
  `;
}

function renderizar(pessoas) {
  if (!listaAmigos) return;

  if (!pessoas.length) {
    listaAmigos.innerHTML =
      `<div class="empty-search">${t("friends.noPeople")}</div>`;
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
    `<div class="empty-search">${t("friends.searchError")}</div>`;
}

async function adicionar(uid, botao) {
  const eu = auth.currentUser?.uid;

  if (!eu || !uid || eu === uid) return;

  botao.disabled = true;
  botao.textContent = t("friends.sending");

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

    botao.textContent = t("friends.sent");
    botao.classList.add("sent");

    const pessoa = estado.pessoas.find((p) => p.uid === uid);

    if (pessoa) {
      pessoa.sent = true;
      persistirEstado();
    }
  } catch (error) {
    console.error("Erro ao enviar pedido de amizade:", error);

    botao.disabled = false;
    botao.textContent = t("common.add");
  }
}

listaAmigos?.addEventListener("click", (e) => {
  const botao = e.target.closest(".follow-btn");

  if (!botao) return;

  e.preventDefault();
  e.stopPropagation();

  if (botao.disabled) return;

  adicionar(botao.closest(".user")?.dataset.uid, botao);
});

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

    if (tipo === "similar" && dados.me?.fields) {
      preencherFiltros(dados.me.fields);
    }

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

async function carregarMais() {
  if (estado.carregando || estado.acabou || !estado.pessoas.length) return;

  estado.carregando = true;
  autoSeguidas++;

  const versao = estado.versao;

  try {
    let novas = [];

    if (estado.fila.length) {
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

btnIgualAMim?.addEventListener("click", () => {
  closeSearch();
  buscar({ tipo: "similar" });
});

btnBuscar?.addEventListener("click", () => {
  closeSearch();
  buscar({ tipo: "especifica" });
});

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
