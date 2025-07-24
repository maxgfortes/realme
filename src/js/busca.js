// busca.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Sua configuração Firebase
const firebaseConfig = {
  apiKey: "AIzaSyD1mLsKEpVUvsOsnzaoNmaEHzsNM6ORGqc",
  authDomain: "itext-realme.firebaseapp.com",
  projectId: "itext-realme",
  storageBucket: "itext-realme.firebasestorage.app",
  messagingSenderId: "540414487794",
  appId: "1:540414487794:web:3dca30a050d6b5e131746b",
  measurementId: "G-E9DL66RH8G"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Elementos do DOM
const btnBuscar = document.getElementById('btnBuscar');
const inputBuscar = document.getElementById('inputBuscar');
const resultadosBusca = document.getElementById('resultadosBusca');

btnBuscar.addEventListener('click', async () => {
  const texto = inputBuscar.value.trim().toLowerCase();

  resultadosBusca.innerHTML = 'Buscando...';

  if (!texto) {
    resultadosBusca.innerHTML = 'Digite algo para buscar.';
    return;
  }

  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("usernameLower", "==", texto));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      resultadosBusca.innerHTML = 'Nenhum usuário encontrado.';
      return;
    }

    let html = '<ul>';
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      html += `<li><a href="PF.html?user=${doc.id}">${data.username}</a></li>`;
    });
    html += '</ul>';
    resultadosBusca.innerHTML = html;

  } catch (error) {
    console.error('Erro na busca:', error);
    resultadosBusca.innerHTML = 'Erro ao buscar usuários.';
  }
});
