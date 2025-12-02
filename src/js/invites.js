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

// ======================
// FIREBASE
// ======================
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const db = getFirestore(app);
const auth = getAuth(app);

// ======================================================
// COPIAR LINK -> SEM BOTÃO COMPARTILHAR
// ======================================================
function copiarConvite(btn, codigo) {
  const url = `${location.origin}/index.html?convite=${codigo}`;

  navigator.clipboard.writeText(url)
    .then(() => {
      btn.innerHTML = '<i class="fas fa-check"></i>';
      btn.disabled = true;

      setTimeout(() => {
        btn.innerHTML = '<i class="fas fa-copy"></i>';
        btn.disabled = false;
      }, 2000);
    })
    .catch(() => {
      // Fallback se o navegador bloquear
      const textarea = document.createElement("textarea");
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();

      alert("Link copiado:\n" + url);
    });
}

window.copiarConvite = copiarConvite;

// ======================================================
// BUSCAR INFORMAÇÃO DE QUEM USOU O CONVITE
// ======================================================
async function getUserInfo(userid) {
  if (!userid) return null;
  try {
    const ref = doc(db, "users", userid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const d = snap.data();
    return {
      displayname: d.displayname || "",
      username: d.username || "",
      userphoto: d.userphoto || "./src/icon/default.jpg"
    };
  } catch {
    return null;
  }
}

// ======================================================
// MARQUEE ÚLTIMO USUÁRIO
// ======================================================
async function atualizarMarqueeUltimoUsuario() {
  const ref = doc(db, "lastupdate", "latestUser");
  const snap = await getDoc(ref);
  const marquee = document.querySelector(".marquee");

  if (!marquee) return;

  if (snap.exists()) {
    marquee.textContent = `${snap.data().username} acabou de entrar no RealMe!`;
  } else {
    marquee.textContent = "Bem-vindo ao RealMe!";
  }
}

document.addEventListener("DOMContentLoaded", atualizarMarqueeUltimoUsuario);

// ======================================================
// LISTAR CONVITES
// ======================================================
async function mostrarConvites(userid) {
  const container = document.querySelector(".invites-container");
  const infoSpan = document.querySelector(".info-container h2 span");

  if (!container) return;

  container.innerHTML = `<div class="progress-bar" id="progressBar"></div>`;

  const q = query(collection(db, "invites"), where("criadoPor", "==", userid));
  const snap = await getDocs(q);

  if (snap.empty) {
    container.innerHTML = "Você ainda não possui convites.";
    if (infoSpan) infoSpan.textContent = "0";
    return;
  }

  container.innerHTML = "";
  let convitesRestantes = 0;

  for (const docu of snap.docs) {
    const convite = docu.data();
    const codigo = docu.id;
    const usado = convite.usado === true;

    let usadoPorInfo = null;

    if (usado && convite.usadoPor) {
      usadoPorInfo = await getUserInfo(convite.usadoPor);
    } else {
      convitesRestantes++;
    }

    // BLOCO DO CONVITE
    const bloco = document.createElement("div");
    bloco.className = "invite-tab";

    bloco.innerHTML = `
      <div class="invitebody">

        <div class="invite-code">
          <h3>${codigo}</h3>
          <div class="invite-code-row">
            ${
              usado
                ? ""
                : `
              <button class="invite-copy-btn"
                onclick="copiarLinkConvite(this, '${codigo}')">
                <i class="fas fa-copy"></i>
              </button>
            `
            }
          </div>
        </div>

        <div class="usedby">
          <p>Convite usado por: ${
            usado && usadoPorInfo
              ? `
              <span>
                <img src="${usadoPorInfo.userphoto}" class="invite-user-photo"
                     onerror="this.src='./src/icon/default.jpg'">
                <span class="invite-user-name">${usadoPorInfo.displayname}</span>
                <span class="invite-user-username">@${usadoPorInfo.username}</span>
              </span>
            `
              : "<span>Ninguém ainda</span>"
          }</p>
        </div>

      </div>
    `;

    container.appendChild(bloco);
  }

  if (infoSpan) infoSpan.textContent = convitesRestantes;
}

// ======================================================
// AUTH
// ======================================================
onAuthStateChanged(auth, user => {
  if (user) mostrarConvites(user.uid);
});
