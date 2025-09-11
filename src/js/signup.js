// Importações do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-analytics.js";

// Configurações do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const analytics = getAnalytics(app);

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
    // Não interrompe o processo se houver erro no marquee
  }
}

// ===================
// FUNÇÃO PARA CRIAR CONTA (ATUALIZADA)
// ===================
async function criarConta(event) {
  event.preventDefault();

  // Força o username em minúsculo
  let username = document.getElementById('usuario').value.trim().toLowerCase();
  const nome = document.getElementById('nome').value.trim();
  const sobrenome = document.getElementById('sobrenome').value.trim();
  const email = document.getElementById('email').value.trim();
  const idade = parseInt(document.getElementById('idade').value.trim());
  const genero = document.getElementById('genero').value;
  const senha = document.getElementById('senha').value.trim();

  // Validação básica
  if (!username || !nome || !sobrenome || !email || !idade || !genero || !senha) {
    alert("Preencha todos os campos.");
    return;
  }

  // Validações adicionais
  if (username.length < 3) {
    alert("Nome de usuário deve ter pelo menos 3 caracteres.");
    return;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
  alert("Nome de usuário só pode conter letras, números e underline (_).");
  return;
}

  if (senha.length < 6) {
    alert("Senha deve ter pelo menos 6 caracteres.");
    return;
  }

  if (idade < 13 || idade > 120) {
    alert("Idade deve estar entre 13 e 120 anos.");
    return;
  }

  // Validação de email básica
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert("Digite um email válido.");
    return;
  }

  try {
    // Verificar se o username já existe
    const userRef = doc(db, "users", username);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      alert("Nome de usuário já está em uso. Tente outro.");
      return;
    }

    // Gerar UID único baseado em timestamp
    const uid = Date.now();

    // Criar o documento do usuário
    await setDoc(userRef, {
      username: username,
      nome: nome,
      sobrenome: sobrenome,
      email: email,
      idade: idade,
      genero: genero,
      password: senha, // Em produção, hash a senha!
      uid: uid,
      criadoem: serverTimestamp(),
      
      // Campos padrão para o perfil
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
      outrosGostos: ""
    });
    
    console.log("Conta criada com sucesso para:", username);

    // Criar subcoleção "seguindo" do novo usuário
await setDoc(doc(db, "users", username, "seguindo", "users"), {
  maxgfortes: "maxgfortes",
  realme: "realme"
});

// Criar seguidores em maxgfortes
const seguidoresMaxRef = doc(db, "users", "maxgfortes", "seguidores", "users");
const seguidoresMaxSnap = await getDoc(seguidoresMaxRef);
let seguidoresMaxData = seguidoresMaxSnap.exists() ? seguidoresMaxSnap.data() : {};
seguidoresMaxData[username] = username;
await setDoc(seguidoresMaxRef, seguidoresMaxData);

// Criar seguidores em realme
const seguidoresRealRef = doc(db, "users", "realme", "seguidores", "users");
const seguidoresRealSnap = await getDoc(seguidoresRealRef);
let seguidoresRealData = seguidoresRealSnap.exists() ? seguidoresRealSnap.data() : {};
seguidoresRealData[username] = username;
await setDoc(seguidoresRealRef, seguidoresRealData);


    // *** ATUALIZAR ÚLTIMO USUÁRIO NO MARQUEE ***
    await atualizarUltimoUsuario(username);

    // Sucesso - limpar formulário e redirecionar
    alert("Conta criada com sucesso! Você será redirecionado para o login.");
    document.querySelector('form').reset();

    // Redireciona para a página de login após 1 segundo
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1000);

  } catch (error) {
    console.error("Erro ao criar conta:", error);
    
    // Mensagem de erro mais específica
    if (error.code === 'permission-denied') {
      alert("Erro de permissão. Verifique as configurações do Firebase.");
    } else if (error.code === 'network-error') {
      alert("Erro de conexão. Verifique sua internet e tente novamente.");
    } else {
      alert("Erro ao criar conta. Tente novamente em alguns instantes.");
    }
  }
}

