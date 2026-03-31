
// ================= FIREBASE =================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
  Timestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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
const auth = getAuth(app);
const db = getFirestore(app);

/* ================= UI ================= */
function showError(msg) {
  const el = document.querySelector(".error-message");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  } else {
    alert(msg);
  }
}

function showSuccess(msg) {
  const el = document.querySelector(".success-message");
  if (el) {
    el.textContent = msg;
    el.style.display = "block";
  } else {
    alert(msg);
  }
}

function hideMessages() {
  document.querySelector(".error-message")?.style.setProperty("display", "none");
  document.querySelector(".success-message")?.style.setProperty("display", "none");
}

function showLoading(show, loadingText = "Processando...") {
  const btn = document.querySelector('.form-section button[type="submit"]');
  if (btn) {
    if (show) {
      btn.dataset.originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = loadingText;
    } else {
      btn.disabled = false;
      btn.textContent = btn.dataset.originalText || "Criar Conta";
    }
  }
}

/* ================= VALIDAÇÕES ================= */
const validarEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validarUsername = u => /^[a-z0-9_]{3,20}$/.test(u);
const validarSenha = s => s.length >= 6;
const validarNascimento = d => {
  const n = new Date(d);
  const hoje = new Date();
  return hoje.getFullYear() - n.getFullYear() >= 13;
};

/* ================= CADASTRO ================= */
async function criarContaSegura(event) {
  event.preventDefault();
  hideMessages();

  const nome = document.getElementById("nome")?.value.trim();
  const sobrenome = document.getElementById("sobrenome")?.value.trim();
  const username = document.getElementById("usuario")?.value.trim().toLowerCase();
  const email = document.getElementById("email")?.value.trim().toLowerCase();
  const senha = document.getElementById("senha")?.value;
  const nascimento = document.getElementById("nascimento")?.value;
  const genero = document.getElementById("genero")?.value;

  if (!nome || !sobrenome || !username || !email || !senha || !nascimento || !genero) {
    return showError("Preencha todos os campos.");
  }

  if (!validarEmail(email)) return showError("Email inválido.");
  if (!validarUsername(username)) return showError("Username inválido (3-20 caracteres, só letras, números e _).");
  if (!validarSenha(senha)) return showError("Senha mínima: 6 caracteres.");
  if (!validarNascimento(nascimento)) return showError("Você precisa ter pelo menos 13 anos.");

  showLoading(true, "Criando conta...");

  try {
    // Verifica se username já existe
    const usernameRef = doc(db, "usernames", username);
    if ((await getDoc(usernameRef)).exists()) {
      throw new Error("Nome de usuário já está em uso.");
    }

    // Cria usuário no Authentication
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    const user = cred.user;

    await updateProfile(user, { displayName: nome });

    // Salva username
    await setDoc(usernameRef, {
      uid: user.uid,
      createdAt: serverTimestamp()
    });

    // Salva dados do usuário
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      username,
      email,
      name: nome,
      surname: sobrenome,
      gender: genero,
      birthDate: Timestamp.fromDate(new Date(nascimento)),
      emailVerified: user.emailVerified,
      provider: "password",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastLogin: serverTimestamp()
    });

    setTimeout(() => {
      window.location.href = "feed.html";
    }, 1200);

  } catch (err) {
    console.error("ERRO NO CADASTRO:", err);

    let msg = "Erro ao criar conta.";
    if (err.message.includes("já está em uso")) msg = err.message;
    else if (err.code === 'auth/email-already-in-use') msg = "Este email já está cadastrado.";
    else if (err.code === 'auth/weak-password') msg = "A senha deve ter pelo menos 6 caracteres.";
    else if (err.code === 'auth/invalid-email') msg = "Email inválido.";
    else if (err.code === 'permission-denied') msg = "Erro de permissão no Firestore. Verifique as Security Rules.";

    showError(msg);
  } finally {
    showLoading(false);
  }
}

/* ================= LOGIN ================= */
async function loginUser(event) {
  event.preventDefault();
  hideMessages();

  const email = document.getElementById("emaillog")?.value.trim();
  const senha = document.getElementById("passwordlog")?.value;

  if (!email || !senha) return showError("Preencha todos os campos.");
  if (!validarEmail(email)) return showError("Email inválido.");

  showLoading(true, "Entrando...");

  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, senha);

    // Atualiza último login
    await updateDoc(doc(db, "users", cred.user.uid), {
      lastLogin: serverTimestamp()
    });

    window.location.href = "feed.html";

  } catch (err) {
    console.error(err);
    let msg = "Email ou senha incorretos.";
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') msg = 'Email ou senha incorretos.';
    else if (err.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente novamente mais tarde.';

    showError(msg);
  } finally {
    showLoading(false);
  }
}

/* ================= VALIDAÇÃO AO VIVO ================= */
function configurarValidacoes() {
  const u = document.getElementById("usuario");
  if (u) {
    u.addEventListener("input", () => {
      u.value = u.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
      u.style.borderColor = validarUsername(u.value) ? "#51cf66" : "#ff6b6b";
    });
  }
}

/* ================= INIT ================= */
document.addEventListener("DOMContentLoaded", () => {

  // Impede redirect automático durante o cadastro
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const path = window.location.pathname;
      if (!path.includes('register.html') && !path.includes('login.html')) {
        window.location.href = "feed.html";
      }
    }
  });

  configurarValidacoes();

  const path = window.location.pathname;

  if (path.includes('register.html')) {
    document.querySelector(".form-section form")?.addEventListener("submit", criarContaSegura);
  } 
  else if (path.includes('login.html')) {
    document.querySelector(".form-section form")?.addEventListener("submit", loginUser);
  }
});









