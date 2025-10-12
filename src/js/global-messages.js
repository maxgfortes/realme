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

// Mensagens já mostradas (persistente entre páginas)
let shownMsgIds = new Set();
const SHOWN_MSGS_KEY = "shownMsgIds";

// Carrega do localStorage ao iniciar
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

function showMessagePopup(senderName, senderPhoto, content, chatId, msgId) {
  let popup = document.getElementById('global-msg-popup');
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'global-msg-popup';
    popup.style.position = 'fixed';
    popup.style.bottom = '32px';
    popup.style.right = '32px';
    popup.style.zIndex = '9999';
    popup.style.background = 'rgba(40,44,52,0.98)';
    popup.style.color = '#fff';
    popup.style.borderRadius = '14px';
    popup.style.boxShadow = '0 4px 24px rgba(0,0,0,0.18)';
    popup.style.padding = '18px 24px';
    popup.style.display = 'flex';
    popup.style.alignItems = 'center';
    popup.style.gap = '16px';
    popup.style.fontFamily = 'Inter, Arial, sans-serif';
    popup.style.transition = 'opacity 0.3s';
    popup.style.cursor = 'pointer';
    document.body.appendChild(popup);
  }
  popup.innerHTML = `
    <img src="${senderPhoto}" alt="Foto" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
    <div>
      <strong>${senderName}</strong><br>
      <span style="color:#4e8cff;">Nova mensagem:</span>
      <div style="margin-top:6px;font-size:1.05em;">${content.length > 80 ? content.slice(0,80)+'...' : content}</div>
    </div>
  `;
  popup.style.opacity = '1';

  popup.onclick = () => {
    window.location.href = `direct.html?chat=${chatId}`;
  };

  showingPopup = true;
  audioReceive.play();
  shownMsgIds.add(msgId);
  saveShownMsgIds();

  setTimeout(() => {
    popup.style.opacity = '0';
    showingPopup = false;
    setTimeout(() => {
      if (popupQueue.length > 0) {
        const next = popupQueue.shift();
        showMessagePopup(next.senderName, next.senderPhoto, next.content, next.chatId, next.msgId);
      }
    }, 350);
  }, 5000);
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
            // Só mostra se for para o usuário logado, não foi enviado por ele, nunca foi mostrado e não está como lida
            if (
              msg.sender !== loggedUser &&
              !shownMsgIds.has(msgId) &&
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

// Agora, se a mensagem já foi mostrada (id salva no localStorage), ela não aparece mais em popup.
// Para implementar "visto", basta salvar msg.read = true no Firestore e o popup nunca será mostrado para mensagens lidas.