// ===================
// FUNÇÃO PARA VALIDAR ENTRADA DO USERNAME EM TEMPO REAL
// ===================
function configurarValidacaoUsername() {
  const usernameInput = document.getElementById('usuario');
  if (usernameInput) {
    usernameInput.addEventListener('input', function() {
      // Forçar minúsculo e remover espaços
      this.value = this.value.toLowerCase().replace(/\s/g, '');
      
      // Remover caracteres especiais (manter apenas letras, números e _)
      this.value = this.value.replace(/[^a-z0-9_]/g, '');
      
      // Feedback visual
      if (this.value.length < 3) {
        this.style.borderColor = '#ff6b6b';
      } else {
        this.style.borderColor = '#51cf66';
      }
    });
  }
}

// ===================
// FUNÇÃO PARA VALIDAR IDADE
// ===================
function configurarValidacaoIdade() {
  const idadeInput = document.getElementById('idade');
  if (idadeInput) {
    idadeInput.addEventListener('input', function() {
      const idade = parseInt(this.value);
      
      if (isNaN(idade) || idade < 13 || idade > 120) {
        this.style.borderColor = '#ff6b6b';
      } else {
        this.style.borderColor = '#51cf66';
      }
    });
  }
}

// Função para fazer download do arquivo HTML
function downloadAccountInfo(formData) {
  const htmlContent = '<!DOCTYPE html><html lang="pt-br"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Minha Conta RealMe</title><style>* {margin: 0;padding: 0;box-sizing: border-box;font-family: Arial, sans-serif;}body {background-image: url("src/bg/bg.jpg");background-size: cover;color: #dbdbdb;display: flex;justify-content: center;align-items: center;height: 100vh;}.container {background: rgba(20, 20, 20, 0.247);backdrop-filter: blur(8px);border: 1px solid #2a2a2a;border-radius: 12px;padding: 30px 40px;width: 100%;max-width: 620px;margin-top: 80px;}h1 {text-align: center;color: #f7f7f7;margin-bottom: 25px;font-weight: 700;}nav {background: linear-gradient(0deg, #141414 0%, #1F1F1F 100%);border-bottom: 1px solid #121212;display: flex;align-items: center;padding: 0px 20px;position: fixed;top: 0;left: 0;right: 0;z-index: 1000;}.logo {font-weight: bold;font-size: 30px;color: #707070;padding: 10px;}.user-information {padding: 20px;}.alert{padding: 20px 0px;}b{color:#4A90E2}span{color:#4A90E2}p{font-size: 20px;}a{color:#4A90E2;}</style></head><body><nav><div class="logo_area"><div class="logo">RealMe</div></div></nav><div class="container"><h1>informações de conta <span>RealMe</span>!</h1><p>Olá ' + formData.nome + '! Logo abaixo está salvo seu usuário e senha da sua conta RealMe</p><div class="user-information"><p><b>Nome Completo:</b> ' + formData.nome + ' ' + formData.sobrenome + '</p><p><b>Usuário:</b> ' + formData.usuario + '</p><p><b>E-mail:</b> ' + formData.email + '</p><p><b>Senha:</b> ' + formData.senha + '</p></div><div class="alert">Este usuario e senha foi salva em ' + new Date().toLocaleDateString('pt-BR') + '</div></div></body></html>';
  
  const blob = new Blob([htmlContent], { type: 'text/html' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = formData.usuario + '_conta_realme.html';
  a.click();
  window.URL.revokeObjectURL(url);
}

// Chame essa função após criar a conta com sucesso:
// downloadAccountInfo({nome: 'João', sobrenome: 'Silva', usuario: 'joao123', email: 'joao@email.com', senha: 'minhasenha'});

// ===================
// FUNÇÃO PARA VALIDAR EMAIL
// ===================
function configurarValidacaoEmail() {
  const emailInput = document.getElementById('email');
  if (emailInput) {
    emailInput.addEventListener('blur', function() {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      if (!emailRegex.test(this.value)) {
        this.style.borderColor = '#ff6b6b';
      } else {
        this.style.borderColor = '#51cf66';
      }
    });
  }
}

// ===================
// FUNÇÃO DE INICIALIZAÇÃO
// ===================
function inicializar() {
  // Configurar validações em tempo real
  configurarValidacaoUsername();
  configurarValidacaoIdade();
  configurarValidacaoEmail();
  
  // Adicionar evento ao formulário
  const form = document.querySelector('form');
  if (form) {
    form.addEventListener('submit', criarConta);
    console.log("Sistema de criação de conta inicializado");
  } else {
    console.error("Formulário não encontrado");
  }
}

// ===================
// INICIALIZAÇÃO QUANDO DOM CARREGA
// ===================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

// Também adicionar para compatibilidade
window.addEventListener('load', inicializar);