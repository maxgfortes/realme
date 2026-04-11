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

// ─── Textos por sentimento ────────────────────────────────────────────────────
const FEELING_TEXTS = {
  "Feliz":      "está se sentindo feliz",
  "Ansioso":    "está se sentindo ansioso...",
  "Triste":     "está se sentindo triste...",
  "Apatico":    "está se sentindo apático...",
  "Bravo":      "está bravo hoje",
  "Cansado":    "está se sentindo cansado...",
  "Chateado":   "está chateado hoje",
  "Alegre":     "está se sentindo alegre",
  "Pensativo":  "está pensativo...",
  "Depressivo": "está depressivo...",
  "Medo":       "está com medo...",
  "Nostalgico": "está bem nostálgico..."
};

// ─── Estado ───────────────────────────────────────────────────────────────────
let currentUser     = null;
let selectedFeeling = null;

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
      photo:    cached.userphoto || "./src/img/default.jpg"
    };
  }
  try {
    const [mediaSnap, dataSnap] = await Promise.all([
      getDoc(doc(db, "users", uid, "user-infos", "user-media")),
      getDoc(doc(db, "users", uid, "user-infos", "user-data"))
    ]);
    return {
      photo:    mediaSnap.exists() ? (mediaSnap.data().userphoto || "./src/img/default.jpg") : "./src/img/default.jpg",
      username: dataSnap.exists()  ? (dataSnap.data().username   || "usuário")               : "usuário"
    };
  } catch {
    return { photo: "./src/img/default.jpg", username: "usuário" };
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
    const snap = await getDoc(doc(db, "feelingNotes", uid));
    if (!snap.exists()) return null;
    const data = snap.data();
    if (!dentroDe24h(data.createdAt)) return null;
    return data;
  } catch { return null; }
}

// ─── Buscar amigos ────────────────────────────────────────────────────────────
async function buscarAmigos(uid) {
  try {
    const snap = await getDocs(collection(db, "users", uid, "friends"));
    return snap.docs.map(d => d.id);
  } catch { return []; }
}

// ─── Navegar para perfil ──────────────────────────────────────────────────────
function irParaPerfil(username) {
  if (username && username !== "usuário") {
    window.location.href = `profile.html?u=${username}`;
  }
}

// ─── Atualiza o meu feeling-item ──────────────────────────────────────────────
async function atualizarMeuItem(user) {
  const myItem = document.querySelector(".feeling-item.my-feeling");
  if (!myItem) return;

  const { photo, username } = await buscarDadosUsuario(user.uid);

  // pfp — clique vai para meu próprio perfil
  const pfpWrapper = myItem.querySelector(".note-pfp");
  const pfpImg     = myItem.querySelector(".note-pfp-border img");
  if (pfpImg) pfpImg.src = photo;
  if (pfpWrapper) {
    pfpWrapper.style.cursor = "pointer";
    pfpWrapper.onclick = () => irParaPerfil(username);
  }

  const nameEl = myItem.querySelector(".note-username");
  if (nameEl) nameEl.textContent = username;

  const border = myItem.querySelector(".humor-note-border");
  const noteEl = myItem.querySelector(".humor-note");

  const nota = await buscarNota(user.uid);

  if (nota) {
    if (noteEl) {
      noteEl.textContent = `${nota.text || FEELING_TEXTS[nota.feeling] || nota.feeling}`;
      noteEl.classList.remove("placeholder");
    }
    border.onclick = null;
    configurarLongPress(border, () => deletarMinhaNote(user.uid, border, noteEl));
  } else {
    if (noteEl) {
      noteEl.textContent = "Como você está se sentindo?";
      noteEl.classList.add("placeholder");
    }
    border._longPressCleanup?.();
    border.onclick = () => abrirModal();
  }
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
    await deleteDoc(doc(db, "feelingNotes", uid));
    if (noteEl) {
      noteEl.textContent = "Como você está se sentindo?";
      noteEl.classList.add("placeholder");
    }
    border._longPressCleanup?.();
    border.onclick = () => abrirModal();
  } catch (e) {
    console.error("[feeling-notes] Erro ao deletar:", e);
  }
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function abrirModal() {
  document.getElementById("feeling-overlay")?.classList.add("active");
}

function fecharModal() {
  document.getElementById("feeling-overlay")?.classList.remove("active");
  // Remove selected de todos os botões e reseta variável
  document.querySelectorAll(".feeling-btn.selected").forEach(b => b.classList.remove("selected"));
  selectedFeeling = null;
}

function configurarModal() {
  // ── Seleção dos feelings: adiciona/remove classe "selected" ──────────────
  document.querySelectorAll(".feeling-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      // Remove selected de todos
      document.querySelectorAll(".feeling-btn.selected").forEach(b => b.classList.remove("selected"));
      // Adiciona no clicado
      btn.classList.add("selected");
      selectedFeeling = btn.textContent.trim();
    });
  });

  // ── Botão enviar (clone para limpar listeners inline do HTML) ────────────
  const enviarOriginal = document.getElementById("enviarFeeling");
  if (enviarOriginal) {
    const enviarBtn = enviarOriginal.cloneNode(true);
    enviarOriginal.replaceWith(enviarBtn);

    enviarBtn.addEventListener("click", async () => {
      if (!selectedFeeling) {
        // Shake visual indicando que precisa selecionar
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
      await enviarNota(selectedFeeling);
      fecharModal();
      enviarBtn.disabled    = false;
      enviarBtn.textContent = "Enviar";
    });
  }

  // ── Botão cancelar (clone para limpar listeners inline do HTML) ──────────
  const cancelarOriginal = document.getElementById("cancelarFeeling");
  if (cancelarOriginal) {
    const cancelarBtn = cancelarOriginal.cloneNode(true);
    cancelarOriginal.replaceWith(cancelarBtn);
    cancelarBtn.addEventListener("click", fecharModal);
  }

  // ── Fechar clicando fora do modal ────────────────────────────────────────
  document.getElementById("feeling-overlay")?.addEventListener("click", e => {
    if (e.target.id === "feeling-overlay") fecharModal();
  });
}

// ─── Enviar nota ao Firestore ─────────────────────────────────────────────────
async function enviarNota(feeling) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "feelingNotes", currentUser.uid), {
      feeling,
      text:      FEELING_TEXTS[feeling] || feeling,
      creatorId: currentUser.uid,
      createdAt: serverTimestamp()
    });
    await atualizarMeuItem(currentUser);
  } catch (e) {
    console.error("[feeling-notes] Erro ao enviar nota:", e);
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

  resultados.filter(Boolean).forEach(({ text, feeling, username, photo }) => {
    const displayText = text || FEELING_TEXTS[feeling] || feeling || "...";
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
      <div class="humor-note-border">
        <div class="humor-note">${displayText}</div>
      </div>
    `;
    // Clique na pfp do amigo → perfil dele
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
});