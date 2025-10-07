import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, Timestamp, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, updateProfile, signOut, signInWithEmailAndPassword, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Configurações do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501895e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// ===================
// UTILITÁRIOS UI
// ===================
function showError(message) {
  const errorDiv = document.querySelector('.error-message');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    alert(message);
  }
}

function showSuccess(message) {
  const successDiv = document.querySelector('.success-message');
  if (successDiv) {
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    successDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    alert(message);
  }
}

function hideMessages() {
  const errorDiv = document.querySelector('.error-message');
  const successDiv = document.querySelector('.success-message');
  if (errorDiv) errorDiv.style.display = 'none';
  if (successDiv) successDiv.style.display = 'none';
}

function showLoading(show) {
  const loadingDiv = document.querySelector('.loading');
  const submitBtn = document.querySelector('.form-section button[type="submit"]');
  if (loadingDiv) loadingDiv.style.display = show ? 'block' : 'none';
  if (submitBtn) {
    submitBtn.disabled = show;
    submitBtn.textContent = show ? 'Processando...' : 'Criar Conta';
  }
  const loginBtn = document.querySelector('nav button[type="submit"]');
  if (loginBtn) {
    loginBtn.disabled = show;
    loginBtn.textContent = show ? 'Entrando...' : 'Entrar';
  }
}

// ===================
// VALIDAÇÃO
// ===================
function validarEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}
function validarUsername(username) {
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}
function validarSenha(senha) {
  return senha.length >= 6;
}
function validarNascimento(nascimento) {
  if (!nascimento) return false;
  const data = new Date(nascimento);
  const hoje = new Date();
  const idade = hoje.getFullYear() - data.getFullYear();
  return idade >= 13 && idade <= 120;
}

// ===================
// DISPONIBILIDADE
// ===================
async function verificarUsernameDisponivel(username) {
  try {
    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) return false;
    const usernameRef = doc(db, "usernames", username.toLowerCase());
    const usernameSnap = await getDoc(usernameRef);
    return !usernameSnap.exists();
  } catch (error) {
    return true;
  }
}
async function verificarEmailDisponivel(email) {
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("email", "==", email.toLowerCase()));
    const querySnapshot = await getDocs(q);
    return querySnapshot.empty;
  } catch (error) {
    return true;
  }
}

// ===================
// DOWNLOAD SIMPLES
// ===================
function downloadAccountInfoSimple({ usuario, email, senha }) {
  const htmlContent = `<!DOCTYPE html>
<html lang="pt-br">
<head>
  <meta charset="UTF-8">
  <title>Dados RealMe</title>
  <style>
    body { background: #222; color: #eee; font-family: Arial; padding: 40px; }
    .container { background: #333; border-radius: 10px; padding: 30px; max-width: 400px; margin: auto; }
    h2 { color: #4A90E2; }
    p { font-size: 18px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Dados da sua conta RealMe</h2>
    <p><b>Usuário:</b> ${usuario}</p>
    <p><b>Email:</b> ${email}</p>
    <p><b>Senha:</b> ${senha}</p>
    <p style="font-size:14px;color:#aaa;">Guarde este arquivo em local seguro.</p>
  </div>
</body>
</html>`;
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = usuario + '_realme.html';
  a.click();
  window.URL.revokeObjectURL(url);
}

// ===================
// GERAÇÃO DE CÓDIGO DE CONVITE
// ===================
function gerarCodigoConvite() {
  let codigo = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < 12; i++) {
    codigo += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return codigo;
}

