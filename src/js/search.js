
import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  onDisconnect, 
  serverTimestamp,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  limit,
  startAfter,
  deleteDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);

// ===================
// FUNCIONALIDADE DE BUSCA (mantida igual)
// ===================
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('searchResults');
const searchButton = document.querySelector('.search-box button');

if (searchInput && resultsList && searchButton) {
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
    li.textContent = user.username || user.displayname || user.uid;
    li.addEventListener('click', () => {
      window.location.href = `PF.html?userid=${user.uid}`;
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
}