import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── Firebase (reutiliza instância existente) ─────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Giphy ────────────────────────────────────────────────────────────────────
// TODO: troque pela sua key. Idealmente isso não fica hardcoded no client
// (dá pra ver a key no devtools) — o ideal a médio prazo é ter uma rota no
// seu backend que faz a busca e repassa o resultado. Pra já funcionar, deixo
// direto aqui igual você já faz com o firebaseConfig.
const GIPHY_API_KEY = "SUA_GIPHY_API_KEY_AQUI";
const GIPHY_SEARCH_URL = "https://api.giphy.com/v1/gifs/search";

const DEFAULT_COLOR = "#FFE9A8";
const NOTE_MAX_LEN  = 120;

// ─── Estado ───────────────────────────────────────────────────────────────────
let currentUser   = null;
let selectedColor = DEFAULT_COLOR;
let selectedGif   = null; // { url, previewUrl }
let gifSearchTimer = null;

// ─── Cache local (user_cache_<uid>) ──────────────────────────────────────────
function lerCacheLocal(uid) {
  try {
    const raw = localStorage.getItem(`user_cache_${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const val = parsed?.value ?? parsed;
    if (val?.username || val?.userphoto) return val;
    return null;
  } catch { return null; }
}

// ─── Dados do usuário: cache → Firestore ─────────────────────────────────────
async function buscarDadosUsuario(uid) {
  const cached = lerCacheLocal(uid);
  if (cached) {
    return {
      username: cached.username || "usuário",
      photo:    cached.userphoto || "./public/img/default.jpg"
    };
  }
  try {
    const [mediaSnap, dataSnap] = await Promise.all([
      getDoc(doc(db, "users", uid, "user-infos", "user-media")),
      getDoc(doc(db, "users", uid, "user-infos", "user-data"))
    ]);
    return {
      photo:    mediaSnap.exists() ? (mediaSnap.data().userphoto || mediaSnap.data().pfp || "./public/img/default.jpg") : "./public/img/default.jpg",
      username: dataSnap.exists()  ? (dataSnap.data().username   || "usuário") : "usuário"
    };
  } catch {
    return { photo: "./public/img/default.jpg", username: "usuário" };
  }
}

// ─── 24h helper ──────────────────────────────────────────────────────────────
function dentroDe24h(ts) {
  if (!ts) return false;
  let ms;
  if (ts instanceof Timestamp)                   ms = ts.toMillis();
  else if (typeof ts === "object" && ts.seconds) ms = ts.seconds * 1000;
  else                                           ms = new Date(ts).getTime();
  return (Date.now() - ms) < 24 * 60 * 60 * 1000;
}

// ─── Buscar nota de um uid ────────────────────────────────────────────────────
async function buscarNota(uid) {
  try {
    const snap = await getDoc(doc(db, "notes", uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!dentroDe24h(data.createdAt)) return null;
    return data;
  } catch { return null; }
}

// ─── Buscar amigos (seguimento mútuo: followers ∩ following) ─────────────────
async function buscarAmigos(uid) {
  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getDocs(collection(db, "users", uid, "followers")),
      getDocs(collection(db, "users", uid, "following")),
    ]);
    const followersSet = new Set(followersSnap.docs.map(d => d.id));
    return followingSnap.docs
      .filter(d => followersSet.has(d.id))
      .map(d => d.id);
  } catch { return []; }
}

// ─── Navegar para perfil ──────────────────────────────────────────────────────
function irParaPerfil(username) {
  if (username && username !== "usuário") {
    window.location.href = `profile.html?u=${username}`;
  }
}

// ─── Monta o innerHTML do card de nota (usado pra mim e pros amigos) ─────────
function montarConteudoNota({ text, color, gifUrl }) {
  const bg = color || DEFAULT_COLOR;
  const gifHtml = gifUrl
    ? `<div class="note-item-gif-wrap"><img src="${gifUrl}" alt="" loading="lazy"></div>`
    : "";
  return { bg, gifHtml };
}

// ─── Atualiza o meu feeling-item e a foto/nome no modal ──────────────────────
async function atualizarMeuItem(user) {
  const myItem = document.querySelector(".feeling-item.my-feeling");
  if (!myItem) return;

  const { photo, username } = await buscarDadosUsuario(user.uid);

  const pfpWrapper = myItem.querySelector(".note-pfp");
  const pfpImg     = myItem.querySelector(".note-pfp-border img");
  if (pfpImg) pfpImg.src = photo;
  if (pfpWrapper) {
    pfpWrapper.style.cursor = "pointer";
    pfpWrapper.onclick = () => irParaPerfil(username);
  }

  const nameEl = myItem.querySelector(".note-username");
  if (nameEl) nameEl.textContent = username;

  const modalImg  = document.querySelector(".pfp-modal-feeling img");
  const modalName = document.querySelector(".username-modal-feeling");
  if (modalImg) modalImg.src = photo;
  if (modalName) modalName.textContent = username;

  const border = myItem.querySelector(".humor-note-border");
  const noteEl = myItem.querySelector(".humor-note");

  const nota = await buscarNota(user.uid);

  if (nota) {
    const { bg, gifHtml } = montarConteudoNota(nota);
    if (border) border.style.background = bg;
    if (noteEl) {
      noteEl.innerHTML = `${gifHtml}<span>${escapeHtml(nota.text || "")}</span>`;
      noteEl.classList.remove("placeholder");
    }
    if (border) {
      border.onclick = null;
      configurarLongPress(border, () => deletarMinhaNote(user.uid, border, noteEl));
    }
  } else {
    if (border) border.style.background = "";
    if (noteEl) {
      noteEl.textContent = "Como você está se sentindo?";
      noteEl.classList.add("placeholder");
    }
    if (border) {
      border._longPressCleanup?.();
      border.onclick = () => abrirModal();
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ─── Long press (600ms) ───────────────────────────────────────────────────────
function configurarLongPress(element, callback) {
  element._longPressCleanup?.();

  let timer = null;
  let moved  = false;

  const start  = () => { moved = false; timer = setTimeout(() => { if (!moved) { navigator.vibrate?.(40); callback(); } }, 600); };
  const cancel = () => clearTimeout(timer);
  const move   = () => { moved = true; clearTimeout(timer); };

  element.addEventListener("touchstart",  start,  { passive: true });
  element.addEventListener("touchend",    cancel, { passive: true });
  element.addEventListener("touchmove",   move,   { passive: true });
  element.addEventListener("mousedown",   start);
  element.addEventListener("mouseup",     cancel);
  element.addEventListener("mouseleave",  cancel);

  element._longPressCleanup = () => {
    element.removeEventListener("touchstart",  start);
    element.removeEventListener("touchend",    cancel);
    element.removeEventListener("touchmove",   move);
    element.removeEventListener("mousedown",   start);
    element.removeEventListener("mouseup",     cancel);
    element.removeEventListener("mouseleave",  cancel);
  };
}

// ─── Deletar minha nota ───────────────────────────────────────────────────────
async function deletarMinhaNote(uid, border, noteEl) {
  try {
    await deleteDoc(doc(db, "notes", uid));
    if (border) border.style.background = "";
    if (noteEl) {
      noteEl.textContent = "Como você está se sentindo?";
      noteEl.classList.add("placeholder");
    }
    border?._longPressCleanup?.();
    if (border) border.onclick = () => abrirModal();
  } catch (e) {
    console.error("[notes] Erro ao deletar:", e);
  }
}

// ─── Modal: abrir / fechar / reset ───────────────────────────────────────────
function abrirModal() {
  resetModal();
  document.getElementById("feeling-overlay")?.classList.add("active");
}

function fecharModal() {
  document.getElementById("feeling-overlay")?.classList.remove("active");
}

function resetModal() {
  selectedColor = DEFAULT_COLOR;
  selectedGif   = null;

  const textInput = document.getElementById("note-text-input");
  if (textInput) textInput.value = "";
  atualizarContadorChars();

  document.querySelectorAll(".note-color-btn").forEach(b =>
    b.classList.toggle("selected", b.dataset.color === DEFAULT_COLOR)
  );

  const gifInput = document.getElementById("gif-search-input");
  if (gifInput) gifInput.value = "";
  const gifResults = document.getElementById("gif-results");
  if (gifResults) gifResults.innerHTML = "";
  const clearBtn = document.getElementById("gif-clear-btn");
  if (clearBtn) clearBtn.hidden = true;

  atualizarPreview();
}

// ─── Preview ao vivo dentro do modal ──────────────────────────────────────────
function atualizarPreview() {
  const preview     = document.getElementById("note-preview");
  const previewText = document.getElementById("note-preview-text");
  const gifWrap      = document.getElementById("note-preview-gif-wrap");
  const gifImg        = document.getElementById("note-preview-gif");

  const textInput = document.getElementById("note-text-input");
  const text = textInput ? textInput.value.trim() : "";

  if (preview) preview.style.background = selectedColor;

  if (previewText) {
    if (text) {
      previewText.textContent = text;
      previewText.classList.remove("placeholder");
    } else {
      previewText.textContent = "Como você está se sentindo?";
      previewText.classList.add("placeholder");
    }
  }

  if (selectedGif && gifWrap && gifImg) {
    gifImg.src = selectedGif.previewUrl;
    gifWrap.hidden = false;
  } else if (gifWrap) {
    gifWrap.hidden = true;
  }
}

function atualizarContadorChars() {
  const textInput = document.getElementById("note-text-input");
  const counter   = document.getElementById("note-char-count");
  if (textInput && counter) counter.textContent = String(textInput.value.length);
}

// ─── Giphy: busca e seleção ───────────────────────────────────────────────────
async function buscarGifs(query) {
  const resultsEl = document.getElementById("gif-results");
  if (!resultsEl) return;

  if (!query) {
    resultsEl.innerHTML = "";
    return;
  }

  resultsEl.innerHTML = `<div class="gif-results-empty">Buscando...</div>`;

  try {
    const url = `${GIPHY_SEARCH_URL}?api_key=${encodeURIComponent(GIPHY_API_KEY)}&q=${encodeURIComponent(query)}&limit=12&rating=pg-13&lang=pt`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Giphy respondeu ${resp.status}`);
    const data = await resp.json();

    const gifs = (data.data || []).map(g => ({
      id: g.id,
      previewUrl: g.images?.fixed_height_small?.url || g.images?.fixed_height?.url,
      url: g.images?.fixed_height?.url || g.images?.original?.url
    })).filter(g => g.previewUrl && g.url);

    if (!gifs.length) {
      resultsEl.innerHTML = `<div class="gif-results-empty">Nenhum gif encontrado</div>`;
      return;
    }

    resultsEl.innerHTML = "";
    gifs.forEach(gif => {
      const img = document.createElement("img");
      img.src = gif.previewUrl;
      img.loading = "lazy";
      img.alt = "gif";
      img.classList.toggle("selected", selectedGif?.id === gif.id);
      img.addEventListener("click", () => selecionarGif(gif));
      resultsEl.appendChild(img);
    });
  } catch (e) {
    console.error("[notes] Erro ao buscar gifs:", e);
    resultsEl.innerHTML = `<div class="gif-results-empty">Erro ao buscar gifs</div>`;
  }
}

