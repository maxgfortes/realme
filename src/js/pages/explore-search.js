import { collection, query, orderBy, startAt, endAt, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "../../config/config.js";

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const cancelSearchArea = document.getElementById("cancelSearchArea");
const cancelSearchBtn = document.getElementById("cancelSearchBtn");

const usersRef = collection(db, "users");
const RECENT_SEARCHES_KEY = "realme_recent_searches";
const MAX_RECENT_SEARCHES = 20;
const DEFAULT_PHOTO = "../public/img/default.jpg";

let searchTimer = null;

searchInput.addEventListener("focus", () => {
  searchResults.classList.add("visible");
  cancelSearchArea.classList.add("active");

  if (!searchInput.value.trim()) {
    renderRecentSearches();
  }
});

cancelSearchBtn.addEventListener("click", () => {
  searchInput.value = "";
  searchResults.innerHTML = "";
  searchResults.classList.remove("visible");
  cancelSearchArea.classList.remove("active");
  searchInput.blur();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  const term = searchInput.value.trim().toLowerCase();

  if (!term) {
    renderRecentSearches();
    return;
  }

  searchTimer = setTimeout(() => searchUsers(term), 300);
});

async function searchUsers(term) {
  searchResults.innerHTML = `
    <div class="search-loading">
      <div class="spinner"></div>
      <span>Buscando...</span>
    </div>
  `;

  try {
    const queries = [
      searchField("username", term),
      searchField("name", term),
      searchField("surname", term)
    ];

    const snapshots = await Promise.all(queries.map(q => getDocs(q)));
    const users = new Map();

    snapshots.forEach(snapshot => {
      snapshot.forEach(docSnap => {
        if (users.has(docSnap.id)) return;

        const data = docSnap.data();

        users.set(docSnap.id, {
          id: docSnap.id,
          username: data.username || "",
          name: data.name || "",
          surname: data.surname || ""
        });
      });
    });

    const results = Array.from(users.values()).filter(user => {
      const username = user.username.toLowerCase();
      const name = user.name.toLowerCase();
      const surname = user.surname.toLowerCase();
      const fullName = `${name} ${surname}`.trim();

      return (
        username.includes(term) ||
        name.includes(term) ||
        surname.includes(term) ||
        fullName.includes(term)
      );
    });

    renderResults(results);
  } catch (error) {
    console.error("[explore-search]", error);

    searchResults.innerHTML = `
      <div class="no-results">Erro ao buscar usuários.</div>
    `;
  }
}

function searchField(field, term) {
  return query(
    usersRef,
    orderBy(field),
    startAt(term),
    endAt(term + "\uf8ff")
  );
}

async function renderResults(users) {
  searchResults.innerHTML = "";

  if (!users.length) {
    searchResults.innerHTML = `
      <div class="no-results">Nenhum usuário encontrado.</div>
    `;
    return;
  }

  users.forEach(async user => {
    const li = document.createElement("div");
    li.className = "search-result-item";

    const fullName =
      `${user.name} ${user.surname}`.trim() ||
      user.username ||
      "Usuário";

    li.innerHTML = `
      <img src="${DEFAULT_PHOTO}" alt="${escapeHtml(fullName)}" class="search-user-photo"   onerror="this.onerror=null; this.src='${DEFAULT_PHOTO}';">

      <div class="search-user-info">
        <span class="search-user-name">${escapeHtml(fullName)}</span>
        <span class="search-user-username">${escapeHtml(user.username)}</span>
      </div>
    `;

    searchResults.appendChild(li);

    const img = li.querySelector(".search-user-photo");
    const photo = await getUserPhoto(user.id);

    if (photo) img.src = photo;

    li.addEventListener("click", async () => {
      const photo = await getUserPhoto(user.id);

      saveRecentSearch({
        ...user,
        photo
      });

      window.location.href =
        `profile.html?username=${encodeURIComponent(user.username)}`;
    });
  });
}

function getRecentSearches() {
  try {
    const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!saved) return [];

    const data = JSON.parse(saved);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(user) {
  let recent = getRecentSearches();

  recent = recent.filter(item => item.id !== user.id);

  recent.unshift({
    id: user.id,
    username: user.username,
    name: user.name,
    surname: user.surname,
    photo: user.photo || DEFAULT_PHOTO
  });

  recent = recent.slice(0, MAX_RECENT_SEARCHES);

  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent)
  );
}

async function renderRecentSearches() {
  const recent = getRecentSearches();

  searchResults.innerHTML = "";

  if (!recent.length) return;

  const title = document.createElement("div");
  title.className = "searchTitle";
  title.textContent = "Recentes";
  searchResults.appendChild(title);

  recent.forEach(user => {
    const li = document.createElement("div");
    li.className = "search-result-item";

    const fullName =
      `${user.name} ${user.surname}`.trim() ||
      user.username ||
      "Usuário";

    li.innerHTML = `
      <img src="${escapeHtml(user.photo || DEFAULT_PHOTO)}" alt="${escapeHtml(fullName)}" class="search-user-photo"   onerror="this.onerror=null; this.src='${DEFAULT_PHOTO}';">

      <div class="search-user-info">
        <span class="search-user-name">${escapeHtml(fullName)}</span>
        <span class="search-user-username">${escapeHtml(user.username)}</span>
      </div>
    `;

    searchResults.appendChild(li);

    li.addEventListener("click", () => {
      saveRecentSearch(user);

      window.location.href =
        `profile.html?username=${encodeURIComponent(user.username)}`;
    });
  });
}

async function getUserPhoto(uid) {
  try {
    const photoRef = doc(
      db,
      "users",
      uid,
      "user-infos",
      "user-media"
    );

    const snapshot = await getDoc(photoRef);

    if (!snapshot.exists()) {
      return DEFAULT_PHOTO;
    }

    return snapshot.data().userphoto || DEFAULT_PHOTO;
  } catch {
    return DEFAULT_PHOTO;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}