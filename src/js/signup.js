import { initializeApp } from “https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js”;
import {
getFirestore, doc, setDoc, getDoc, serverTimestamp, collection, query, where, getDocs, Timestamp, updateDoc
} from “https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js”;
import {
getAuth, createUserWithEmailAndPassword, updateProfile, signOut, signInWithEmailAndPassword,
onAuthStateChanged, setPersistence, browserLocalPersistence, sendEmailVerification
} from “https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js”;
import { getAnalytics } from “https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js”;

// Configurações do Firebase
const firebaseConfig = {
apiKey: “AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs”,
authDomain: “ifriendmatch.firebaseapp.com”,
projectId: “ifriendmatch”,
storageBucket: “ifriendmatch.appspot.com”,
messagingSenderId: “306331636603”,
appId: “1:306331636603:web:c0ae0bd22501895e3de”,
measurementId: “G-D96BEW6RC3”
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// ===================
// UTILITÁRIOS UI
// ===================
function showError(message) {
const errorDiv = document.querySelector(’.error-message’);
if (errorDiv) {
errorDiv.textContent = message;
errorDiv.style.display = ‘block’;
errorDiv.scrollIntoView({ behavior: ‘smooth’, block: ‘nearest’ });
}
}

function showSuccess(message) {
const successDiv = document.querySelector(’.success-message’);
if (successDiv) {
successDiv.textContent = message;
successDiv.style.display = ‘block’;
successDiv.scrollIntoView({ behavior: ‘smooth’, block: ‘nearest’ });
}
}

function hideMessages() {
const errorDiv = document.querySelector(’.error-message’);
const successDiv = document.querySelector(’.success-message’);
if (errorDiv) errorDiv.style.display = ‘none’;
if (successDiv) successDiv.style.display = ‘none’;
}

function showLoading(show) {
const loadingDiv = document.querySelector(’.loading’);
const submitBtn = document.querySelector(’.form-section button[type=“submit”]’);
if (loadingDiv) loadingDiv.style.display = show ? ‘block’ : ‘none’;
if (submitBtn) {
submitBtn.disabled = show;
submitBtn.textContent = show ? ‘Processando…’ : ‘Criar Conta’;
}
const loginBtn = document.querySelector(‘nav button[type=“submit”]’);
if (loginBtn) {
loginBtn.disabled = show;
loginBtn.textContent = show ? ‘Entrando…’ : ‘Entrar’;
}
}

// ===================
// MODAL DE VERIFICAÇÃO
// ===================
function showEmailVerificationModal(email) {
// Remove modal anterior se existir
const oldModal = document.getElementById(‘email-verification-modal’);
if (oldModal) oldModal.remove();

const modal = document.createElement(‘div’);
modal.id = ‘email-verification-modal’;
modal.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.8); display: flex; justify-content: center; align-items: center; z-index: 10000;`;

modal.innerHTML = `<div style=" background: rgba(20, 20, 20, 0.95); backdrop-filter: blur(10px); border: 1px solid #2a2a2a; border-radius: 12px; padding: 30px; max-width: 500px; text-align: center; color: #dbdbdb; "> <h2 style="color: #4A90E2; margin-bottom: 20px;">📧 Verifique seu Email</h2> <p style="margin-bottom: 15px;">Enviamos um email de verificação para:</p> <p style="color: #4A90E2; font-weight: bold; margin-bottom: 20px;">${email}</p> <p style="margin-bottom: 25px; color: #aaa;">Clique no link do email para verificar sua conta. Após verificar, clique no botão abaixo.</p> <button id="check-verification-btn" style=" background: #4A90E2; color: white; border: none; padding: 12px 30px; border-radius: 8px; cursor: pointer; font-size: 16px; margin-bottom: 10px; ">Já Verifiquei Meu Email</button> <br> <button id="resend-email-btn" style=" background: transparent; color: #4A90E2; border: 1px solid #4A90E2; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; ">Reenviar Email</button> <p id="verification-status" style="margin-top: 15px; color: #aaa; font-size: 14px;"></p> </div>`;

document.body.appendChild(modal);
return modal;
}

// ===================
// VALIDAÇÃO
// ===================
function validarEmail(email) {
const emailRegex = /^[^\s@]+@[^\s@]+.[^\s@]+$/;
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
const userRef = doc(db, “users”, username);
const userSnap = await getDoc(userRef);
if (userSnap.exists()) return false;
const usernameRef = doc(db, “usernames”, username.toLowerCase());
const usernameSnap = await getDoc(usernameRef);
return !usernameSnap.exists();
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
    body { background-image: url('https://i.postimg.cc/9FcFz827/bg.jpg');  
  background-size: cover;
  background-repeat: no-repeat;
  background-position: center;
  background-attachment: fixed;
  color: #dbdbdb;
  display: flex;
  overflow-y: scroll;
  scrollbar-width: none;
  -ms-overflow-style: none; color: #eee; font-family: Arial; padding: 40px; }
    .container { background: rgba(20, 20, 20, 0.247);
  backdrop-filter: blur(8px);
  border: 1px solid #2a2a2a;
  border-radius: 12px; padding: 30px; max-width: 400px; margin: auto; }
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
// VERIFICAR EMAIL
// ===================
async function verificarEmailValidado(user, userData) {
return new Promise((resolve, reject) => {
const checkInterval = setInterval(async () => {
try {
await user.reload();
if (user.emailVerified) {
clearInterval(checkInterval);
resolve(true);
}
} catch (error) {
clearInterval(checkInterval);
reject(error);
}
}, 2000);

```
// Timeout de 10 minutos
setTimeout(() => {
  clearInterval(checkInterval);
  reject(new Error('Timeout na verificação de email'));
}, 600000);
```

});
}

// ===================
// COMPLETAR CADASTRO
// ===================

async function completarCadastro(user, userData) {
console.log(“🔄 Completando cadastro após verificação de email…”);

try {
// Atualizar Auth Profile
await updateProfile(user, { displayName: userData.nome });

```
// Reservar username
await setDoc(doc(db, "usernames", userData.username), {
  uid: user.uid,
  email: userData.email,
  reservadoEm: serverTimestamp()
});

// Criar documento do usuário
await setDoc(doc(db, "users", user.uid), {
  uid: user.uid,
  username: userData.username,
  email: userData.email,
  name: userData.nome,
  surname: userData.sobrenome,
  displayname: userData.nome,
  nascimento: userData.nascimento,
  gender: userData.genero,
  criadoem: serverTimestamp(),
  ultimaAtualizacao: serverTimestamp(),
  emailVerified: true,
  ultimoLogin: serverTimestamp(),
  versao: "2.1",
  senha: userData.senha
});

// Atualizar lastupdate
await setDoc(doc(db, "lastupdate", "latestUser"), { 
  username: userData.username,
  timestamp: serverTimestamp()
}, { merge: true });

// Criar registro em newusers
await setDoc(doc(db, "newusers", user.uid), {
  userid: user.uid,
  createdat: serverTimestamp()
});

// Salvar dados privados
await setDoc(doc(db, "privateUsers", user.uid), {
  email: userData.email,
  senha: userData.senha,
  criadoem: serverTimestamp()
});

console.log("✅ Cadastro completado com sucesso!");

downloadAccountInfoSimple({ 
  usuario: userData.username, 
  email: userData.email, 
  senha: userData.senha 
});

return true;
```

} catch (error) {
console.error(“❌ Erro ao completar cadastro:”, error);
throw error;
}
}

// ===================
// CADASTRO COM VALIDAÇÃO DE EMAIL
// ===================
async function criarContaSegura(event) {
event.preventDefault();
hideMessages();

let username = document.getElementById(‘usuario’).value.trim().toLowerCase();
const nome = document.getElementById(‘nome’).value.trim();
const sobrenome = document.getElementById(‘sobrenome’).value.trim();
const email = document.getElementById(‘email’).value.trim().toLowerCase();
const nascimento = document.getElementById(‘nascimento’).value;
const genero = document.getElementById(‘genero’).value;
const senha = document.getElementById(‘senha’).value.trim();

// VALIDAÇÕES BÁSICAS
if (!username || !nome || !sobrenome || !email || !nascimento || !genero || !senha) {
showError(“Preencha todos os campos obrigatórios.”);
return;
}
if (!validarEmail(email)) {
showError(“Digite um email válido.”);
return;
}
if (!validarUsername(username)) {
showError(“Username inválido (3-20 caracteres, apenas letras, números e _).”);
return;
}
if (!validarSenha(senha)) {
showError(“Senha deve ter pelo menos 6 caracteres.”);
return;
}
if (!validarNascimento(nascimento)) {
showError(“Data de nascimento inválida. Você deve ter entre 13 e 120 anos.”);
return;
}

showLoading(true);

try {
// VERIFICAR DISPONIBILIDADE DO USERNAME
console.log(“🔍 Verificando disponibilidade do username…”);
const usernameRef = doc(db, “usernames”, username);
const usernameSnap = await getDoc(usernameRef);

```
if (usernameSnap.exists()) {
  showError("Nome de usuário já está em uso. Tente outro.");
  showLoading(false);
  return;
}
console.log("✅ Username disponível!");

// CRIAR CONTA NO AUTH
console.log("🔐 Criando conta no Firebase Auth...");
const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
const user = userCredential.user;
console.log("✅ Conta criada no Auth! UID:", user.uid);

// ENVIAR EMAIL DE VERIFICAÇÃO
console.log("📧 Enviando email de verificação...");
await sendEmailVerification(user);
console.log("✅ Email de verificação enviado!");

showLoading(false);

// Preparar dados do usuário
const dataNascimento = new Date(nascimento);
const userData = {
  username,
  nome,
  sobrenome,
  email,
  nascimento: Timestamp.fromDate(dataNascimento),
  genero,
  senha
};

// MOSTRAR MODAL DE VERIFICAÇÃO
const modal = showEmailVerificationModal(email);
const statusElement = modal.querySelector('#verification-status');
const checkBtn = modal.querySelector('#check-verification-btn');
const resendBtn = modal.querySelector('#resend-email-btn');

// Botão de verificar
checkBtn.addEventListener('click', async () => {
  checkBtn.disabled = true;
  checkBtn.textContent = 'Verificando...';
  statusElement.textContent = 'Aguardando verificação...';
  statusElement.style.color = '#4A90E2';

  try {
    await user.reload();
    
    if (user.emailVerified) {
      statusElement.textContent = '✅ Email verificado! Completando cadastro...';
      statusElement.style.color = '#51cf66';
      
      await completarCadastro(user, userData);
      
      modal.remove();
      showSuccess('Conta criada com sucesso! Redirecionando...');
      
      setTimeout(() => {
        window.location.href = 'feed.html';
      }, 1500);
    } else {
      statusElement.textContent = '❌ Email ainda não foi verificado. Verifique sua caixa de entrada.';
      statusElement.style.color = '#ff6b6b';
      checkBtn.disabled = false;
      checkBtn.textContent = 'Já Verifiquei Meu Email';
    }
  } catch (error) {
    console.error("Erro ao verificar:", error);
    statusElement.textContent = '❌ Erro ao verificar. Tente novamente.';
    statusElement.style.color = '#ff6b6b';
    checkBtn.disabled = false;
    checkBtn.textContent = 'Já Verifiquei Meu Email';
  }
});

// Botão de reenviar
resendBtn.addEventListener('click', async () => {
  resendBtn.disabled = true;
  resendBtn.textContent = 'Enviando...';
  
  try {
    await sendEmailVerification(user);
    statusElement.textContent = '✅ Email reenviado com sucesso!';
    statusElement.style.color = '#51cf66';
    
    setTimeout(() => {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Reenviar Email';
      statusElement.textContent = '';
    }, 3000);
  } catch (error) {
    console.error("Erro ao reenviar:", error);
    statusElement.textContent = '❌ Erro ao reenviar. Aguarde um momento.';
    statusElement.style.color = '#ff6b6b';
    resendBtn.disabled = false;
    resendBtn.textContent = 'Reenviar Email';
  }
});
```

} catch (error) {
console.error(“❌ ERRO:”, error);
showLoading(false);

```
let errorMessage = "Erro ao criar conta. Tente novamente.";

if (error.code) {
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
      errorMessage = "Senha muito fraca (mínimo 6 caracteres).";
      break;
    case 'auth/network-request-failed':
      errorMessage = "Erro de conexão com a internet.";
      break;
    default:
      errorMessage = `Erro: ${error.message}`;
  }
}

