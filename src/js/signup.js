// SISTEMA DE CADASTRO 100% SEGURO - FIREBASE AUTH
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp,
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  updateProfile,
  signOut
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

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// ===================
// FUNÇÕES UTILITÁRIAS PARA UI
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
  const submitBtn = document.querySelector('button[type="submit"]');
  
  if (loadingDiv) {
    loadingDiv.style.display = show ? 'block' : 'none';
  }
  
  if (submitBtn) {
    submitBtn.disabled = show;
    submitBtn.textContent = show ? 'Criando conta...' : 'Criar Conta';
  }
}

// ===================
// FUNÇÕES DE VALIDAÇÃO
// ===================
function validarEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validarUsername(username) {
  // Username: 3-20 caracteres, apenas letras, números e underscore
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
}

function validarSenha(senha) {
  // Senha forte: mínimo 8 caracteres, pelo menos 1 letra e 1 número
  return senha.length >= 8 && /[A-Za-z]/.test(senha) && /[0-9]/.test(senha);
}

function validarIdade(idade) {
  return idade >= 13 && idade <= 120;
}

// ===================
// VERIFICAÇÕES DE DISPONIBILIDADE
// ===================
async function verificarUsernameDisponivel(username) {
  try {
    // Verifica no sistema legado
    const userRef = doc(db, "users", username);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      return false;
    }

    // Verifica na nova coleção de usuários por username
    const usernameRef = doc(db, "usernames", username.toLowerCase());
    const usernameSnap = await getDoc(usernameRef);
    
    return !usernameSnap.exists();
  } catch (error) {
    console.error("Erro ao verificar username:", error);
    throw new Error("Erro ao verificar disponibilidade do username");
  }
}

async function verificarEmailDisponivel(email) {
  try {
    // Verifica se email já existe na coleção de usuários
    const usersRef = collection(db, "secure_users");
    const q = query(usersRef, where("email", "==", email.toLowerCase()));
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.empty;
  } catch (error) {
    console.error("Erro ao verificar email:", error);
    return true; // Se der erro, permite continuar (Firebase Auth vai validar)
  }
}

// ===================
// FUNÇÃO PARA ATUALIZAR ÚLTIMO USUÁRIO
// ===================
async function atualizarUltimoUsuario(username) {
  try {
    const lastUpdateRef = doc(db, "lastupdate", "latestUser");
    
    await setDoc(lastUpdateRef, {
      username: username,
      timestamp: serverTimestamp(),
      acao: "conta_criada"
    });
    
    console.log("Último usuário atualizado para:", username);
  } catch (error) {
    console.error("Erro ao atualizar último usuário:", error);
    // Não é crítico, pode continuar
  }
}

// ===================
// FUNÇÃO PARA CRIAR RELACIONAMENTOS SOCIAIS
// ===================
async function criarRelacionamentosSociais(username, uid) {
  try {
    // Criar documento de seguindo para o novo usuário
    await setDoc(doc(db, "secure_users", uid, "seguindo", "users"), {
      maxgfortes: "maxgfortes",
      realme: "realme"
    });

    // Adicionar novo usuário como seguidor de maxgfortes
    const seguidoresMaxRef = doc(db, "users", "maxgfortes", "seguidores", "users");
    const seguidoresMaxSnap = await getDoc(seguidoresMaxRef);
    let seguidoresMaxData = seguidoresMaxSnap.exists() ? seguidoresMaxSnap.data() : {};
    seguidoresMaxData[username] = username;
    await setDoc(seguidoresMaxRef, seguidoresMaxData);

    // Adicionar novo usuário como seguidor de realme
    const seguidoresRealRef = doc(db, "users", "realme", "seguidores", "users");
    const seguidoresRealSnap = await getDoc(seguidoresRealRef);
    let seguidoresRealData = seguidoresRealSnap.exists() ? seguidoresRealSnap.data() : {};
    seguidoresRealData[username] = username;
    await setDoc(seguidoresRealRef, seguidoresRealData);

    console.log("✅ Relacionamentos sociais criados");
  } catch (error) {
    console.error("Erro ao criar relacionamentos sociais:", error);
    // Não é crítico, pode continuar
  }
}

