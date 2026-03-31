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

/* ================= FIREBASE ================= */

// =====================================================
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
const validarUsername = u => /^[a-zA-Z0-9_]{3,20}$/.test(u);
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
    showError("Preencha todos os campos.");
    return;
  }

  if (!validarEmail(email)) return showError("Email inválido.");
  if (!validarUsername(username)) return showError("Username inválido.");
  if (!validarSenha(senha)) return showError("Senha mínima: 6 caracteres.");
  if (!validarNascimento(nascimento)) return showError("Você precisa ter 13+ anos.");

  showLoading(true, "Criando conta...");

  try {
    // Username único
    const usernameRef = doc(db, "usernames", username);
    if ((await getDoc(usernameRef)).exists()) {
      showLoading(false);
      return showError("Nome de usuário já está em uso.");
    }

    // Auth
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    const user = cred.user;

    await updateProfile(user, { displayName: nome });

    // Firestore
    await setDoc(usernameRef, {
      uid: user.uid,
      createdAt: serverTimestamp()
    });

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

    setTimeout(() => (window.location.href = "feed.html"), 800);

  } catch (err) {
    console.error(err);
    let msg = "Erro ao criar conta.";
    if (err.code === 'auth/email-already-in-use') {
      msg = "Este email já está cadastrado.";
    } else if (err.code === 'auth/weak-password') {
      msg = "A senha deve ter pelo menos 6 caracteres.";
    } else if (err.code === 'auth/invalid-email') {
      msg = "Email inválido.";
    }
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
    console.info('Login: tentativa de autenticação para', email);
    await setPersistence(auth, browserLocalPersistence);
    console.info('Login: persistência definida (browserLocalPersistence)');
    const cred = await signInWithEmailAndPassword(auth, email, senha);

    console.info('Login: usuário autenticado', cred.user && cred.user.uid);

    try {
      await updateDoc(doc(db, "users", cred.user.uid), {
        lastLogin: serverTimestamp()
      });
      console.info('Login: lastLogin atualizado no Firestore para', cred.user.uid);
    } catch (updateErr) {
      console.error('Login: falha ao atualizar lastLogin no Firestore', updateErr);
    }

    window.location.href = "feed.html";
  } catch (err) {
    console.error(err);
    let msg = "Email ou senha incorretos.";
    if (err && err.code) {
      if (err.code === 'auth/user-not-found') msg = 'Usuário não encontrado.';
      else if (err.code === 'auth/wrong-password') msg = 'Senha incorreta.';
      else if (err.code === 'auth/invalid-email') msg = 'Email inválido.';
      else if (err.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Tente novamente mais tarde.';
    } else if (err && err.message) {
      msg = err.message;
    }
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

    onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
          window.location.href = "feed.html";
        } else {
          window.location.href = "feed.html";
        }
      } catch {
        window.location.href = "feed.html";
      }
    }
  });
  
  configurarValidacoes();

  const path = window.location.pathname;
  if (path.includes('register.html')) {
    document
      .querySelector(".form-section form")
      ?.addEventListener("submit", criarContaSegura);
  } else if (path.includes('login.html')) {
    document
      .querySelector(".form-section form")
      ?.addEventListener("submit", loginUser);
  }
});









