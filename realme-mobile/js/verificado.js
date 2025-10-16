import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Inicialize o Firebase se necessário
// const app = initializeApp(firebaseConfig); // se já não estiver inicializado
const db = getFirestore();

// Função para obter o userid (igual ao seu padrão)
function determinarUsuarioParaCarregar() {
  const params = new URLSearchParams(window.location.search);
  const useridParam = params.get("userid");
  if (useridParam) return useridParam;
  // Se quiser usar o usuário logado, adicione aqui
  return null;
}

// Função para criar ou atualizar a tag de verificado
function atualizarTagVerificado(userid) {
  const nameLine = document.querySelector('.name-line');
  if (!nameLine) return;

  // Remove qualquer tag existente
  const oldTag = nameLine.querySelector('.verificado');
  if (oldTag) oldTag.remove();

  // Busca no Firebase
  const userRef = doc(db, "users", userid);
  getDoc(userRef).then(snap => {
    if (snap.exists() && snap.data().verificado === true) {
      // Cria o elemento
      const span = document.createElement('span');
      span.className = 'verificado';
      span.style.display = 'inline-block';
      span.innerHTML = '<i class="fas fa-check-circle"></i>';
      // Insere após o nome
      const displayName = nameLine.querySelector('.profile-name');
      if (displayName) {
        displayName.insertAdjacentElement('afterend', span);
      } else {
        nameLine.appendChild(span);
      }
    }
  });
}

// Chame após o DOM estar pronto
document.addEventListener("DOMContentLoaded", () => {
  const userid = determinarUsuarioParaCarregar();
  if (userid) atualizarTagVerificado(userid);
});