// ===================
// FUNÇÃO PRINCIPAL DE CRIAÇÃO DE CONTA
// ===================
async function criarContaSegura(event) {
  event.preventDefault();
  hideMessages();

  // Capturar dados do formulário
  let username = document.getElementById('usuario').value.trim().toLowerCase();
  const nome = document.getElementById('nome').value.trim();
  const sobrenome = document.getElementById('sobrenome').value.trim();
  const email = document.getElementById('email').value.trim().toLowerCase();
  const idade = parseInt(document.getElementById('idade').value.trim());
  const genero = document.getElementById('genero').value;
  const senha = document.getElementById('senha').value.trim();

  // Validações básicas
  if (!username || !nome || !sobrenome || !email || !idade || !genero || !senha) {
    showError("Preencha todos os campos obrigatórios.");
    return;
  }

  if (!validarEmail(email)) {
    showError("Digite um email válido.");
    return;
  }

  if (!validarUsername(username)) {
    showError("Username deve ter 3-20 caracteres e conter apenas letras, números e underscore.");
    return;
  }

  if (!validarSenha(senha)) {
    showError("Senha deve ter pelo menos 8 caracteres, incluindo letras e números.");
    return;
  }

  if (!validarIdade(idade)) {
    showError("Idade deve estar entre 13 e 120 anos.");
    return;
  }

  showLoading(true);

  try {
    // ETAPA 1: Verificar disponibilidade
    console.log("Verificando disponibilidade...");
    
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

    // ETAPA 2: Criar conta no Firebase Authentication
    console.log("Criando conta no Firebase Auth...");
    const userCredential = await createUserWithEmailAndPassword(auth, email, senha);
    const user = userCredential.user;

    // ETAPA 3: Atualizar perfil do usuário
    await updateProfile(user, {
      displayName: username
    });

    console.log("✅ Usuário criado no Firebase Auth:", user.uid);

    // ETAPA 4: Reservar o username
    await setDoc(doc(db, "usernames", username), {
      uid: user.uid,
      email: email,
      reservadoEm: serverTimestamp()
    });

    // ETAPA 5: Criar documento principal do usuário (SEGURO)
    const userData = {
      // Dados básicos
      uid: user.uid,
      username: username,
      email: email,
      nome: nome,
      sobrenome: sobrenome,
      idade: idade,
      genero: genero,
      
      // Dados do perfil
      displayname: `${nome} ${sobrenome}`,
      userphoto: "./src/icon/default.jpg",
      backgroundphoto: "",
      headerphoto: "",
      
      // Campos de perfil opcionais (vazios inicialmente)
      visaoGeral: "",
      tags: "",
      estilo: "",
      personalidade: "",
      sonhos: "",
      medos: "",
      musicas: "",
      filmesSeries: "",
      livros: "",
      personagens: "",
      comidas: "",
      hobbies: "",
      jogos: "",
      outrosGostos: "",
      
      // Metadados
      criadoem: serverTimestamp(),
      emailVerified: user.emailVerified,
      ultimoLogin: serverTimestamp(),
      versao: "2.0" // Para diferenciar das contas legadas
    };

    // Salvar na nova coleção segura
    await setDoc(doc(db, "secure_users", user.uid), userData);
    console.log("✅ Dados do usuário salvos com segurança");

    // ETAPA 6: Manter compatibilidade com sistema legado
    const legacyUserData = {
      ...userData,
      password: "***MIGRATED***", // Não salva senha real
      uid: Date.now(), // UID legado diferente
      firebaseUid: user.uid, // Referência ao UID real
      migrated: true
    };

    await setDoc(doc(db, "users", username), legacyUserData);
    console.log("✅ Compatibilidade legada mantida");

    // ETAPA 7: Criar relacionamentos sociais
    await criarRelacionamentosSociais(username, user.uid);

    // ETAPA 8: Atualizar último usuário
    await atualizarUltimoUsuario(username);

    // ETAPA 9: Fazer download do arquivo de informações
    const formData = {
      nome: nome,
      sobrenome: sobrenome,
      usuario: username,
      email: email,
      senha: "***Por segurança, senha não é mostrada***"
    };
    downloadAccountInfo(formData);

    // ETAPA 10: Fazer logout para forçar login manual
    await signOut(auth);

    // ETAPA 11: Sucesso!
    showSuccess("Conta criada com sucesso! Você será redirecionado para o login.");
    document.querySelector('form').reset();

    // Redirecionar após 3 segundos
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 3000);

  } catch (error) {
    console.error("Erro ao criar conta:", error);
    showLoading(false);
    
    // Tratamento de erros específicos do Firebase Auth
    let errorMessage = "Erro ao criar conta. Tente novamente.";
    
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage = "Este email já está sendo usado. Tente fazer login ou use outro email.";
        break;
      case 'auth/invalid-email':
        errorMessage = "Email inválido. Verifique o formato.";
        break;
      case 'auth/operation-not-allowed':
        errorMessage = "Criação de contas está temporariamente desabilitada.";
        break;
      case 'auth/weak-password':
        errorMessage = "Senha muito fraca. Use pelo menos 8 caracteres com letras e números.";
        break;
      case 'auth/network-request-failed':
        errorMessage = "Erro de conexão. Verifique sua internet e tente novamente.";
        break;
      case 'permission-denied':
        errorMessage = "Erro de permissão. Tente novamente em alguns minutos.";
        break;
    }
    
    showError(errorMessage);
  }
}

