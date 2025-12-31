import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, collection, getDocs, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

/* ===============================
   CONFIG FIREBASE
================================ */
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

/* ===============================
   DETECTA MOBILE
================================ */
function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
    || window.innerWidth <= 768;
}

/* ===============================
   BUSCAR DADOS DO USUÁRIO
================================ */
async function getUserData(uid) {
  const userDoc = await getDoc(doc(db, "users", uid));
  if (!userDoc.exists()) return null;

  const data = userDoc.data();
  let userphoto = "./src/icon/default.jpg";

  try {
    const mediaDoc = await getDoc(
      doc(db, "users", uid, "user-infos", "user-media")
    );
    if (mediaDoc.exists() && mediaDoc.data().userphoto) {
      userphoto = mediaDoc.data().userphoto;
    }
  } catch (e) {}

  return {
    displayname: data.displayname || "",
    username: data.username || "",
    userphoto
  };
}

/* ===============================
   PARÂMETROS DA URL
================================ */
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

/* ===============================
   RENDERIZA LISTAS
================================ */
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

  if (listType === "followers") {
    const snap = await getDocs(collection(db, "users", userId, "followers"));
    uids = snap.docs.map(d => d.id);
  } 
  else if (listType === "following") {
    const snap = await getDocs(collection(db, "users", userId, "following"));
    uids = snap.docs.map(d => d.id);
  } 
  else if (listType === "friends") {
    const followersSnap = await getDocs(collection(db, "users", userId, "followers"));
    const followingSnap = await getDocs(collection(db, "users", userId, "following"));

    const followers = followersSnap.docs.map(d => d.id);
    const following = followingSnap.docs.map(d => d.id);

    uids = followers.filter(uid => following.includes(uid));
  }

  if (uids.length === 0) {
    listContainer.innerHTML =
      '<div class="no-comments">Nenhum usuário encontrado.</div>';
    return;
  }

  const profilePage = isMobile() ? "PFmobile.html" : "PF.html";
  let html = "";

  for (const uid of uids) {
    const userData = await getUserData(uid);
    if (!userData) continue;

    html += `
      <div class="user-list">
        <div class="user-item">
          <a href="${profilePage}?userid=${uid}" 
             class="user-link" style="display: contents;">
            <img src="${userData.userphoto}" 
                 alt="Avatar do Usuário" 
                 class="user-avatar"
                 onerror="this.src='./src/icon/default.jpg'">
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

/* ===============================
   REMOVER USUÁRIO
================================ */
async function removerUsuario(uid, type, currentUserId) {
  if (!uid || !type || !currentUserId) return;

  let ref1, ref2;

  if (type === "followers") {
    ref1 = doc(db, "users", currentUserId, "followers", uid);
    ref2 = doc(db, "users", uid, "following", currentUserId);
  } 
  else if (type === "following") {
    ref1 = doc(db, "users", currentUserId, "following", uid);
    ref2 = doc(db, "users", uid, "followers", currentUserId);
  } 
  else if (type === "friends") {
    ref1 = doc(db, "users", currentUserId, "friends", uid);
    ref2 = doc(db, "users", uid, "friends", currentUserId);
  }

  if (ref1) await deleteDoc(ref1);
  if (ref2) await deleteDoc(ref2);

  renderUserList(type, currentUserId);
}

/* ===============================
   INIT
================================ */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userId = getUrlParam("userid") || user.uid;

  let displayName = "você";
  const userDoc = await getDoc(doc(db, "users", userId));
  if (userDoc.exists()) {
    displayName =
      userDoc.data().displayname ||
      userDoc.data().username ||
      "usuário";
  }

  document.querySelectorAll(".list-header p").forEach(p => {
    p.textContent = `de ${displayName}`;
  });

  renderUserList("followers", userId);
  renderUserList("following", userId);
  renderUserList("friends", userId);

  document.body.addEventListener("click", async (e) => {
    if (e.target.classList.contains("remove")) {
      const uid = e.target.getAttribute("data-uid");
      const type = e.target.getAttribute("data-type");
      await removerUsuario(uid, type, userId);
    }
  });
});