function selecionarGif(gif) {
  selectedGif = gif;
  document.querySelectorAll("#gif-results img").forEach(img =>
    img.classList.toggle("selected", img.src === gif.previewUrl)
  );
  const clearBtn = document.getElementById("gif-clear-btn");
  if (clearBtn) clearBtn.hidden = false;
  atualizarPreview();
}

function removerGif() {
  selectedGif = null;
  document.querySelectorAll("#gif-results img.selected").forEach(img => img.classList.remove("selected"));
  const clearBtn = document.getElementById("gif-clear-btn");
  if (clearBtn) clearBtn.hidden = true;
  atualizarPreview();
}

// ─── Configura toda a interação do modal ─────────────────────────────────────
function configurarModal() {
  // ── Texto ─────────────────────────────────────────────────────────────────
  const textInput = document.getElementById("note-text-input");
  if (textInput) {
    textInput.addEventListener("input", () => {
      atualizarContadorChars();
      atualizarPreview();
    });
  }

  // ── Cores ────────────────────────────────────────────────────────────────
  document.querySelectorAll(".note-color-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".note-color-btn.selected").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedColor = btn.dataset.color;
      atualizarPreview();
    });
  });

  // ── Busca de gif (debounced) ────────────────────────────────────────────
  const gifInput = document.getElementById("gif-search-input");
  if (gifInput) {
    gifInput.addEventListener("input", () => {
      clearTimeout(gifSearchTimer);
      const query = gifInput.value.trim();
      gifSearchTimer = setTimeout(() => buscarGifs(query), 400);
    });
  }

  const gifClearBtn = document.getElementById("gif-clear-btn");
  if (gifClearBtn) gifClearBtn.addEventListener("click", removerGif);

  // ── Botão enviar ─────────────────────────────────────────────────────────
  const enviarBtn = document.getElementById("enviarFeeling");
  if (enviarBtn) {
    enviarBtn.addEventListener("click", async () => {
      const textInput = document.getElementById("note-text-input");
      const text = textInput ? textInput.value.trim() : "";

      if (!text && !selectedGif) {
        const shakes = ["-5px", "5px", "-4px", "4px", "0px"];
        enviarBtn.style.transition = "transform 0.07s";
        for (const x of shakes) {
          enviarBtn.style.transform = `translateX(${x})`;
          await new Promise(r => setTimeout(r, 60));
        }
        return;
      }

      enviarBtn.disabled    = true;
      enviarBtn.textContent = "Enviando...";
      await enviarNota({ text, color: selectedColor, gif: selectedGif });
      fecharModal();
      enviarBtn.disabled    = false;
      enviarBtn.textContent = "Enviar";
    });
  }

  // ── Botão cancelar ───────────────────────────────────────────────────────
  document.getElementById("cancelarFeeling")?.addEventListener("click", fecharModal);

  // ── Fechar clicando fora do modal ────────────────────────────────────────
  document.getElementById("feeling-overlay")?.addEventListener("click", e => {
    if (e.target.id === "feeling-overlay") fecharModal();
  });
}

