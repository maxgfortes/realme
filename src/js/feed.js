// greeting-fix.js - Solução corrigida baseada na estrutura do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, query, orderBy, limit, getDocs, startAfter } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Config Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501895e3de"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================
// SAUDAÇÃO
// ============================
function getGreetingByHour() {
  const hour = new Date().getHours();
  const day = new Date().getDay();

  if (hour >= 6 && hour <= 22) {
    switch (day) {
      case 0: return "Feliz domingo,";
      case 1: return "Segunda produtiva,";
      case 5: return "Sexta-feira chegou,";
      case 6: return "Bom sábado,";
    }
  }

  if (hour >= 0 && hour < 6) return "Boa madrugada,";
  if (hour >= 6 && hour < 12) return "Bom dia,";
  if (hour >= 12 && hour < 18) return "Boa tarde,";
  return "Boa noite,";
}

async function carregarSaudacao() {
  const greetingElem = document.getElementById('greeting');
  const usernameElem = document.querySelector('.username');

  if (!greetingElem || !usernameElem) {
    console.log('Elementos de saudação não encontrados');
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get('user') || sessionStorage.getItem('username');

  console.log('Username obtido:', username);

  if (!username) {
    console.log('Username não encontrado, redirecionando...');
    window.location.href = 'login.html';
    return;
  }

  sessionStorage.setItem('username', username);

  const greeting = getGreetingByHour();
  greetingElem.textContent = greeting;
  console.log('Saudação definida:', greeting);

  try {
    const userDoc = doc(db, "users", username);
    const userSnap = await getDoc(userDoc);

    console.log('Buscando usuário:', username);
    console.log('Documento existe:', userSnap.exists());

    if (userSnap.exists()) {
      const data = userSnap.data();
      console.log('Dados do usuário:', data);

      const nomeCompleto = data.nome || data.username || username;
      const sobrenome = data.sobrenome || '';
      const location = data.location || '';
      const idade = data.idade || '';

      let displayName = nomeCompleto;
      if (sobrenome) {
        displayName = `${nomeCompleto} ${sobrenome}`;
      }

      let userText = displayName;

      const infoExtras = [];
      if (idade) infoExtras.push(`${idade} anos`);
      if (location) infoExtras.push(location);

      if (infoExtras.length > 0) {
        userText += ` • ${infoExtras.join(' • ')}`;
      }

      const extraInfo = getContextualInfo();
      if (extraInfo) {
        userText += ` ${extraInfo}`;
      }

      usernameElem.textContent = userText;
      console.log('Texto do usuário definido:', userText);

    } else {
      console.log('Usuário não encontrado no Firestore, usando fallback');
      usernameElem.textContent = username;
    }

    usernameElem.style.opacity = '0';
    usernameElem.style.transform = 'translateY(10px)';

    setTimeout(() => {
      usernameElem.style.transition = 'all 0.6s ease-out';
      usernameElem.style.opacity = '1';
      usernameElem.style.transform = 'translateY(0)';
    }, 200);

  } catch (error) {
    console.error("Erro ao carregar saudação:", error);
    usernameElem.textContent = username;
  }
}

function getContextualInfo() {
  const hour = new Date().getHours();
  const isWeekend = [0, 6].includes(new Date().getDay());

  if (hour >= 3 && hour < 6) return "• que madrugada!";
  if (hour >= 11 && hour <= 14) return "• hora do almoço!";
  if (hour >= 18 && hour <= 20) return "• como foi o dia?";
  if (isWeekend && hour >= 9 && hour <= 11) return "• bom descanso!";
  if (hour >= 22 || hour < 2) return "• boa noite!";

  return "";
}

function iniciarAtualizacaoAutomatica() {
  setInterval(() => {
    const greetingElem = document.getElementById('greeting');
    if (greetingElem) {
      const newGreeting = getGreetingByHour();
      if (greetingElem.textContent !== newGreeting) {
        greetingElem.style.transition = 'opacity 0.4s ease';
        greetingElem.style.opacity = '0.6';

        setTimeout(() => {
          greetingElem.textContent = newGreeting;
          greetingElem.style.opacity = '1';
        }, 200);
      }
    }
  }, 30000);
}

function adicionarEstilos() {
  const style = document.createElement('style');
  style.id = 'greeting-styles';
  style.textContent = `
    #greeting {
      font-weight: 700;
      color: #4A90E2;
      text-shadow: 0 1px 3px rgba(74, 144, 226, 0.3);
      transition: all 0.4s ease;
    }
    
    .username {
      font-weight: 500;
      color: #666;
      font-size: 0.95em;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.6s ease-out;
      margin-top: 5px;
    }
    
    .user-welcome h1 {
      margin-bottom: 8px;
    }
    
    .user-welcome {
      animation: fadeInScale 0.8s ease-out;
    }
    
    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    @media (max-width: 768px) {
      .username {
        font-size: 0.9em;
        line-height: 1.4;
      }
    }

    /* Estilos do avião de papel */
    .paper-plane {
      position: fixed;
      top: 20px;
      left: -100px;
      width: 50px;
      height: auto;
      z-index: 10000;
      animation: paper-plane-fly 1.5s ease forwards;
      pointer-events: none;
      user-select: none;
    }

    @keyframes paper-plane-fly {
      0% {
        transform: translateX(-100px) translateY(0) rotate(0deg);
        opacity: 1;
      }
      100% {
        transform: translateX(110vw) translateY(-20px) rotate(20deg);
        opacity: 0;
      }
    }
  `;

  const existingStyle = document.getElementById('greeting-styles');
  if (existingStyle) existingStyle.remove();

  document.head.appendChild(style);
}

// ============================
// FEED INFINITO
// ============================
const POSTS_LIMIT = 10;
let lastVisiblePost = null;
let loadingPosts = false;
let allPostsLoaded = false;

async function carregarPosts(username, append = true) {
  if (loadingPosts || allPostsLoaded) return;
  loadingPosts = true;

  const postsContainer = document.querySelector('#posts-container');
  if (!postsContainer) {
    console.error('Container de posts não encontrado');
    loadingPosts = false;
    return;
  }

  try {
    const postsRef = collection(db, 'users', username, 'posts');
    let postsQuery;

    if (lastVisiblePost) {
      postsQuery = query(postsRef, orderBy('criadoem', 'desc'), startAfter(lastVisiblePost), limit(POSTS_LIMIT));
    } else {
      postsQuery = query(postsRef, orderBy('criadoem', 'desc'), limit(POSTS_LIMIT));
    }

    const querySnapshot = await getDocs(postsQuery);

    if (querySnapshot.empty) {
      allPostsLoaded = true;
      loadingPosts = false;
      return;
    }

    lastVisiblePost = querySnapshot.docs[querySnapshot.docs.length - 1];

    querySnapshot.forEach(doc => {
      const postData = doc.data();
      const postElement = criarElementoPost(postData, doc.id); // Você precisa definir essa função no seu código
      postsContainer.appendChild(postElement);
    });

  } catch (error) {
    console.error('Erro ao carregar posts:', error);
  }

  loadingPosts = false;
}

window.addEventListener('scroll', () => {
  if (loadingPosts || allPostsLoaded) return;

  const scrollTop = window.scrollY;
  const windowHeight = window.innerHeight;
  const docHeight = document.documentElement.offsetHeight;

  if (scrollTop + windowHeight > docHeight - 200) {
    const username = sessionStorage.getItem('username');
    if (username) {
      carregarPosts(username, true);
    }
  }
});

function iniciarFeed(username) {
  lastVisiblePost = null;
  allPostsLoaded = false;
  const postsContainer = document.querySelector('#posts-container');
  if (postsContainer) postsContainer.innerHTML = '';
  carregarPosts(username, false);
}

// ============================
// ANIMAÇÃO DO AVIÃO DE PAPEL (PNG)
// ============================
function animarAviaoPapel() {
  const plane = document.createElement('img');
  plane.src = './path/to/paper-plane.png'; // Ajuste o caminho para o PNG do aviãozinho
  plane.alt = 'Avião de papel';
  plane.className = 'paper-plane';

  document.body.appendChild(plane);

  plane.addEventListener('animationend', () => {
    plane.remove();
  });
}

// Exemplo de função de envio de post integrando animação (adicione no seu fluxo)
async function enviarPost(username, conteudo) {
  // Seu código para enviar o post ao Firestore aqui

  // Após sucesso:
  animarAviaoPapel();
}

// ============================
// DEBUG e inicialização
// ============================
function debugSistema() {
  console.log('=== DEBUG SISTEMA SAUDAÇÃO ===');
  console.log('URL atual:', window.location.href);
  console.log('Parâmetros URL:', window.location.search);
  console.log('Username na sessão:', sessionStorage.getItem('username'));
  console.log('Elemento greeting:', document.getElementById('greeting'));
  console.log('Elemento username:', document.querySelector('.username'));
  console.log('Horário atual:', new Date().getHours());
  console.log('Saudação atual:', getGreetingByHour());
  console.log('===============================');
}

function inicializar() {
  console.log('Inicializando sistema de saudação...');
  
  setTimeout(() => {
    debugSistema();
    adicionarEstilos();
    carregarSaudacao();
    iniciarAtualizacaoAutomatica();

    const username = sessionStorage.getItem('username');
    if (username) iniciarFeed(username);  // Inicia feed ao carregar o sistema
  }, 100);
}

document.addEventListener('DOMContentLoaded', inicializar);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

// Exportar funções para uso global
window.carregarSaudacao = carregarSaudacao;
window.debugSaudacao = debugSistema;
window.iniciarFeed = iniciarFeed;
window.animarAviaoPapel = animarAviaoPapel;
window.enviarPost = enviarPost;

// Exportar para módulos ES6
export { carregarSaudacao, debugSistema, iniciarFeed, animarAviaoPapel, enviarPost };
