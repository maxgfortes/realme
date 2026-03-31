// ====================================================
// notifications.js  (versão OneSignal — sem Cloud Functions)
// Salva o OneSignal Player ID no Firestore quando o
// usuário aceita notificações.
// ====================================================

import {
  getFirestore,
  doc,
  setDoc,
  collection,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Suas chaves OneSignal ──────────────────────────────────────────────────
const ONESIGNAL_APP_ID   = 'f850c21b-122e-4ae7-b262-5cc3c101f7ab';

// 🔑 Pega em: onesignal.com → seu app → Settings → Keys & IDs → REST API Key
const ONESIGNAL_REST_KEY = 'SUA_REST_API_KEY_AQUI';

// ─── Salvar Player ID no Firestore ─────────────────────────────────────────
async function salvarPlayerId(playerId) {
  const user = auth.currentUser;
  if (!user || !playerId) return;

  await setDoc(
    doc(db, 'users', user.uid, 'onesignalTokens', playerId),
    { playerId, updatedAt: serverTimestamp() }
  );
  console.log('✅ OneSignal Player ID salvo:', playerId);
}

// ─── Inicializar OneSignal e salvar token ───────────────────────────────────
export async function initPushNotifications() {
  // Aguarda o OneSignal SDK carregar (inserido via <script> no HTML)
  await new Promise((resolve) => {
    if (window.OneSignal) return resolve();
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const original = window.OneSignalDeferred.push.bind(window.OneSignalDeferred);
    window.OneSignalDeferred.push = (fn) => { original(fn); resolve(); };
    setTimeout(resolve, 4000); // fallback
  });

  try {
    const OneSignal = window.OneSignal;
    if (!OneSignal) {
      console.warn('⚠️ OneSignal SDK não encontrado.');
      return;
    }

    // Pede permissão ao usuário (mostra o popup do navegador)
    await OneSignal.Notifications.requestPermission();

    // Aguarda o SDK registrar o dispositivo
    await new Promise(r => setTimeout(r, 1500));

    // Pega o Player ID gerado para este dispositivo
    const playerId = OneSignal.User?.PushSubscription?.id;
    if (playerId) await salvarPlayerId(playerId);

  } catch (err) {
    console.warn('⚠️ Erro ao inicializar OneSignal:', err);
  }
}

// ─── Enviar notificação de like via OneSignal REST API ──────────────────────
export async function enviarNotificacaoLike(donoDoPostUid, likerUsername, postId) {
  try {
    // Busca os Player IDs salvos do dono do post
    const tokensRef   = collection(db, 'users', donoDoPostUid, 'onesignalTokens');
    const tokensSnap  = await getDocs(tokensRef);

    if (tokensSnap.empty) return; // dono não habilitou notificações

    const playerIds = tokensSnap.docs
      .map(d => d.data().playerId)
      .filter(Boolean);

    if (playerIds.length === 0) return;

    // Envia via REST API do OneSignal
    const resp = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_REST_KEY}`
      },
      body: JSON.stringify({
        app_id: ONESIGNAL_APP_ID,
        include_player_ids: playerIds,
        headings: { en: 'Nova curtida! ❤️', pt: 'Nova curtida! ❤️' },
        contents: {
          en: `${likerUsername} curtiu seu post`,
          pt: `${likerUsername} curtiu seu post`
        },
        data: { postId, type: 'like' },
        web_url: `https://ifriendmatch.web.app/feed.html?postId=${postId}`
      })
    });

    if (resp.ok) {
      console.log(`✅ Notificação de like enviada para uid: ${donoDoPostUid}`);
    }
  } catch (err) {
    console.warn('⚠️ Erro ao enviar notificação de like:', err);
  }
}