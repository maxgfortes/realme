import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Config Firebase
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

// Utilitário para buscar dados do usuário
async function getUserData(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return null;
  const data = userDoc.data();

  // Busca a foto em /users/{uid}/user-infos/user-media
  let userphoto = "./src/icon/default.jpg";
  try {
    const mediaDoc = await getDoc(doc(db, "users", uid, "user-infos", "user-media"));
    if (mediaDoc.exists()) {
      const mediaData = mediaDoc.data();
      if (mediaData.userphoto) userphoto = mediaData.userphoto;
    }
  } catch (e) {}

  return {
    displayname: data.displayname || "",
    username: data.username || "",
    userphoto
  };
}

// Função para pegar parâmetros da URL
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

// Renderiza uma lista (seguidores, seguindo, amigos)
async function renderUserList(listType, userId) {
  let listContainer;

  if (listType === "followers") {
    listContainer = document.querySelector(".list-seguidores .completelist");
  } else if (listType === "following") {
    listContainer = document.querySelector(".list-seguindo .completelist");
  } else if (listType === "friends") {
    listContainer = document.querySelector(".list-amigos .completelist");
  }

  if (!listContainer) return;

  listContainer.innerHTML = `
  <div class="loading-spinner">
    <div class="spinner"></div>
  </div>
  `;

  let uids = [];

  // --- LISTAR SEGUIDORES ---
  if (listType === "followers") {
    const snap = await getDocs(collection(db, "users", userId, "followers"));
    uids = snap.docs.map(d => d.id);
  }

  // --- LISTAR SEGUINDO ---
  else if (listType === "following") {
    const snap = await getDocs(collection(db, "users", userId, "following"));
    uids = snap.docs.map(d => d.id);
  }

  // --- LISTAR AMIGOS (mutuamente seguindo) ---
  else if (listType === "friends") {
    const followersSnap = await getDocs(collection(db, "users", userId, "followers"));
    const followingSnap = await getDocs(collection(db, "users", userId, "following"));

    const followers = followersSnap.docs.map(d => d.id);
    const following = followingSnap.docs.map(d => d.id);

    // INTERSEÇÃO → quem segue e é seguido
    uids = followers.filter(uid => following.includes(uid));
  }

  if (uids.length === 0) {
    listContainer.innerHTML = '<div class="no-comments">Nenhum usuário encontrado.</div>';
    return;
  }

  let html = "";
  const usuarioLogado = auth.currentUser?.uid;

  for (const uid of uids) {
    const userData = await getUserData(uid);
    if (!userData) continue;

    html += `
      <div class="user-list">
        <div class="user-item">
          <a href="PF.html?userid=${uid}" class="user-link" style="display: contents;">
            <img src="${userData.userphoto}" alt="Avatar do Usuário" class="user-avatar" onerror="this.src='./src/icon/default.jpg'">
            <div class="user-info">
              <span class="user-name">${userData.displayname}</span>
              <span class="user-username">@${userData.username}</span>
            </div>
          </a>
        </div>
      </div>
    `;
  }

  listContainer.innerHTML = html;
}


// Remove usuário da lista (exemplo para seguidores)
async function removerUsuario(uid, type, currentUserId) {
  if (!uid || !type || !currentUserId) return;
  let ref1, ref2;
  if (type === "followers") {
    // Remove o seguidor da minha lista de seguidores
    ref1 = doc(db, "users", currentUserId, "followers", uid);
    // Remove eu da lista de seguindo do outro usuário
    ref2 = doc(db, "users", uid, "following", currentUserId);
  } else if (type === "following") {
    // Remove o usuário da minha lista de seguindo
    ref1 = doc(db, "users", currentUserId, "following", uid);
    // Remove eu da lista de seguidores do outro usuário
    ref2 = doc(db, "users", uid, "followers", currentUserId);
  } else if (type === "friends") {
    // Remove amizade dos dois lados
    ref1 = doc(db, "users", currentUserId, "friends", uid);
    ref2 = doc(db, "users", uid, "friends", currentUserId);
  }
  if (ref1) await deleteDoc(ref1);
  if (ref2) await deleteDoc(ref2);
  // Atualiza a lista
  renderUserList(type, currentUserId);
}


// Inicialização
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  // Pega o userid da URL ou do usuário logado
  const userId = getUrlParam("userid") || user.uid;

  // Busca o displayname do usuário da lista
  let displayName = "você";
  const userDoc = await getDoc(doc(db, "users", userId));
  if (userDoc.exists()) {
    displayName = userDoc.data().displayname || userDoc.data().username || "usuário";
  }

  // Atualiza o nome do usuário nas listas
  document.querySelectorAll(".list-header p").forEach(p => {
    p.textContent = `de ${displayName}`;
  });

  // Renderiza as listas
  renderUserList("followers", userId);
  renderUserList("following", userId);
  renderUserList("friends", userId);

  // Remove usuário da lista imediatamente, sem confirmação
  document.body.addEventListener("click", async (e) => {
    if (e.target.classList.contains("remove")) {
      const uid = e.target.getAttribute("data-uid");
      const type = e.target.getAttribute("data-type");
      await removerUsuario(uid, type, userId);
    }
  });
});