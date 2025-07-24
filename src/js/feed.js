// greeting-fix.js - Solução corrigida baseada na estrutura do Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Função para determinar saudação baseada no horário
function getGreetingByHour() {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  
  // Saudações especiais para dias da semana (apenas em horários normais)
  if (hour >= 6 && hour <= 22) {
    switch (day) {
      case 0: return "Feliz domingo,"; // Domingo
      case 1: return "Segunda produtiva,"; // Segunda
      case 5: return "Sexta-feira chegou,"; // Sexta
      case 6: return "Bom sábado,"; // Sábado
    }
  }
  
  // Saudações baseadas no horário
  if (hour >= 0 && hour < 6) return "Boa madrugada,";
  if (hour >= 6 && hour < 12) return "Bom dia,";
  if (hour >= 12 && hour < 18) return "Boa tarde,";
  return "Boa noite,";
}

// Função principal para carregar saudação
async function carregarSaudacao() {
  const greetingElem = document.getElementById('greeting');
  const usernameElem = document.querySelector('.username');
  
  if (!greetingElem || !usernameElem) {
    console.log('Elementos de saudação não encontrados');
    return;
  }

  // Pegar username do parâmetro URL ou da sessão
  const urlParams = new URLSearchParams(window.location.search);
  const username = urlParams.get('user') || sessionStorage.getItem('username');

  console.log('Username obtido:', username);

  if (!username) {
    console.log('Username não encontrado, redirecionando...');
    window.location.href = 'login.html';
    return;
  }

  // Salvar username na sessão
  sessionStorage.setItem('username', username);

  // Atualizar saudação baseada no horário
  const greeting = getGreetingByHour();
  greetingElem.textContent = greeting;
  console.log('Saudação definida:', greeting);

  try {
    // Buscar dados do usuário no Firestore na coleção "users"
    const userDoc = doc(db, "users", username);
    const userSnap = await getDoc(userDoc);

    console.log('Buscando usuário:', username);
    console.log('Documento existe:', userSnap.exists());

    if (userSnap.exists()) {
      const data = userSnap.data();
      console.log('Dados do usuário:', data);
      
      // Extrair informações do usuário baseado na estrutura mostrada no Firebase
      const nomeCompleto = data.nome || data.username || username;
      const sobrenome = data.sobrenome || '';
      const location = data.location || '';
      const idade = data.idade || '';
      
      // Construir nome de exibição
      let displayName = nomeCompleto;
      if (sobrenome) {
        displayName = `${nomeCompleto} ${sobrenome}`;
      }
      
      // Construir texto completo do usuário
      let userText = displayName;
      
      // Adicionar informações extras se disponíveis
      const infoExtras = [];
      if (idade) infoExtras.push(`${idade} anos`);
      if (location) infoExtras.push(location);
      
      if (infoExtras.length > 0) {
        userText += ` • ${infoExtras.join(' • ')}`;
      }
      
      // Adicionar informação contextual baseada no horário
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

    // Adicionar animação suave
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

// Função para obter informação contextual baseada no horário
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

// Função para atualizar saudação periodicamente
function iniciarAtualizacaoAutomatica() {
  setInterval(() => {
    const greetingElem = document.getElementById('greeting');
    if (greetingElem) {
      const newGreeting = getGreetingByHour();
      if (greetingElem.textContent !== newGreeting) {
        // Animação suave para mudança de saudação
        greetingElem.style.transition = 'opacity 0.4s ease';
        greetingElem.style.opacity = '0.6';
        
        setTimeout(() => {
          greetingElem.textContent = newGreeting;
          greetingElem.style.opacity = '1';
        }, 200);
      }
    }
  }, 30000); // Verificar a cada 30 segundos
}

// Adicionar estilos melhorados
function adicionarEstilos() {
  const style = document.createElement('style');
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
    
    /* Responsividade melhorada */
    @media (max-width: 768px) {
      .username {
        font-size: 0.9em;
        line-height: 1.4;
      }
    }
  `;
  
  // Remover estilo anterior se existir
  const existingStyle = document.getElementById('greeting-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  style.id = 'greeting-styles';
  document.head.appendChild(style);
}

// Função para debug - verificar se tudo está funcionando
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

// Inicializar sistema quando DOM estiver pronto
function inicializar() {
  console.log('Inicializando sistema de saudação...');
  
  // Aguardar um pouco para garantir que o DOM está completamente carregado
  setTimeout(() => {
    debugSistema();
    adicionarEstilos();
    carregarSaudacao();
    iniciarAtualizacaoAutomatica();
  }, 100);
}

// Event listeners
document.addEventListener('DOMContentLoaded', inicializar);

// Fallback caso DOMContentLoaded já tenha disparado
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializar);
} else {
  inicializar();
}

// Exportar funções para uso global
window.carregarSaudacao = carregarSaudacao;
window.debugSaudacao = debugSistema;

// Exportar para módulos ES6
export { carregarSaudacao, debugSistema };