showError(errorMessage);
```

}
}

// ===================
// LOGIN
// ===================
async function loginUser(event) {
event.preventDefault();
hideMessages();

const emailInput = document.getElementById(‘emaillog’);
const senhaInput = document.getElementById(‘passwordlog’);
const email = emailInput?.value.trim();
const senha = senhaInput?.value.trim();

if (!email || !senha) {
showError(“Preencha todos os campos”);
return;
}
if (!validarEmail(email)) {
showError(“Digite um email válido”);
return;
}

showLoading(true);

try {
await setPersistence(auth, browserLocalPersistence);
const userCredential = await signInWithEmailAndPassword(auth, email, senha);
const user = userCredential.user;

```
if (!user.emailVerified) {
  showError("Por favor, verifique seu email antes de fazer login.");
  await signOut(auth);
  showLoading(false);
  return;
}

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
  window.location.href = "feed.html";
}, 1000);
```

} catch (error) {
showLoading(false);
let msg = “Erro ao fazer login. Tente novamente.”;
if (error.code === ‘auth/user-not-found’) msg = “Usuário não encontrado.”;
if (error.code === ‘auth/wrong-password’) msg = “Senha incorreta.”;
if (error.code === ‘auth/invalid-email’) msg = “Email inválido.”;
showError(msg);
}
}

// ===================
// VALIDAÇÃO EM TEMPO REAL
// ===================
function configurarValidacoes() {
const usernameInput = document.getElementById(‘usuario’);
if (usernameInput) {
usernameInput.addEventListener(‘input’, function() {
this.value = this.value.toLowerCase().replace(/\s/g, ‘’);
this.value = this.value.replace(/[^a-z0-9_]/g, ‘’);
if (validarUsername(this.value)) {
this.style.borderColor = ‘#51cf66’;
} else {
this.style.borderColor = ‘#ff6b6b’;
}
});
}
const emailInput = document.getElementById(‘email’);
if (emailInput) {
emailInput.addEventListener(‘blur’, function() {
if (validarEmail(this.value)) {
this.style.borderColor = ‘#51cf66’;
} else {
this.style.borderColor = ‘#ff6b6b’;
}
});
}
const nascimentoInput = document.getElementById(‘nascimento’);
if (nascimentoInput) {
nascimentoInput.addEventListener(‘change’, function() {
if (validarNascimento(this.value)) {
this.style.borderColor = ‘#51cf66’;
} else {
this.style.borderColor = ‘#ff6b6b’;
}
});
}
const senhaInput = document.getElementById(‘senha’);
if (senhaInput) {
senhaInput.addEventListener(‘input’, function() {
if (validarSenha(this.value)) {
this.style.borderColor = ‘#51cf66’;
} else {
this.style.borderColor = ‘#ff6b6b’;
}
});
}
}

// ===================
// INICIALIZAÇÃO
// ===================
function inicializar() {
configurarValidacoes();

const signupForm = document.querySelector(’.form-section form’);
if (signupForm) {
signupForm.addEventListener(‘submit’, criarContaSegura);
}
const navForm = document.querySelector(‘nav form’);
if (navForm) {
navForm.addEventListener(‘submit’, loginUser);
}
}

if (document.readyState === ‘loading’) {
document.addEventListener(‘DOMContentLoaded’, inicializar);
} else {
inicializar();
}

window.addEventListener(‘load’, inicializar);
