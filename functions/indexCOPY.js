// ============================================================
// functions/index.js — RealMe Cloud Functions v2
// ============================================================

const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { initializeApp }     = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getMessaging }      = require("firebase-admin/messaging");

initializeApp();
const db  = getFirestore();
const fcm = getMessaging();

const TRIGGER_CONFIG = {
  region:   "us-central1",
  database: "(default)",
};

const BASE_URL  = "https://socialrealme.com";
const ICON_URL  = `${BASE_URL}/src/icon/icon.png`;
const BADGE_URL = `${BASE_URL}/src/icon/icon.png`;

// ─── Deduplicação por eventId ────────────────────────────────
const EVENT_TTL_MS = 5 * 60 * 1000;

async function claimEvent(eventId) {
  const ref = db.doc(`_processedEvents/${eventId}`);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) throw new Error("DUPLICATE");
      tx.set(ref, {
        processedAt: FieldValue.serverTimestamp(),
        expireAt:    new Date(Date.now() + EVENT_TTL_MS),
      });
    });
    return true;
  } catch (err) {
    if (err.message === "DUPLICATE") {
      console.warn(`[claimEvent] Evento duplicado ignorado: ${eventId}`);
      return false;
    }
    console.error("[claimEvent] Erro na transação:", err);
    return true;
  }
}

// ─── Helpers ────────────────────────────────────────────────

// Monta "Nome Sobrenome" a partir do documento do usuário.
// Se não houver name/surname (contas antigas), cai para os campos antigos.
function buildFullName(d, fallback) {
  const full = [d?.name, d?.surname]
    .map(s => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean)
    .join(" ");
  if (full) return full;
  return d?.displayname || d?.displayName || d?.username || fallback;
}

async function getUserData(uid) {
  const snap = await db.doc(`users/${uid}`).get();
  if (!snap.exists) return { fcmToken: null, username: uid, photo: ICON_URL };
  const d = snap.data();
  return {
    fcmToken: d.fcmToken || null,
    username: buildFullName(d, uid),
    photo:    d.photoURL || d.photo || d.userphoto || ICON_URL,
  };
}

function sanitizeData(obj) {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) result[k] = String(v);
  }
  return result;
}

async function sendPush(token, title, body, data = {}, actorPhoto = null) {
  if (!token) return false;
  try {
    const notification = {
      title,
      body,
      icon:    actorPhoto || ICON_URL,
      badge:   BADGE_URL,
      vibrate: [100, 50, 100],
      requireInteraction: false,
      silent:  false,
    };
    if (data.imageUrl) notification.image = data.imageUrl;

    await fcm.send({
      token,
      notification: { title, body },
      webpush: {
        notification,
        fcmOptions: { link: data.url || BASE_URL },
      },
      data: sanitizeData(data),
    });
    return true;
  } catch (err) {
    if (
      err.code === "messaging/registration-token-not-registered" ||
      err.code === "messaging/invalid-registration-token"
    ) {
      await db.collection("users").where("fcmToken", "==", token).get()
        .then(snap => snap.forEach(d => d.ref.update({ fcmToken: null })))
        .catch(() => {});
    }
    console.error("sendPush error:", err.code, err.message);
    return false;
  }
}

async function notifyUser(uid, title, body, data = {}, actorPhoto = null) {
  const { fcmToken } = await getUserData(uid);
  return sendPush(fcmToken, title, body, data, actorPhoto);
}

