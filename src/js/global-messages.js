import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// Firebase config (use o mesmo de seu projeto)
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
const db = getFirestore(app);
const auth = getAuth(app);

const audioReceive = new Audio('./src/audio/msg recive.mp3');

// Fila de mensagens para popup
let popupQueue = [];
let showingPopup = false;

// Mensagens já mostradas (persistente entre páginas) - REINTRODUZIDO
let shownMsgIds = new Set();
const SHOWN_MSGS_KEY = "shownMsgIds";

// Carrega do localStorage ao iniciar - REINTRODUZIDO
function loadShownMsgIds() {
  try {
    const arr = JSON.parse(localStorage.getItem(SHOWN_MSGS_KEY));
    if (Array.isArray(arr)) arr.forEach(id => shownMsgIds.add(id));
  } catch {}
}
function saveShownMsgIds() {
  localStorage.setItem(SHOWN_MSGS_KEY, JSON.stringify(Array.from(shownMsgIds)));
}
loadShownMsgIds();

// Função para iniciar a transição de fechamento do popup
function hidePopup(popup, isMobile, timeoutId) {
    if (!showingPopup) return; // Evita fechar algo que já está sendo fechado

    // Limpa o timeout original de 5 segundos
    clearTimeout(timeoutId);

    if (isMobile) {
      popup.style.opacity = '0';
      popup.style.transform = 'translateY(-100%)';
    } else {
      popup.style.opacity = '0';
    }
    
    showingPopup = false;
    
    // Espera a transição terminar antes de processar a próxima mensagem
    setTimeout(() => {
      // Remove os listeners de toque para evitar vazamentos de memória ou bugs
      popup.ontouchstart = null;
      popup.ontouchmove = null;
      popup.ontouchend = null;
      
      if (popupQueue.length > 0) {
        const next = popupQueue.shift();
        showMessagePopup(next.senderName, next.senderPhoto, next.content, next.chatId, next.msgId);
      }
    }, 350);
}


function showMessagePopup(senderName, senderPhoto, content, chatId, msgId) {
  let popup = document.getElementById('global-msg-popup');
  const isMobile = window.innerWidth <= 768;
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'global-msg-popup';
    popup.style.position = 'fixed';
    popup.style.zIndex = '9999';
    popup.style.background = '#282c34fa';
    popup.style.color = '#fff';
    popup.style.fontFamily = 'Inter, Arial, sans-serif';
    popup.style.cursor = 'pointer';
    popup.style.display = 'flex';
    popup.style.alignItems = 'center';
    popup.style.gap = '16px';
    popup.style.transition = isMobile
      ? 'transform 0.35s, opacity 0.3s'
      : 'opacity 0.3s';
    popup.style.boxSizing = 'border-box';

    if (isMobile) {
      popup.style.top = '0';
      popup.style.left = '0';
      popup.style.right = '0';
      popup.style.margin = '8px 14px';
      popup.style.borderRadius = '14px';
      popup.style.padding = '18px 24px';
      popup.style.maxWidth = '93vw';
      popup.style.width = '93vh';
      popup.style.transform = 'translateY(-100%)';
      popup.style.opacity = '0';
      popup.style.backdropFilter = 'blur(8px)';
      popup.style.background = '#020202a2';
      popup.style.border = '1px solid #1a1a1a';
    } else {
      popup.style.bottom = '32px';
      popup.style.right = '32px';
      popup.style.borderRadius = '14px';
      popup.style.padding = '18px 24px';
      popup.style.maxWidth = '340px';
      popup.style.transform = '';
      popup.style.opacity = '0';
    }
    document.body.appendChild(popup);
  }

  popup.innerHTML = `
    <img src="${senderPhoto}" alt="Foto" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
    <div>
      <strong>${senderName}</strong><br>
      <div style="margin-top:6px;font-size:1.05em;">${content.length > 80 ? content.slice(0,80)+'...' : content}</div>
    </div>
  `;

  if (isMobile) {
    popup.style.opacity = '1';
    popup.style.transform = 'translateY(0)';
  } else {
    popup.style.opacity = '1';
    popup.style.transform = '';
  }

  popup.onclick = () => {
    // Abre a conversa
    if (isMobile) {
      window.location.href = `direct-mobile.html?chat=${chatId}`;
    } else {
      window.location.href = `direct.html?chat=${chatId}`;
    }
  };

  showingPopup = true;
  audioReceive.play();
  
  // REINTRODUZIDO: Marca a mensagem como 'mostrada' para não aparecer em popup novamente
  shownMsgIds.add(msgId);
  saveShownMsgIds();
  
  // Timeout de fechamento automático
  const autoCloseTimeout = setTimeout(() => {
    hidePopup(popup, isMobile, autoCloseTimeout);
  }, 5000);

  // Lógica de Swipe Up (Mini arrasto) - Apenas para Mobile
  if (isMobile) {
    let touchstartY = 0;
    let touchendY = 0;
    const SWIPE_THRESHOLD = -25; // Precisa arrastar 25px para cima para fechar

    popup.ontouchstart = e => {
      // e.touches[0].clientY é a coordenada Y do primeiro dedo
      touchstartY = e.touches[0].clientY;
    };

    popup.ontouchmove = e => {
      // Opcional: Aqui você pode adicionar lógica para o popup seguir o dedo,
      // mas vamos focar apenas no touchend para manter simples.
    };

    popup.ontouchend = e => {
      // e.changedTouches[0].clientY é a coordenada Y ao levantar o dedo
      touchendY = e.changedTouches[0].clientY;
      
      const deltaY = touchendY - touchstartY; // Movimento vertical (negativo = para cima)

      if (deltaY < SWIPE_THRESHOLD) {
        // Gesto de swipe up detectado!
        hidePopup(popup, isMobile, autoCloseTimeout);
      }
    };
  }
}