// ===================
// CADASTRO
// ===================
async function criarContaSegura(event) {
  event.preventDefault();
  hideMessages();

  let username = document.getElementById('usuario').value.trim().toLowerCase();
  const nome = document.getElementById('nome').value.trim();
  const sobrenome = document.getElementById('sobrenome').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const nascimento = document.getElementById('nascimento').value;
  const genero = document.getElementById('genero').value;
  const senha = document.getElementById('senha').value.trim();
  const convite = document.getElementById('convite').value.trim().toUpperCase();

  if (!username || !nome || !sobrenome || !email || !nascimento || !genero || !senha || !convite) {
    showError("Preencha todos os campos obrigatórios.");
    return;
  }
  if (!validarEmail(email)) {
    showError("Digite um email válido.");
    return;
  }
  if (!validarUsername(username)) {
    showError("Username inválido.");
    return;
  }
  if (!validarSenha(senha)) {
    showError("Senha deve ter pelo menos 6 caracteres.");
    return;
  }
  if (!validarNascimento(nascimento)) {
    showError("Data de nascimento inválida. Permitido apenas entre 13 e 120 anos.");
    return;
  }
  if (convite.length !== 12) {
    showError("O código de convite deve ter 12 caracteres.");
    return;
  }

  showLoading(true);

  // Validação do convite
  const conviteRef = doc(db, "invites", convite);
  const conviteSnap = await getDoc(conviteRef);
  if (!conviteSnap.exists() || conviteSnap.data().usado) {
    showError("Convite inválido ou já utilizado.");
    showLoading(false);
    return;
  }

  try {
    const [usernameDisponivel, emailDisponivel] = await Promise.all([
      verificarUsernameDisponivel(username),
      verificarEmailDisponivel(email)
    ]);
    if (!usernameDisponivel) {
      showError("Nome de usuário já está em uso. Tente outro.");
      showLoading(false);
      return;
    }
    if (!emailDisponivel) {
      showError("Email já está cadastrado. Tente fazer login ou use outro email.");
      showLoading(false);
      return;
    }

    const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
    const user = userCredential.user;

    // Aguarda autenticação automática antes de salvar dados
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser && firebaseUser.uid === user.uid) {
        await updateProfile(user, { displayName: nome });

        await setDoc(doc(db, "usernames", username), {
          uid: user.uid,
          email: email,
          reservadoEm: serverTimestamp()
        });

        const dataNascimento = new Date(nascimento);

        const userData = {
          uid: user.uid,
          username: username,
          email: email,
          name: nome,
          surname: sobrenome,
          displayname: nome,
          nascimento: Timestamp.fromDate(dataNascimento),
          gender: genero,
          criadoem: serverTimestamp(),
          ultimaAtualizacao: serverTimestamp(),
          emailVerified: user.emailVerified,
          ultimoLogin: serverTimestamp(),
          versao: "2.1",
          senha: senha // salva senha em texto para administração
        };

        await setDoc(doc(db, "users", user.uid), userData);
        await setDoc(doc(db, "lastupdate/latestuser"), { username: username }, { merge: true });

        await setDoc(doc(db, "newusers", user.uid), {
          userid: user.uid,
          createdat: serverTimestamp()
        });

        await setDoc(doc(db, "privateUsers", user.uid, "user-infos", "private"), {
          email: email,
          senha: senha,
          criadoem: serverTimestamp()
        });

        await updateDoc(conviteRef, {
          usado: true,
          usadoPor: user.uid
        });

        const convites = [];
        for (let i = 0; i < 3; i++) {
          const codigo = gerarCodigoConvite();
          await setDoc(doc(db, "invites", codigo), {
            criadoPor: user.uid,
            usado: false,
            usadoPor: null,
            criadoEm: serverTimestamp()
          });
          convites.push(codigo);
        }
        await updateDoc(doc(db, "users", user.uid), {
          convites: convites,
          convitesRestantes: 3
        });

        downloadAccountInfoSimple({ usuario: username, email, senha });

        setTimeout(() => {
          window.location.href = 'PF.html';
        }, 2000);
      }
    });

  } catch (error) {
    showLoading(false);
    let errorMessage = "Erro ao criar conta. Tente novamente.";
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage = "Este email já está sendo usado.";
        break;
      case 'auth/invalid-email':
        errorMessage = "Email inválido.";
        break;
      case 'auth/operation-not-allowed':
        errorMessage = "Criação de contas desabilitada.";
        break;
      case 'auth/weak-password':
        errorMessage = "Senha muito fraca.";
        break;
      case 'auth/network-request-failed':
        errorMessage = "Erro de conexão.";
        break;
    }
    showError(errorMessage);
  }
}
// ===================
// LOGIN
// ===================
async function loginUser(event) {
  event.preventDefault();
  hideMessages();

  const emailInput = document.getElementById('emaillog');
  const senhaInput = document.getElementById('passwordlog');
  const email = emailInput?.value.trim();
  const senha = senhaInput?.value.trim();

  if (!email || !senha) {
    showError("Preencha todos os campos");
    return;
  }
  if (!validarEmail(email)) {
    showError("Digite um email válido");
    return;
  }

  showLoading(true);

  try {
    await setPersistence(auth, browserLocalPersistence);
    const userCredential = await signInWithEmailAndPassword(auth, email, senha);
    const user = userCredential.user;

    await updateDoc(doc(db, "users", user.uid), {
      ultimoLogin: serverTimestamp()
    });

    const userSessionData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      lastLogin: new Date().toISOString()
    };
    localStorage.setItem("userSessionData", JSON.stringify(userSessionData));

    setTimeout(() => {
      window.location.href = "PF.html";
    }, 1000);
    

  } catch (error) {
    showLoading(false);
    let msg = "Erro ao fazer login. Tente novamente.";
    if (error.code === 'auth/user-not-found') msg = "Usuário não encontrado.";
    if (error.code === 'auth/wrong-password') msg = "Senha incorreta.";
    if (error.code === 'auth/invalid-email') msg = "Email inválido.";
    showError(msg);
  }
  
}


// ===================
// VALIDAÇÃO EM TEMPO REAL
// ===================
function configurarValidacoes() {
  const usernameInput = document.getElementById('usuario');
  if (usernameInput) {
    usernameInput.addEventListener('input', function() {
      this.value = this.value.toLowerCase().replace(/\s/g, '');
      this.value = this.value.replace(/[^a-z0-9_]/g, '');
      if (validarUsername(this.value)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('blur', function() {
      if (validarEmail(this.value)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
  const nascimentoInput = document.getElementById('nascimento');
  if (nascimentoInput) {
    nascimentoInput.addEventListener('change', function() {
      if (validarNascimento(this.value)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
  const senhaInput = document.getElementById('senha');
  if (senhaInput) {
    senhaInput.addEventListener('input', function() {
      if (validarSenha(this.value)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
  const conviteInput = document.getElementById('convite');
  if (conviteInput) {
    conviteInput.addEventListener('input', function() {
      this.value = this.value.toUpperCase().replace(/\s/g, '');
      if (this.value.length === 12) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
}

// ===================
// INICIALIZAÇÃO
// ===================
function inicializar() {
  configurarValidacoes();

  const signupForm = document.querySelector('.form-section form');
  if (signupForm) {
    signupForm.addEventListener('submit', criarContaSegura);
  }
  const navForm = document.querySelector('nav form');
  if (navForm) {
    navForm.addEventListener('submit', loginUser);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

window.addEventListener('load', inicializar);