// ─── Enviar nota ao Firestore ─────────────────────────────────────────────────
async function enviarNota({ text, color, gif }) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "notes", currentUser.uid), {
      text:      text.slice(0, NOTE_MAX_LEN),
      color:     color || DEFAULT_COLOR,
      gifUrl:    gif?.url || null,
      creatorId: currentUser.uid,
      createdAt: serverTimestamp()
    });
    await atualizarMeuItem(currentUser);
  } catch (e) {
    console.error("[notes] Erro ao enviar nota:", e);
  }
}

// ─── Renderizar notas dos amigos ──────────────────────────────────────────────
async function renderizarNotasAmigos(uid) {
  const container = document.querySelector(".feelings-stories");
  if (!container) return;

  container.querySelectorAll(".feeling-item:not(.my-feeling)").forEach(el => el.remove());

  const amigosIds = await buscarAmigos(uid);
  if (!amigosIds.length) return;

  const resultados = await Promise.all(
    amigosIds.map(async amigoId => {
      const nota = await buscarNota(amigoId);
      if (!nota) return null;
      const info = await buscarDadosUsuario(amigoId);
      return { ...nota, ...info, uid: amigoId };
    })
  );

  resultados.filter(Boolean).forEach(({ text, color, gifUrl, username, photo }) => {
    const { bg, gifHtml } = montarConteudoNota({ text, color, gifUrl });
    const card = document.createElement("div");
    card.className = "feeling-item";
    card.innerHTML = `
      <div class="note-user-infos">
        <div class="note-pfp" style="cursor:pointer">
          <div class="note-pfp-border">
            <img src="${photo}" alt="${username}" loading="lazy">
          </div>
        </div>
        <div class="note-username">${username}</div>
      </div>
      <div class="humor-note-border" style="background:${bg}">
        <div class="humor-note">${gifHtml}<span>${escapeHtml(text || "")}</span></div>
      </div>
    `;
    card.querySelector(".note-pfp").addEventListener("click", () => irParaPerfil(username));
    container.appendChild(card);
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  configurarModal();

  onAuthStateChanged(auth, async user => {
    if (!user) return;
    currentUser = user;
    await atualizarMeuItem(user);
    await renderizarNotasAmigos(user.uid);
  });

  const openBtn = document.getElementById("create-feeling-btn");
  openBtn?.addEventListener("click", () => abrirModal());
});