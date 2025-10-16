import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501895e3de",
  measurementId: "G-D96BEW6RC3"
};

let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}
const db = getFirestore(app);
const auth = getAuth(app);

function copiarConvite(btn, codigo) {
  navigator.clipboard.writeText(codigo);
  btn.classList.add('copied');
  btn.disabled = true;
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.disabled = false;
  }, 6000);
}

async function getUserInfo(userid) {
  if (!userid) return null;
  try {
    const userRef = doc(db, "users", userid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return null;
    const data = userSnap.data();
    return {
      displayname: data.displayname || "",
      username: data.username || "",
      userphoto: data.userphoto || "./src/icon/default.jpg"
    };
  } catch {
    return null;
  }
}

async function atualizarMarqueeUltimoUsuario() {
  const lastUpdateRef = doc(db, "lastupdate", "latestUser");
  const docSnap = await getDoc(lastUpdateRef);
  const marquee = document.querySelector(".marquee");
  if (!marquee) return;
  if (docSnap.exists()) {
    const data = docSnap.data();
    const nomeUsuario = data.username || "Usuário";
    marquee.textContent = `${nomeUsuario} acabou de entrar no RealMe!`;
  } else {
    marquee.textContent = "Bem-vindo ao RealMe!";
  }
}

document.addEventListener('DOMContentLoaded', atualizarMarqueeUltimoUsuario);

async function mostrarConvites(userid) {
  const container = document.querySelector('.invites-container');
  const infoSpan = document.querySelector('.info-container h2 span');
  if (!container) return;
  container.innerHTML = `<div class="progress-bar" id="progressBar"></div>`;
  const q = query(collection(db, "invites"), where("criadoPor", "==", userid));
  const snap = await getDocs(q);
  if (snap.empty) {
    container.innerHTML = 'Você ainda não possui convites.';
    if (infoSpan) infoSpan.textContent = "0";
    return;
  }
  container.innerHTML = '';
  let convitesRestantes = 0;
  let idx = 1;
  for (const docu of snap.docs) {
    const convite = docu.data();
    const usado = convite.usado === true;
    const codigo = docu.id;
    let usadoPorInfo = null;
    if (usado && convite.usadoPor) {
      usadoPorInfo = await getUserInfo(convite.usadoPor);
    } else {
      convitesRestantes++;
    }
    const bloco = document.createElement('div');
    bloco.className = 'invite-tab';
    bloco.innerHTML = `
      <div class="invitebody">
        <div class="invite-code">
        <h3>${codigo}</h3>
        <div class="invite-code-row">
          ${!usado ? `<button class="invite-copy-btn" onclick="copiarConvite(this, '${codigo}')"><i class="fas fa-copy"></i></button>` : ''}
        </div>
        </div>
        <div class="usedby">
          <p>Convite usado por: ${
            usado && usadoPorInfo ? `
              <span>
                <img src="${usadoPorInfo.userphoto}" alt="Foto" class="invite-user-photo" onerror="this.src='./src/icon/default.jpg'">
                <span class="invite-user-name">${usadoPorInfo.displayname}</span>
                <span class="invite-user-username">@${usadoPorInfo.username}</span>
              </span>
            ` : `<span>Ninguém ainda</span>`
          }</p>
        </div>
      </div>
    `;
    container.appendChild(bloco);
    idx++;
  }
  if (infoSpan) infoSpan.textContent = convitesRestantes;
}

window.copiarConvite = copiarConvite;

onAuthStateChanged(auth, user => {
  if (user) mostrarConvites(user.uid);
});