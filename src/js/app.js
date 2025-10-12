/**
 * RealMe - Sistema de Notificações em Tempo Real
 * 
 * Este arquivo gerencia o sistema de notificações push para administradores.
 * Monitora eventos no Firebase e envia notificações quando:
 * - Um novo usuário é adicionado à coleção 'users'
 * - Um novo post é adicionado à coleção 'posts'
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  onSnapshot,
  query,
  orderBy,
  limit,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { 
  getMessaging, 
  getToken, 
  onMessage 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging.js";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  databaseURL: "https://ifriendmatch-default-rtdb.firebaseio.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const messaging = getMessaging(app);

// Lista de administradores (UIDs que receberão notificações)
// TODO: Mover para Firebase Firestore em produção
const ADMIN_UIDS = ['admin_uid_placeholder'];

// Estado da aplicação
let isAdmin = false;
let notificationPermission = 'default';

/**
 * Verifica se o usuário atual é um administrador
 */
async function checkIfAdmin() {
  try {
    const usuarioLogado = localStorage.getItem('usuarioLogado');
    if (!usuarioLogado) {
      addLog('⚠️ Usuário não está logado', 'warning');
      return false;
    }
    
    const userData = JSON.parse(usuarioLogado);
    const userDoc = await getDoc(doc(db, 'users', userData.uid || userData.username));
    
    if (userDoc.exists()) {
      const data = userDoc.data();
      isAdmin = data.isAdmin === true || ADMIN_UIDS.includes(userData.uid);
      
      if (isAdmin) {
        addLog('✅ Acesso de administrador confirmado', 'success');
      } else {
        addLog('❌ Acesso negado - Apenas administradores podem receber notificações', 'error');
      }
      
      return isAdmin;
    }
    
    return false;
  } catch (error) {
    console.error('Erro ao verificar administrador:', error);
    addLog(`❌ Erro ao verificar permissões: ${error.message}`, 'error');
    return false;
  }
}

/**
 * Adiciona um log à interface do usuário
 * @param {string} message - Mensagem do log
 * @param {string} type - Tipo do log (info, success, warning, error)
 */
