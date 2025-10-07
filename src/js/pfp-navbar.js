import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic'); // Elemento da foto de perfil na navbar

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userId = user.uid; // Obtém o ID do usuário logado
      try {
        // Busca a URL da foto de perfil no Firestore
        const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
        const userMediaSnap = await getDoc(userMediaRef);

        if (userMediaSnap.exists()) {
          const userPhoto = userMediaSnap.data().userphoto || './src/icon/default.jpg';
          navPic.src = userPhoto; // Atualiza a foto de perfil na navbar
        } else {
          console.warn('Foto de perfil não encontrada. Usando a padrão.');
          navPic.src = './src/icon/default.jpg';
        }
      } catch (error) {
        console.error('Erro ao carregar a foto de perfil:', error);
        navPic.src = './src/icon/default.jpg'; // Usa a foto padrão em caso de erro
      }
    } else {
      console.warn('Usuário não autenticado.');
      navPic.src = './src/icon/default.jpg'; // Usa a foto padrão se não estiver logado
    }
  });
}

// Chama a função ao carregar a página
document.addEventListener('DOMContentLoaded', carregarFotoPerfil);