// postId é opcional: quando presente, o front usa para renderizar o preview do post
async function createNotification({ toUid, fromUid, type, message = null, postId = null }) {
  if (!toUid || !fromUid || toUid === fromUid) return;
  const payload = {
    toUid,
    fromUid,
    type,
    read:      false,
    visible:   true,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (message) payload.message = message;
  if (postId)  payload.postId  = postId;
  await db.collection("notifications").add(payload);
}

function sampleArray(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function truncate(str, max = 80) {
  if (!str) return "";
  return str.length > max ? str.substring(0, max).trimEnd() + "..." : str;
}

// ============================================================
// 1. FRIEND REQUESTS — pedido, aceite e remoção de amizade
//
// Regra: o front NUNCA escreve em users/{id}/friends.
//   • documento CRIADO             → push + notificação "quer ser seu amigo"
//   • status muda para "accepted"  → servidor adiciona os dois lados
//                                    e notifica quem enviou o pedido
//   • documento DELETADO           → servidor remove os dois lados
// ============================================================
exports.onFriendRequestWritten = onDocumentWritten(
  { ...TRIGGER_CONFIG, document: "friendRequests/{reqId}" },
  async (event) => {
    if (!await claimEvent(event.id)) return;

    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;

    // ── Documento deletado → desfazer amizade ────────────────
    if (!after) {
      const uid1 = before?.from;
      const uid2 = before?.to;
      if (!uid1 || !uid2) return;

      console.log(`[friendRequest] Deletado ${uid1}_${uid2} — removendo amizade`);

      // Remove os dois lados — ignora erro se já não existir
      await Promise.allSettled([
        db.doc(`users/${uid1}/friends/${uid2}`).delete(),
        db.doc(`users/${uid2}/friends/${uid1}`).delete(),
        // Remove também o pedido cruzado caso exista (cleanup)
        db.doc(`friendRequests/${uid2}_${uid1}`).delete(),
      ]);
      return;
    }

    // ── Documento criado → "{name surname} quer ser seu amigo" ─
    if (!before) {
      const from = after.from;
      const to   = after.to;
      if (!from || !to || from === to) return;
      if (after.status === "accepted") return; // criado já aceito: não é pedido novo

      const { username, photo } = await getUserData(from);

      await Promise.all([
        notifyUser(
          to,
          username,
          "quer ser seu amigo.",
          {
            url:  `${BASE_URL}/notifications.html`,
            type: "friend_request",
            uid:  from,
          },
          photo
        ),
        createNotification({ toUid: to, fromUid: from, type: "friend_request" }),
      ]);
      return;
    }

    // ── Status virou "accepted" → criar amizade ───────────────
    const wasAccepted = before?.status === "accepted";
    const isAccepted  = after?.status  === "accepted";
    if (!isAccepted || wasAccepted) return; // sem mudança relevante

    const uid1 = after.from;
    const uid2 = after.to;
    if (!uid1 || !uid2) return;

    console.log(`[friendRequest] Aceito ${uid1}_${uid2} — adicionando amizade`);

    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.doc(`users/${uid1}/friends/${uid2}`).set({ uid: uid2, since: now }),
      db.doc(`users/${uid2}/friends/${uid1}`).set({ uid: uid1, since: now }),
    ]);

    // Notifica quem enviou o pedido que foi aceito
    const { username: acceptorName, photo: acceptorPhoto } = await getUserData(uid2);
    await Promise.all([
      notifyUser(
        uid1,
        acceptorName,
        "aceitou seu pedido de amizade.",
        {
          url:  `${BASE_URL}/profile.html?u=${uid2}`,
          type: "friend_accepted",
          uid:  uid2,
        },
        acceptorPhoto
      ),
      createNotification({ toUid: uid1, fromUid: uid2, type: "friend_accepted" }),
    ]);
  }
);

// ============================================================
// 2. NOVO COMENTARIO — push + notificação (com postId)
// ============================================================
exports.onNewComment = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "posts/{postId}/coments/{comentId}" },
  async (event) => {
    if (!await claimEvent(event.id)) return;

    const comment  = event.data.data();
    const postId   = event.params.postId;
    const senderId = comment.senderid;
    if (!senderId) return;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const ownerId = postSnap.data().creatorid;
    if (!ownerId || ownerId === senderId) return;

    const sender = await getUserData(senderId);

    const commentText = truncate(comment.content || comment.text, 80);
    const pushBody = commentText
      ? `${sender.username}: ${commentText}`
      : `${sender.username} comentou na sua publicacao.`;

    await Promise.all([
      notifyUser(
        ownerId,
        "Novo comentario",
        pushBody,
        {
          url:    `${BASE_URL}/feed.html?id=${postId}`,
          type:   "new_comment",
          postId,
          senderId,
        },
        sender.photo
      ),
      createNotification({
        toUid:   ownerId,
        fromUid: senderId,
        type:    "comment",
        message: commentText || null,
        postId,
      }),
    ]);
  }
);

