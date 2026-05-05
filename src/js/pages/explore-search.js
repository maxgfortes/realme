import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── Firebase (ifriendmatch) ───────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// Aguarda o Firebase restaurar a sessão antes de qualquer query.
// Sem isso, o token de auth ainda não está pronto e o Firestore
// rejeita a leitura com "Missing or insufficient permissions".
const authReady = new Promise(resolve => {
  const unsub = onAuthStateChanged(auth, user => {
    unsub();       // escuta só uma vez
    resolve(user); // null = não logado, User = logado
  });
});

// ─── Cache de busca (sessionStorage — dura enquanto a aba estiver aberta) ──
const SEARCH_CACHE_PREFIX = "search_cache_";
const SEARCH_CACHE_TTL    = 5 * 60 * 1000; // 5 minutos

function getCached(term) {
  try {
    const raw = sessionStorage.getItem(SEARCH_CACHE_PREFIX + term);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > SEARCH_CACHE_TTL) {
      sessionStorage.removeItem(SEARCH_CACHE_PREFIX + term);
      return null;
    }
    return data;
  } catch { return null; }
}

function setCache(term, data) {
  try {
    sessionStorage.setItem(
      SEARCH_CACHE_PREFIX + term,
      JSON.stringify({ ts: Date.now(), data })
    );
  } catch { /* quota exceeded — ignora */ }
}

// ─── Cache de fotos de perfil (Map em memória) ─────────────────────────────
const photoCache = new Map();

async function getPhoto(userId) {
  if (photoCache.has(userId)) return photoCache.get(userId);
  try {
    const snap = await getDoc(doc(db, "users", userId, "user-infos", "user-media"));
    const photo = snap.exists()
      ? (snap.data().pfp || snap.data().userphoto || "../public/img/default.jpg")
      : "../public/img/default.jpg";
    photoCache.set(userId, photo);
    return photo;
  } catch {
    return "../public/img/default.jpg";
  }
}

// ─── Elementos do DOM ──────────────────────────────────────────────────────
const inputs      = document.querySelectorAll("#searchInput");
const resultsList = document.getElementById("searchResults");

if (!resultsList) {
  console.warn("[explore-search] #searchResults não encontrado.");
} else {
  initSearch();
}

function initSearch() {
  let debounceTimer = null;

  inputs.forEach(input => {
    input.addEventListener("input", () => {
      // Espelha valor no outro input (mobile <-> pc)
      inputs.forEach(other => { if (other !== input) other.value = input.value; });

      clearTimeout(debounceTimer);
      const term = input.value.trim().toLowerCase();

      if (!term) {
        hideResults();
        return;
      }

      debounceTimer = setTimeout(() => performSearch(term), 300);
    });

    input.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        inputs.forEach(i => { i.value = ""; });
        hideResults();
      }
    });
  });

  document.addEventListener("click", e => {
    const dentroInput   = [...inputs].some(i => i.contains(e.target));
    const dentroResults = resultsList.contains(e.target);
    if (!dentroInput && !dentroResults) hideResults();
  });
}

// ─── Busca principal ───────────────────────────────────────────────────────
async function performSearch(term) {
  showLoading();

  // 1. Cache primeiro — não precisa de auth
  const cached = getCached(term);
  if (cached) {
    renderResults(cached, term);
    return;
  }

  // 2. Garante que o token de auth está pronto antes da query
  const user = await authReady;
  if (!user) {
    resultsList.innerHTML = `<li class="no-results">Faça login para buscar usuários.</li>`;
    resultsList.classList.add("visible");
    return;
  }

  // 3. Query no Firestore — prefix match por username
  try {
    const q = query(
      collection(db, "users"),
      orderBy("username"),
      startAt(term),
      endAt(term + "\uf8ff")
    );
    const snapshot = await getDocs(q);

    const results = [];
    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      results.push({
        id:          docSnap.id,
        username:    d.username    || "",
        displayName: d.displayName || d.displayname || d.name || d.username || "Usuário",
        photo:       null
      });
    });

    setCache(term, results);
    renderResults(results, term);

  } catch (err) {
    console.error("[explore-search] Erro na busca:", err);
    resultsList.innerHTML = `<li class="no-results">Erro ao buscar. Tente novamente.</li>`;
    resultsList.classList.add("visible");
  }
}

// ─── Renderização ──────────────────────────────────────────────────────────
function renderResults(results, term) {
  resultsList.innerHTML = "";

  if (results.length === 0) {
    resultsList.innerHTML = `<li class="no-results">Nenhum usuário encontrado para "<strong>${escapeHtml(term)}</strong>"</li>`;
    resultsList.classList.add("visible");
    return;
  }

  results.forEach(user => {
    const li = document.createElement("li");
    li.className = "search-result-item";
    li.innerHTML = `
      <img
        src="../public/img/default.jpg"
        alt="${escapeHtml(user.displayName)}"
        class="search-user-photo"
      />
      <div class="search-user-info">
        <span class="search-user-name">${escapeHtml(user.displayName)}</span>
        <span class="search-user-username">@${escapeHtml(user.username)}</span>
      </div>
    `;

    li.addEventListener("click", () => {
      window.location.href = `profile.html?username=${encodeURIComponent(user.username)}`;
    });

    resultsList.appendChild(li);
    loadPhotoLazy(li.querySelector("img"), user.id);
  });

  resultsList.classList.add("visible");
}

// ─── Foto lazy ─────────────────────────────────────────────────────────────
async function loadPhotoLazy(imgEl, userId) {
  const photo = await getPhoto(userId);
  if (photo && photo !== "../public/img/default.jpg") {
    const tmp = new Image();
    tmp.onload = () => {
      imgEl.src = photo;
      imgEl.classList.add("loaded");
    };
    tmp.src = photo;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function showLoading() {
  resultsList.innerHTML = `
    <li class="search-loading">
      <div class="spinner"></div>
      <span>Buscando...</span>
    </li>
  `;
  resultsList.classList.add("visible");
}

function hideResults() {
  resultsList.classList.remove("visible");
  resultsList.innerHTML = "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = '../public/img/default.jpg';

  // Carregamento imediato do cache
  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto) {
    navPic.src = cachedPhoto;
  }

  // Validação em segundo plano
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userId = user.uid;
      try {
        const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
        const userMediaSnap = await getDoc(userMediaRef);

        if (userMediaSnap.exists()) {
          const userPhoto = userMediaSnap.data().userphoto || defaultPic;

          if (userPhoto !== cachedPhoto) {
            navPic.src = userPhoto;
            localStorage.setItem('user_photo_cache', userPhoto);
          }
        } else {
          navPic.src = defaultPic;
          localStorage.removeItem('user_photo_cache');
        }
      } catch (error) {
        console.error('Erro ao buscar foto:', error);
        if (!cachedPhoto) navPic.src = defaultPic;
      }
    } else {
      navPic.src = defaultPic;
      localStorage.removeItem('user_photo_cache');
    }
  });
}

document.addEventListener('DOMContentLoaded', carregarFotoPerfil);