import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Configuração do Firebase
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
const auth = getAuth(app);

// Abrir/fechar modal de post
window.abrirPostModal = function() {
  const modal = document.getElementById('postModal');
  if (modal) {
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }
};
window.fecharPostModal = function() {
  const modal = document.getElementById('postModal');
  if (modal) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
    document.getElementById('postModalText').value = '';
    document.getElementById('postModalImg').value = '';
    document.getElementById('postModalImg').style.display = 'none';
  }
};

// Botão "Criar" abre o modal
document.addEventListener('DOMContentLoaded', function() {
  document.querySelectorAll('.postmodal').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      window.abrirPostModal();
    });
  });

  // Só mostra input de imagem ao clicar no ícone
  const btnAddImage = document.getElementById('btnAddImage');
  const inputImg = document.getElementById('postModalImg');
  if (btnAddImage && inputImg) {
    btnAddImage.addEventListener('click', function() {
      inputImg.style.display = inputImg.style.display === 'none' ? 'block' : 'none';
      if (inputImg.style.display === 'block') inputImg.focus();
    });
  }
});

// Busca dados extras do usuário logado
async function getUserDataForPost(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      return userDoc.data();
    }
  } catch (e) {}
  return {};
}

// Enviar post
window.enviarPostModal = async function() {
  const texto = document.getElementById('postModalText').value.trim();
  const imgUrl = document.getElementById('postModalImg').value.trim();
  let usuarioLogado = auth.currentUser;

  if (!usuarioLogado || !usuarioLogado.uid) {
    alert('Você precisa estar logado para postar. Tente atualizar a página.');
    return;
  }
  if (!texto) {
    alert('Digite algo para postar!');
    return;
  }

  const userData = await getUserDataForPost(usuarioLogado.uid);

  const postId = `post-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const postData = {
    content: texto,
    img: imgUrl || '',
    likes: 0,
    saves: 0,
    postid: postId,
    creatorid: usuarioLogado.uid,
    creatorUsername: userData.username || "",
    creatorName: userData.displayname || "",
    creatorPhoto: userData.userphoto || usuarioLogado.photoURL || "",
    reports: 0,
    create: new Date()
  };

  await setDoc(doc(db, 'users', usuarioLogado.uid, 'posts', postId), postData);
  await setDoc(doc(db, 'posts', postId), postData);

  window.fecharPostModal();
  alert('Post enviado com sucesso!');
  if (typeof window.loadPosts === 'function') window.loadPosts();
};