function addLog(message, type = 'info') {
  const logContainer = document.getElementById('logs');
  if (!logContainer) return;
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${type}`;
  
  const timestamp = new Date().toLocaleTimeString('pt-BR');
  logEntry.innerHTML = `<span class="log-time">[${timestamp}]</span> ${message}`;
  
  logContainer.insertBefore(logEntry, logContainer.firstChild);
  
  // Limitar a 100 logs
  if (logContainer.children.length > 100) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

/**
 * Solicita permissão para notificações push
 */
async function requestNotificationPermission() {
  try {
    addLog('📢 Solicitando permissão para notificações...', 'info');
    
    const permission = await Notification.requestPermission();
    notificationPermission = permission;
    
    if (permission === 'granted') {
      addLog('✅ Permissão para notificações concedida!', 'success');
      
      // Registrar o service worker
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        addLog('✅ Service Worker registrado com sucesso', 'success');
        
        // Obter token FCM
        try {
          const token = await getToken(messaging, {
            vapidKey: 'YOUR_VAPID_KEY_HERE', // TODO: Adicionar VAPID key real
            serviceWorkerRegistration: registration
          });
          
          if (token) {
            addLog(`🔑 Token FCM obtido: ${token.substring(0, 20)}...`, 'success');
            // TODO: Salvar token no Firestore para o usuário admin
          }
        } catch (tokenError) {
          console.error('Erro ao obter token FCM:', tokenError);
          addLog('⚠️ Não foi possível obter token FCM (esperado em desenvolvimento)', 'warning');
        }
      }
      
      updatePermissionButton();
      startListeners();
    } else if (permission === 'denied') {
      addLog('❌ Permissão para notificações negada', 'error');
      updatePermissionButton();
    } else {
      addLog('⚠️ Permissão para notificações não concedida', 'warning');
      updatePermissionButton();
    }
  } catch (error) {
    console.error('Erro ao solicitar permissão:', error);
    addLog(`❌ Erro ao solicitar permissão: ${error.message}`, 'error');
  }
}

/**
 * Atualiza o texto do botão de permissão
 */
function updatePermissionButton() {
  const button = document.getElementById('requestPermissionBtn');
  if (!button) return;
  
  if (notificationPermission === 'granted') {
    button.textContent = '✅ Notificações Ativadas';
    button.disabled = true;
    button.classList.add('granted');
  } else if (notificationPermission === 'denied') {
    button.textContent = '❌ Permissão Negada';
    button.disabled = true;
    button.classList.add('denied');
  }
}

/**
 * Inicia os listeners do Firebase para monitorar novos usuários e posts
 */
function startListeners() {
  if (!isAdmin) {
    addLog('❌ Listeners não iniciados - usuário não é administrador', 'error');
    return;
  }
  
  addLog('🎧 Iniciando listeners do Firebase...', 'info');
  
  // Listener para novos usuários
  const usersQuery = query(
    collection(db, 'users'),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  
  let isFirstUsersSnapshot = true;
  onSnapshot(usersQuery, (snapshot) => {
    // Ignorar o primeiro snapshot para evitar notificações de dados antigos
    if (isFirstUsersSnapshot) {
      isFirstUsersSnapshot = false;
      addLog('✅ Listener de usuários ativo', 'success');
      return;
    }
    
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const userData = change.doc.data();
        const username = userData.username || userData.displayname || 'Desconhecido';
        
        addLog(`👤 Novo usuário: ${username}`, 'info');
        
        // Enviar notificação do navegador
        if (notificationPermission === 'granted') {
          new Notification('Novo Usuário no RealMe! 🎉', {
            body: `${username} acabou de se registrar!`,
            icon: userData.userphoto || '/src/icon/icon.png',
            badge: '/src/icon/icon.png',
            tag: 'new-user',
            requireInteraction: false
          });
        }
      }
    });
  }, (error) => {
    console.error('Erro no listener de usuários:', error);
    addLog(`❌ Erro no listener de usuários: ${error.message}`, 'error');
  });
  
  // Listener para novos posts
  const postsQuery = query(
    collection(db, 'posts'),
    orderBy('create', 'desc'),
    limit(1)
  );
  
  let isFirstPostsSnapshot = true;
  onSnapshot(postsQuery, (snapshot) => {
    // Ignorar o primeiro snapshot
    if (isFirstPostsSnapshot) {
      isFirstPostsSnapshot = false;
      addLog('✅ Listener de posts ativo', 'success');
      return;
    }
    
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const postData = change.doc.data();
        const content = postData.content || postData.texto || 'Novo post';
        const author = postData.username || 'Anônimo';
        
        addLog(`📝 Novo post de ${author}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`, 'info');
        
        // Enviar notificação do navegador
        if (notificationPermission === 'granted') {
          new Notification('Novo Post no RealMe! 📝', {
            body: `${author}: ${content.substring(0, 100)}`,
            icon: '/src/icon/icon.png',
            badge: '/src/icon/icon.png',
            tag: 'new-post',
            requireInteraction: false
          });
        }
      }
    });
  }, (error) => {
    console.error('Erro no listener de posts:', error);
    addLog(`❌ Erro no listener de posts: ${error.message}`, 'error');
  });
}

/**
 * Listener para mensagens FCM em foreground
 */
onMessage(messaging, (payload) => {
  console.log('Mensagem recebida (foreground):', payload);
  
  const notificationTitle = payload.notification?.title || 'Nova Notificação';
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: payload.notification?.icon || '/src/icon/icon.png'
  };
  
  if (notificationPermission === 'granted') {
    new Notification(notificationTitle, notificationOptions);
  }
  
  addLog(`📬 ${notificationTitle}: ${notificationOptions.body}`, 'info');
});

/**
 * Inicialização da aplicação
 */
document.addEventListener('DOMContentLoaded', async () => {
  addLog('🚀 Iniciando sistema de notificações do RealMe...', 'info');
  
  // Verificar suporte a notificações
  if (!('Notification' in window)) {
    addLog('❌ Este navegador não suporta notificações', 'error');
    return;
  }
  
  // Verificar permissão atual
  notificationPermission = Notification.permission;
  updatePermissionButton();
  
  if (notificationPermission === 'granted') {
    addLog('✅ Permissão para notificações já concedida', 'success');
  }
  
  // Verificar se é administrador
  const isAdminUser = await checkIfAdmin();
  
  if (isAdminUser && notificationPermission === 'granted') {
    // Se já tem permissão e é admin, iniciar listeners automaticamente
    startListeners();
  }
  
  // Configurar botão de permissão
  const permissionBtn = document.getElementById('requestPermissionBtn');
  if (permissionBtn) {
    permissionBtn.addEventListener('click', requestNotificationPermission);
  }
  
  addLog('✅ Sistema inicializado', 'success');
});

// Exportar funções para uso global (se necessário)
window.requestNotificationPermission = requestNotificationPermission;