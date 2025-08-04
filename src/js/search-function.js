// search-functionality.js
import { db } from './firebase-config.js';
import {
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ===================
// FUNCIONALIDADE DE BUSCA
// ===================
export function initializeSearch() {
  const searchInput = document.getElementById('searchInput');
  const resultsList = document.getElementById('searchResults');
  const searchButton = document.querySelector('.search-box button');

  if (!searchInput || !resultsList || !searchButton) {
    console.warn('Elementos de busca não encontrados');
    return;
  }

  async function performSearch() {
    const term = searchInput.value.trim().toLowerCase();
    resultsList.innerHTML = '';
    resultsList.classList.remove('visible');

    if (!term) return;

    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('username'), startAt(term), endAt(term + '\uf8ff'));

    try {
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        resultsList.innerHTML = '<li>Nenhum usuário encontrado</li>';
        resultsList.classList.add('visible');
        return;
      }

      snapshot.forEach(docSnap => {
        const user = docSnap.data();
        const li = document.createElement('li');
        li.textContent = user.username;
        li.addEventListener('click', () => {
          window.location.href = `PF.html?username=${user.username}`;
        });
        resultsList.appendChild(li);
      });

      resultsList.classList.add('visible');
    } catch (err) {
      console.error('Erro na busca:', err);
      resultsList.innerHTML = '<li>Erro na busca</li>';
      resultsList.classList.add('visible');
    }
  }

  // Event Listeners
  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    performSearch();
  });

  searchInput.addEventListener('input', performSearch);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-area')) {
      resultsList.classList.remove('visible');
    }
  });

  console.log('Funcionalidade de busca inicializada');
}