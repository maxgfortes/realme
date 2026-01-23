import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, serverTimestamp, deleteDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword, updateProfile, signOut, signInWithEmailAndPassword, 
  onAuthStateChanged, setPersistence, browserLocalPersistence, sendEmailVerification
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
  }
}

function showSuccess(message) {
  const successDiv = document.querySelector('.success-message');
  if (successDiv) {
    successDiv.textContent = message;
    successDiv.style.display = 'block';
    successDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
// MODAL DE VERIFICAÇÃO
// ===================
function showEmailVerificationModal(email) {
  const oldModal = document.getElementById('email-verification-modal');
  if (oldModal) oldModal.remove();

  const modal = document.createElement('div');
  modal.id = 'email-verification-modal';
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="
      background: rgba(20, 20, 20, 0.95);
      backdrop-filter: blur(10px);
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 30px;
      max-width: 500px;
      text-align: center;
      color: #dbdbdb;
    ">
      <h2 style="color: #4A90E2; margin-bottom: 20px;">📧 Verifique seu Email</h2>
      <p style="margin-bottom: 15px;">Enviamos um email de verificação para:</p>
      <p style="color: #4A90E2; font-weight: bold; margin-bottom: 20px;">${email}</p>
      <p style="margin-bottom: 25px; color: #aaa;">Clique no link do email para verificar sua conta. Após verificar, clique no botão abaixo.</p>
      <button id="check-verification-btn" style="
        background: #4A90E2;
        color: white;
        border: none;
        padding: 12px 30px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
        margin-bottom: 10px;
      ">Já Verifiquei Meu Email</button>
      <br>
      <button id="resend-email-btn" style="
        background: transparent;
        color: #4A90E2;
        border: 1px solid #4A90E2;
        padding: 10px 20px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 14px;
        margin-bottom: 10px;
      ">Reenviar Email</button>
      <br>
      <button id="cancel-signup-btn" style="
        background: transparent;
        color: #ff6b6b;
        border: 1px solid #ff6b6b;
        padding: 8px 15px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
      ">Cancelar Cadastro</button>
      <p id="verification-status" style="margin-top: 15px; color: #aaa; font-size: 14px;"></p>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
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
  let idade = hoje.getFullYear() - data.getFullYear();
  const mesAtual = hoje.getMonth();
  const mesNasc = data.getMonth();
  
  if (mesAtual < mesNasc || (mesAtual === mesNasc && hoje.getDate() < data.getDate())) {
    idade--;
  }
  
  return idade >= 13 && idade <= 120;
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
    body { 
      background-image: url('https://i.postimg.cc/9FcFz827/bg.jpg');  
      background-size: cover;
      background-repeat: no-repeat;
      background-position: center;
      background-attachment: fixed;
      color: #dbdbdb;
      display: flex;
      overflow-y: scroll;
      scrollbar-width: none;
      -ms-overflow-style: none;
      font-family: Arial;
      padding: 40px;
    }
    .container { 
      background: rgba(20, 20, 20, 0.9);
      backdrop-filter: blur(8px);
      border: 1px solid #2a2a2a;
      border-radius: 12px;
      padding: 30px;
      max-width: 400px;
      margin: auto;
    }
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
// LIMPAR CONTA NÃO VERIFICADA
// ===================
async function limparContaNaoVerificada(user, username) {
  console.log("🧹 Limpando conta não verificada...");
  
  try {
    // Remover reserva de username se existir
    if (username) {
      try {
        await deleteDoc(doc(db, "usernames", username));
        console.log("✅ Username liberado:", username);
      } catch (e) {
        console.log("⚠️ Username não estava reservado");
      }
    }
    
    // Deletar usuário do Auth
    if (user) {
      await user.delete();
      console.log("✅ Usuário removido do Auth");
    }
    
  } catch (error) {
    console.error("❌ Erro ao limpar conta:", error);
  }
}

// ===================
// COMPLETAR CADASTRO
// ===================
async function completarCadastro(user, userData) {
  console.log("🔄 Completando cadastro após verificação de email...");

  try {
    const agora = serverTimestamp();
    const agoraDate = new Date();

    // Atualizar Auth Profile
    await updateProfile(user, { displayName: userData.nome });

    // Reservar username
    await setDoc(doc(db, "usernames", userData.username), {
      uid: user.uid,
      email: userData.email,
      username: userData.username,
      reservadoEm: agora,
      criadoEm: agora,
      ativo: true
    });

    // Criar documento do usuário completo
    await setDoc(doc(db, "users", user.uid), {
      // Identificação
      uid: user.uid,
      username: userData.username,
      email: userData.email,
      
      // Informações pessoais
      name: userData.nome,
      surname: userData.sobrenome,
      displayname: userData.nome,
      fullname: `${userData.nome} ${userData.sobrenome}`,
      nascimento: userData.nascimento,
      gender: userData.genero,
      
      // Timestamps
      criadoEm: agora,
      criadoEmISO: agoraDate.toISOString(),
      ultimaAtualizacao: agora,
      ultimaAtualizacaoISO: agoraDate.toISOString(),
      ultimoLogin: agora,
      ultimoLoginISO: agoraDate.toISOString(),
      
      // Verificação e segurança
      emailVerified: true,
      emailVerifiedAt: agora,
      accountActive: true,
      accountStatus: "active",
      
      // Metadados
      versao: "2.1",
      plataforma: "web",
      userAgent: navigator.userAgent,
      idioma: navigator.language || 'pt-BR',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      
      // Configurações padrão
      privacidade: {
        perfilPublico: true,
        aceitaMensagens: true,
        mostraOnline: true
      },
      
      // Estatísticas iniciais
      stats: {
        posts: 0,
        seguidores: 0,
        seguindo: 0,
        curtidas: 0
      },
      
      // Flags
      isNewUser: true,
      completedOnboarding: false,
      termsAccepted: true,
      termsAcceptedAt: agora
    });

    // Atualizar lastupdate
    await setDoc(doc(db, "lastupdate", "latestUser"), { 
      username: userData.username,
      uid: user.uid,
      email: userData.email,
      timestamp: agora,
      timestampISO: agoraDate.toISOString()
    }, { merge: true });

    // Criar registro em newusers
    await setDoc(doc(db, "newusers", user.uid), {
      userid: user.uid,
      username: userData.username,
      email: userData.email,
      displayname: userData.nome,
      createdat: agora,
      createdatISO: agoraDate.toISOString(),
      plataforma: "web",
      versao: "2.1"
    });

    // Salvar dados privados (considere criptografar a senha)
    await setDoc(doc(db, "privateUsers", user.uid), {
      uid: user.uid,
      username: userData.username,
      email: userData.email,
      
      // Timestamps
      criadoEm: agora,
      criadoEmISO: agoraDate.toISOString(),
      ultimaAtualizacao: agora,
      
      // Informações de segurança
      ultimaTrocaSenha: agora,
      tentativasLogin: 0,
      ultimoIPLogin: null,
      
      // Backup de recuperação
      recoveryEmail: userData.email,
      phoneNumber: null,
      
      // Histórico
      loginHistory: [{
        timestamp: agora,
        timestampISO: agoraDate.toISOString(),
        tipo: "primeiro_login",
        plataforma: "web"
      }]
    });

    // Criar documento de configurações
    await setDoc(doc(db, "userSettings", user.uid), {
      uid: user.uid,
      notificacoes: {
        email: true,
        push: false,
        curtidas: true,
        comentarios: true,
        novosSeguidor: true,
        mensagens: true
      },
      tema: "auto",
      idioma: "pt-BR",
      criadoEm: agora,
      atualizadoEm: agora
    });

    // Criar documento de atividades
    await setDoc(doc(db, "userActivity", user.uid), {
      uid: user.uid,
      primeiroAcesso: agora,
      ultimoAcesso: agora,
      totalAcessos: 1,
      atividades: [{
        tipo: "cadastro_completo",
        timestamp: agora,
        timestampISO: agoraDate.toISOString(),
        detalhes: "Conta criada e email verificado"
      }]
    });

    console.log("✅ Cadastro completado com sucesso!");
    
    downloadAccountInfoSimple({ 
      usuario: userData.username, 
      email: userData.email, 
      senha: userData.senha 
    });

    return true;
  } catch (error) {
    console.error("❌ Erro ao completar cadastro:", error);
    throw error;
  }
}

// ===================
// CADASTRO COM VALIDAÇÃO DE EMAIL
// ===================
async function criarContaSegura(event) {
  event.preventDefault();
  hideMessages();

  const username = document.getElementById('usuario')?.value.trim().toLowerCase();
  const nome = document.getElementById('nome')?.value.trim();
  const sobrenome = document.getElementById('sobrenome')?.value.trim();
  const email = document.getElementById('email')?.value.trim().toLowerCase();
  const nascimento = document.getElementById('nascimento')?.value;
  const genero = document.getElementById('genero')?.value;
  const senha = document.getElementById('senha')?.value;

  // VALIDAÇÕES BÁSICAS
  if (!username || !nome || !sobrenome || !email || !nascimento || !genero || !senha) {
    showError("Preencha todos os campos obrigatórios.");
    return;
  }
  
  if (!validarEmail(email)) {
    showError("Digite um email válido.");
    return;
  }
  
  if (!validarUsername(username)) {
    showError("Username inválido (3-20 caracteres, apenas letras, números e _).");
    return;
  }
  
  if (!validarSenha(senha)) {
    showError("Senha deve ter pelo menos 6 caracteres.");
    return;
  }
  
  if (!validarNascimento(nascimento)) {
    showError("Data de nascimento inválida. Você deve ter entre 13 e 120 anos.");
    return;
  }

  showLoading(true);

  let userTemp = null;

  try {
    // VERIFICAR DISPONIBILIDADE DO USERNAME
    console.log("🔍 Verificando disponibilidade do username...");
    const usernameRef = doc(db, "usernames", username);
    const usernameSnap = await getDoc(usernameRef);
    
    if (usernameSnap.exists()) {
      showError("Nome de usuário já está em uso. Tente outro.");
      showLoading(false);
      return;
    }
    console.log("✅ Username disponível!");

    // CRIAR CONTA NO AUTH (temporária)
    console.log("🔐 Criando conta temporária no Firebase Auth...");
    const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
    userTemp = userCredential.user;
    console.log("✅ Conta temporária criada! UID:", userTemp.uid);

    // ENVIAR EMAIL DE VERIFICAÇÃO
    console.log("📧 Enviando email de verificação...");
    await sendEmailVerification(userTemp);
    console.log("✅ Email de verificação enviado!");

    showLoading(false);

    // Preparar dados do usuário
    const dataNascimento = new Date(nascimento + 'T00:00:00');
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
    const cancelBtn = modal.querySelector('#cancel-signup-btn');

    // Botão de cancelar
    cancelBtn.addEventListener('click', async () => {
      if (confirm('Tem certeza que deseja cancelar o cadastro? Sua conta será deletada.')) {
        statusElement.textContent = 'Cancelando...';
        statusElement.style.color = '#ff6b6b';
        
        await limparContaNaoVerificada(userTemp, username);
        
        modal.remove();
        showError('Cadastro cancelado.');
      }
    });

    // Botão de verificar
    checkBtn.addEventListener('click', async () => {
      checkBtn.disabled = true;
      checkBtn.textContent = 'Verificando...';
      statusElement.textContent = 'Verificando email...';
      statusElement.style.color = '#4A90E2';

      try {
        await userTemp.reload();
        
        if (userTemp.emailVerified) {
          statusElement.textContent = '✅ Email verificado! Completando cadastro...';
          statusElement.style.color = '#51cf66';
          
          await completarCadastro(userTemp, userData);
          
          modal.remove();
          showSuccess('Conta criada com sucesso! Redirecionando...');
          
          setTimeout(() => {
            window.location.href = 'feed.html';
          }, 1500);
        } else {
          statusElement.textContent = '❌ Email ainda não verificado. Verifique sua caixa de entrada e spam.';
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
        await sendEmailVerification(userTemp);
        statusElement.textContent = '✅ Email reenviado com sucesso!';
        statusElement.style.color = '#51cf66';
        
        setTimeout(() => {
          resendBtn.disabled = false;
          resendBtn.textContent = 'Reenviar Email';
          statusElement.textContent = '';
        }, 5000);
      } catch (error) {
        console.error("Erro ao reenviar:", error);
        
        let errorMsg = '❌ Erro ao reenviar.';
        if (error.code === 'auth/too-many-requests') {
          errorMsg = '❌ Muitas tentativas. Aguarde alguns minutos.';
        }
        
        statusElement.textContent = errorMsg;
        statusElement.style.color = '#ff6b6b';
        
        setTimeout(() => {
          resendBtn.disabled = false;
          resendBtn.textContent = 'Reenviar Email';
        }, 3000);
      }
    });

  } catch (error) {
    console.error("❌ ERRO:", error);
    showLoading(false);
    
    // Limpar conta se algo deu errado
    if (userTemp) {
      await limparContaNaoVerificada(userTemp, username);
    }
    
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
  const senha = senhaInput?.value;

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

    if (!user.emailVerified) {
      showError("Por favor, verifique seu email antes de fazer login.");
      await signOut(auth);
      showLoading(false);
      return;
    }

    // Atualizar último login
    try {
      await setDoc(doc(db, "users", user.uid), {
        ultimoLogin: serverTimestamp(),
        ultimoLoginISO: new Date().toISOString()
      }, { merge: true });
    } catch (updateError) {
      console.log("⚠️ Aviso: não foi possível atualizar último login");
    }

    const userSessionData = {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified,
      lastLogin: new Date().toISOString()
    };
    localStorage.setItem("userSessionData", JSON.stringify(userSessionData));

    showSuccess("Login realizado com sucesso!");
    
    setTimeout(() => {
      window.location.href = "feed.html";
    }, 1000);

  } catch (error) {
    showLoading(false);
    console.error("Erro no login:", error);
    
    let msg = "Erro ao fazer login. Tente novamente.";
    
    if (error.code === 'auth/user-not-found') {
      msg = "Usuário não encontrado.";
    } else if (error.code === 'auth/wrong-password') {
      msg = "Senha incorreta.";
    } else if (error.code === 'auth/invalid-email') {
      msg = "Email inválido.";
    } else if (error.code === 'auth/invalid-credential') {
      msg = "Credenciais inválidas. Verifique email e senha.";
    } else if (error.code === 'auth/too-many-requests') {
      msg = "Muitas tentativas. Aguarde alguns minutos.";
    }
    
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
      let valor = this.value.toLowerCase();
      valor = valor.replace(/\s/g, '');
      valor = valor.replace(/[^a-z0-9_]/g, '');
      this.value = valor;
      
      if (valor.length === 0) {
        this.style.borderColor = '';
      } else if (validarUsername(valor)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
  
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('blur', function() {
      const valor = this.value.trim();
      if (valor.length === 0) {
        this.style.borderColor = '';
      } else if (validarEmail(valor)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }
  
  const nascimentoInput = document.getElementById('nascimento');
  if (nascimentoInput) {
    nascimentoInput.addEventListener('change', function() {
      if (this.value && validarNascimento(this.value)) {
        this.style.borderColor = '#51cf66';
      } else if (this.value) {
        this.style.borderColor = '#ff6b6b';
      } else {
        this.style.borderColor = '';
      }
    });
  }
  
  const senhaInput = document.getElementById('senha');
  if (senhaInput) {
    senhaInput.addEventListener('input', function() {
      if (this.value.length === 0) {
        this.style.borderColor = '';
      } else if (validarSenha(this.value)) {
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
  console.log("🚀 Inicializando aplicação...");
  
  configurarValidacoes();

  const signupForm = document.querySelector('.form-section form');
  if (signupForm) {
    signupForm.addEventListener('submit', criarContaSegura);
    console.log("✅ Formulário de cadastro configurado");
  }
  
  const navForm = document.querySelector('nav form');
  if (navForm) {
    navForm.addEventListener('submit', loginUser);
    console.log("✅ Formulário de login configurado");
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}