// Listener global
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  const loggedUser = user.uid;
  const chatsRef = collection(db, "chats");
  const q = query(chatsRef, where("participants", "array-contains", loggedUser));
  onSnapshot(q, async (chatsSnap) => {
    chatsSnap.forEach(chatDoc => {
      const chatId = chatDoc.id;
      const msgsRef = collection(db, "chats", chatId, "messages");
      // Ordena por timestamp para garantir ordem
      const msgsQuery = query(msgsRef, orderBy("timestamp", "asc"));
      onSnapshot(msgsQuery, async (msgsSnap) => {
        let newMsgs = [];
        msgsSnap.docChanges().forEach(change => {
          if (change.type === "added") {
            const msg = change.doc.data();
            const msgId = change.doc.id;
            
            // CONDIÇÃO ATUAL: Não enviada por mim E nunca mostrada E não lida
            if (
              msg.sender !== loggedUser &&
              !shownMsgIds.has(msgId) && // REINTRODUZIDO: Verifica o LocalStorage
              (msg.read === undefined || msg.read === false)
            ) {
              newMsgs.push({msg, msgId});
            }
          }
        });
        // Adiciona à fila, da mais velha para a mais recente
        for (const {msg, msgId} of newMsgs) {
          let senderName = msg.sender;
          let senderPhoto = "./src/icon/default.jpg";
          try {
            const senderDoc = await getDoc(doc(db, "users", msg.sender));
            if (senderDoc.exists()) {
              const data = senderDoc.data();
              senderName = data.displayname || data.username || msg.sender;
            }
            const senderMediaDoc = await getDoc(doc(db, "users", msg.sender, "user-infos", "user-media"));
            if (senderMediaDoc.exists()) {
              const data = senderMediaDoc.data();
              if (data.userphoto) senderPhoto = data.userphoto;
            }
          } catch {}
          popupQueue.push({
            senderName,
            senderPhoto,
            content: msg.content || "",
            chatId,
            msgId
          });
        }
        // Se não está mostrando popup, mostra o próximo da fila
        if (!showingPopup && popupQueue.length > 0) {
          const next = popupQueue.shift();
          showMessagePopup(next.senderName, next.senderPhoto, next.content, next.chatId, next.msgId);
        }
      });
    });
  });
});