// ============================================================
// 3. CURTIDAS — o documento em posts/{postId}/likers/{likerId}
//    É a curtida. Toda vez que ele é CRIADO (curtir ou recurtir
//    depois de descurtir/apagar) → push + notificação com postId.
// ============================================================
exports.onNewLike = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "posts/{postId}/likers/{likerId}" },
  async (event) => {
    if (!await claimEvent(event.id)) return;

    const postId  = event.params.postId;
    const likerId = event.params.likerId;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const postData = postSnap.data();
    const ownerId  = postData.creatorid;
    if (!ownerId || ownerId === likerId) return;

    const liker = await getUserData(likerId);

    await Promise.all([
      notifyUser(
        ownerId,
        liker.username,
        "curtiu sua publicacao.",
        {
          url:      `${BASE_URL}/feed.html?id=${postId}`,
          type:     "like",
          postId,
          likerId,
          imageUrl: postData.img || "",
        },
        liker.photo
      ),
      createNotification({
        toUid:   ownerId,
        fromUid: likerId,
        type:    "like",
        postId,
      }),
    ]);

    console.log(`[onNewLike] ${likerId} curtiu o post ${postId}`);
  }
);

// ============================================================
// 4. MENSAGEM DIRETA — push para o destinatário
//    Texto vem de message.content. Abre direct.html?chatid=...
// ============================================================
exports.onNewDirectMessage = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "chats/{chatId}/messages/{msgId}" },
  async (event) => {
    if (!await claimEvent(event.id)) return;

    const message  = event.data.data();
    const chatId   = event.params.chatId;
    const senderId = message.sender;
    const content  = message.content;
    if (!senderId) return;

    const chatSnap = await db.doc(`chats/${chatId}`).get();
    if (!chatSnap.exists) return;

    const participants = chatSnap.data().participants || [];
    const recipientId  = participants.find(p => p !== senderId);
    if (!recipientId) return;

    const sender = await getUserData(senderId);

    let body;
    if (!content || content.trim() === "") body = "Enviou uma mensagem.";
    else if (message.type === "image")     body = "Enviou uma foto.";
    else if (message.type === "video")     body = "Enviou um video.";
    else                                   body = truncate(content, 80);

    await notifyUser(
      recipientId,
      sender.username,
      body,
      {
        url:    `${BASE_URL}/direct.html?chatid=${chatId}`,
        type:   "new_direct_message",
        senderId,
        chatId,
      },
      sender.photo
    );
  }
);

// ============================================================
// 5. SUGESTÃO DE AMIZADE — toda sexta 11h (Brasília)
//    Sorteia 1 amigo-de-amigo: alguém que está em
//    users/{amigo}/friends de um amigo seu, e que ainda não é
//    seu amigo. Envia 1 push por usuário.
// ============================================================
const MAX_AMIGOS_CONSULTADOS = 10;

async function enviarSugestaoAmizade() {
  const usersSnap = await db.collection("users").get();
  if (usersSnap.empty) return;

  let enviados = 0;

  for (const userDoc of usersSnap.docs) {
    const uid   = userDoc.id;
    const token = userDoc.data().fcmToken;
    if (!token) continue;

    try {
      const meusAmigosSnap = await db.collection(`users/${uid}/friends`).get();
      if (meusAmigosSnap.empty) continue;

      const meusAmigos = new Set(meusAmigosSnap.docs.map(d => d.id));

      const candidatos = new Map();

      const amigosSorteados = sampleArray([...meusAmigos], MAX_AMIGOS_CONSULTADOS);
      await Promise.all(
        amigosSorteados.map(async (amigoUid) => {
          try {
            const snap = await db.collection(`users/${amigoUid}/friends`).get();
            snap.docs.forEach(d => {
              const cid = d.id;
              if (cid !== uid && !meusAmigos.has(cid) && !candidatos.has(cid)) {
                candidatos.set(cid, amigoUid);
              }
            });
          } catch (_) {}
        })
      );

      if (candidatos.size === 0) continue;

      const [sugeridoUid] = sampleArray([...candidatos.keys()], 1);
      const viaUid        = candidatos.get(sugeridoUid);

      const [sugerido, via] = await Promise.all([
        getUserData(sugeridoUid),
        getUserData(viaUid),
      ]);

      await sendPush(
        token,
        "Sugestao de amizade",
        `${sugerido.username} e amigo de ${via.username}. Que tal adicionar?`,
        {
          url:  `${BASE_URL}/profile.html?u=${sugeridoUid}`,
          type: "friend_suggestion",
          uid:  sugeridoUid,
        },
        sugerido.photo
      );

      enviados++;
    } catch (e) {
      console.warn(`[sugestaoAmizade] uid ${uid}:`, e.message);
    }
  }

  console.log(`[sugestaoAmizade] Enviado para ${enviados} usuarios.`);
}

exports.sugestaoSexta = onSchedule(
  { schedule: "0 11 * * 5", timeZone: "America/Sao_Paulo", region: "us-central1" },
  async () => enviarSugestaoAmizade()
);