import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getAuth, 
  onAuthStateChanged, 
  signInAnonymously 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  addDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// --- CONFIG FIREBASE ---
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

let currentUserId = null;
let targetUserId = null;

// --- AUTH ---
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    await carregarPerfil();
  } else {
    // login anônimo (apenas visualizar)
    await signInAnonymously(auth);
  }
});

// --- PERFIL ---
async function carregarPerfil() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username");

  let userDoc;

  if (usernameParam) {
    const q = query(collection(db, "users"), where("username", "==", usernameParam));
    const snap = await getDocs(q);
    if (snap.empty) {
      document.getElementById("nomeCompleto").textContent = "Usuário não encontrado";
      return;
    }
    userDoc = snap.docs[0];
    targetUserId = userDoc.id;
  } else if (currentUserId) {
    userDoc = await getDoc(doc(db, "users", currentUserId));
    targetUserId = currentUserId;
  }

  if (!userDoc.exists()) return;

  const dados = userDoc.data();

  // Header
  const displayname = `${dados.displayname}`.trim();
  document.getElementById("nomeCompleto").textContent = displayname || "Usuário sem nome";
  document.getElementById("username").textContent = `@${dados.username || ""}`;
  document.querySelector(".profile-pic").src = dados.userphoto || "./src/icon/default.jpg";
  document.getElementById("user-location").textContent = dados.location || "Não informado";

  // Sobre (visão geral)
  const aboutRef = doc(db, `users/${targetUserId}/users-infos/about`);
  const aboutSnap = await getDoc(aboutRef);
  const about = aboutSnap.exists() ? aboutSnap.data() : {};
  document.getElementById("overview").textContent = about.overview || "Nenhuma informação";
  document.getElementById("genero").textContent = about.gender || "Não informado";

  // Gostos
  const likesRef = doc(db, `users/${targetUserId}/user-infos/likes`);
  const likesSnap = await getDoc(likesRef);
  const likes = likesSnap.exists() ? likesSnap.data() : {};
  document.getElementById("gostos-title").textContent = `Gostos de ${dados.username || "usuário"}`;
  // exemplo de binding
  // document.getElementById("likes-music").textContent = likes.music || "Nenhuma música listada";

  // Estatísticas
  await atualizarEstatisticasPerfil();

  // Depoimentos
  await carregarDepoimentos();

  // Links
  await carregarLinks();
}

// --- ESTATÍSTICAS ---
async function atualizarEstatisticasPerfil() {
  const postsRef = collection(db, `users/${targetUserId}/posts`);
  const postsSnap = await getDocs(postsRef);
  document.querySelector(".profile-stats strong").textContent = postsSnap.size;
}

// --- DEPOIMENTOS ---
async function carregarDepoimentos() {
  const container = document.querySelector(".deps-tab .about-container");
  container.innerHTML = "<p>Carregando depoimentos...</p>";

  const depoRef = collection(db, `users/${targetUserId}/depoimentos`);
  const q = query(depoRef, orderBy("criadoem", "desc"));
  const snap = await getDocs(q);

  container.innerHTML = "";

  if (snap.empty) {
    container.innerHTML = "<p>Nenhum depoimento encontrado.</p>";
    return;
  }

  snap.forEach(docSnap => {
    const d = docSnap.data();
    const el = document.createElement("div");
    el.className = "about-box";
    el.innerHTML = `
      <p><strong>${d.autorNome || "Anônimo"}</strong> disse:</p>
      <p>${d.conteudo}</p>
    `;
    container.appendChild(el);
  });
}

// --- LINKS ---
async function carregarLinks() {
  const container = document.querySelector(".links-tab .about-container");
  container.innerHTML = "<p>Carregando links...</p>";

  const userSnap = await getDoc(doc(db, "users", targetUserId));
  if (!userSnap.exists()) {
    container.innerHTML = "<p>Usuário sem links</p>";
    return;
  }

  const links = userSnap.data().links || {};
  container.innerHTML = "";

  if (Object.keys(links).length === 0) {
    container.innerHTML = "<p>Nenhum link disponível</p>";
    return;
  }

  Object.entries(links).forEach(([key, url]) => {
    const el = document.createElement("div");
    el.className = "link-box";
    el.innerHTML = `<a href="${url}" target="_blank">${key}</a>`;
    container.appendChild(el);
  });
}
