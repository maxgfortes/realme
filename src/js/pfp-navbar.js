import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

function carregarFotoPerfil() {
  const navPic = document.getElementById('nav-pic');
  const defaultPic = './src/icon/default.jpg';

  // --- PASSO 1: CARREGAMENTO IMEDIATO (CACHE) ---
  // Tenta pegar a URL que salvamos na última vez que ele entrou
  const cachedPhoto = localStorage.getItem('user_photo_cache');
  if (cachedPhoto) {
    navPic.src = cachedPhoto;
  }

  // --- PASSO 2: VALIDAÇÃO EM SEGUNDO PLANO ---
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userId = user.uid;
      try {
        const userMediaRef = doc(db, `users/${userId}/user-infos/user-media`);
        const userMediaSnap = await getDoc(userMediaRef);

        if (userMediaSnap.exists()) {
          const userPhoto = userMediaSnap.data().userphoto || defaultPic;

          // Se a foto do banco for diferente da foto que está no cache agora
          if (userPhoto !== cachedPhoto) {
            navPic.src = userPhoto; // Atualiza a imagem na tela
            localStorage.setItem('user_photo_cache', userPhoto); // Atualiza o cache para a próxima vez
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
      // Se não está logado, limpa o cache e volta pra padrão
      navPic.src = defaultPic;
      localStorage.removeItem('user_photo_cache');
    }
  });
}

document.addEventListener('DOMContentLoaded', carregarFotoPerfil);