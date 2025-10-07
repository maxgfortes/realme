import { 
  getFirestore, 
  collection, 
  query, 
  orderBy, 
  startAt, 
  endAt, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Inicialize o Firestore aqui se ainda não o fez.
// Exemplo: const db = getFirestore(app);

async function performSearch(db, searchTerm, resultsList) {
  const term = searchTerm.trim().toLowerCase();
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

// Exemplo de como usar a função:
// Supondo que 'db' já esteja inicializado e os elementos HTML existam.
/*
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('searchResults');
const searchButton = document.querySelector('.search-box button');

if (searchInput && resultsList && searchButton) {
  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    performSearch(db, searchInput.value, resultsList);
  });

  searchInput.addEventListener('input', () => {
    performSearch(db, searchInput.value, resultsList);
  });
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-area')) {
      resultsList.classList.remove('visible');
    }
  });
}
*/