// ===================
// FUNÇÕES DE VALIDAÇÃO EM TEMPO REAL
// ===================
function configurarValidacoes() {
  // Validação de username
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

  // Validação de email
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

  // Validação de idade
  const idadeInput = document.getElementById('idade');
  if (idadeInput) {
    idadeInput.addEventListener('input', function() {
      const idade = parseInt(this.value);
      
      if (validarIdade(idade)) {
        this.style.borderColor = '#51cf66';
      } else {
        this.style.borderColor = '#ff6b6b';
      }
    });
  }

  // Validação de senha
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
}

// ===================
// FUNÇÃO DE DOWNLOAD (MANTIDA E MELHORADA)
// ===================
function downloadAccountInfo(formData) {
  const htmlContent = `<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Minha Conta RealMe</title>
    <style>
        * {margin: 0; padding: 0; box-sizing: border-box; font-family: Arial, sans-serif;}
        body {background-image: url("src/bg/bg.jpg"); background-size: cover; color: #dbdbdb; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 20px;}
        .container {background: rgba(20, 20, 20, 0.9); backdrop-filter: blur(8px); border: 1px solid #2a2a2a; border-radius: 12px; padding: 30px 40px; width: 100%; max-width: 620px; margin-top: 80px;}
        h1 {text-align: center; color: #f7f7f7; margin-bottom: 25px; font-weight: 700;}
        nav {background: linear-gradient(0deg, #141414 0%, #1F1F1F 100%); border-bottom: 1px solid #121212; display: flex; align-items: center; padding: 0px 20px; position: fixed; top: 0; left: 0; right: 0; z-index: 1000;}
        .logo {font-weight: bold; font-size: 30px; color: #707070; padding: 10px;}
        .user-information {padding: 20px;}
        .alert {padding: 20px 0px;}
        b {color: #4A90E2;}
        span {color: #4A90E2;}
        p {font-size: 18px; margin: 10px 0;}
        .security-notice {background: rgba(74, 144, 226, 0.1); border: 1px solid #4A90E2; padding: 15px; border-radius: 8px; margin: 20px 0;}
    </style>
</head>
<body>
    <nav>
        <div class="logo_area">
            <div class="logo">RealMe</div>
        </div>
    </nav>
    <div class="container">
        <h1>Informações de Conta <span>RealMe</span>!</h1>
        <p>Olá ${formData.nome}! Sua conta foi criada com segurança usando Firebase Authentication.</p>
        
        <div class="user-information">
            <p><b>Nome Completo:</b> ${formData.nome} ${formData.sobrenome}</p>
            <p><b>Usuário:</b> ${formData.usuario}</p>
            <p><b>E-mail:</b> ${formData.email}</p>
            <p><b>Sistema:</b> Firebase Auth (Seguro)</p>
        </div>
        
        <div class="security-notice">
            <p><b>🔐 Segurança:</b></p>
            <p>• Sua senha está protegida pelo Firebase Authentication</p>
            <p>• Use seu <b>email</b> para fazer login</p>
            <p>• Sua conta está totalmente segura</p>
        </div>
        
        <div class="alert">
            Conta criada em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
        </div>
    </div>
</body>
</html>`;
  
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = formData.usuario + '_conta_realme_segura.html';
  a.click();
  window.URL.revokeObjectURL(url);
}

// ===================
// INICIALIZAÇÃO
// ===================
function inicializar() {
  console.log("Inicializando sistema de cadastro 100% seguro...");
  
  configurarValidacoes();
  
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', criarContaSegura);
    console.log("✅ Sistema de cadastro seguro ativo");
  } else {
    console.error("❌ Formulário não encontrado");
  }
}

// Inicialização
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

window.addEventListener('load', inicializar);