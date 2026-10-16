// ============================================================
// functions/index.js — RealMe Cloud Functions v2
// (inclui createAccount, antes em indexCREATEACC.js)
// ============================================================

const { onDocumentCreated, onDocumentWritten, onDocumentDeleted } = require("firebase-functions/v2/firestore");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { initializeApp }     = require("firebase-admin/app");
const { getAuth }           = require("firebase-admin/auth");
const { getFirestore, FieldValue, Timestamp, FieldPath } = require("firebase-admin/firestore");
const { getMessaging }      = require("firebase-admin/messaging");
const crypto                = require("crypto");

initializeApp();
const db       = getFirestore();
const auth     = getAuth();
const fcm      = getMessaging();

const TRIGGER_CONFIG = {
  region:   "us-central1",
  database: "(default)",
};

const ACCOUNT_REGION = "southamerica-east1";
const IS_EMULATOR    = process.env.FUNCTIONS_EMULATOR === "true";

const BASE_URL  = "https://socialrealme.com";
const ICON_URL  = `${BASE_URL}/src/icon/icon.png`;
const BADGE_URL = `${BASE_URL}/src/icon/icon.png`;

// ─── Tipos de atividade ──────────────────────────────────────
const ACTIVITY_TYPES = {
  NEW_POST:            "new_post",
  NEW_BUBBLE:          "new_bubble",
  NEW_COMMENT:         "new_comment",
  NEW_FRIENDSHIP:      "new_friendship",
  PROFILE_UPDATE:      "profile_update",
  STATUS_CHANGE:       "status_change",
  NEW_USER:            "new_user",
  ADD_PROFILE_MUSIC:   "add_profile_music",
  UPDATE_PROFILE_MUSIC:"update_profile_music",
  NEW_LOCATION:        "new_location",
  UPDATE_BIO:          "update_bio",
  NEW_EVENT:           "new_event",
};

// ─── Helpers gerais ──────────────────────────────────────────

// Monta "Nome Sobrenome" a partir do documento do usuário.
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

function cleanPayload(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function isAlreadyExists(err) {
  return err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message || "");
}

function sampleArray(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function truncate(str, max = 80) {
  if (!str) return "";
  return str.length > max ? str.substring(0, max).trimEnd() + "..." : str;
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

// `id` (opcional) torna a escrita idempotente: se o trigger for reexecutado,
// o documento não é duplicado (substitui o antigo _processedEvents).
async function createNotification({ id = null, toUid, fromUid, type, message = null, postId = null }) {
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

  if (!id) {
    await db.collection("notifications").add(payload);
    return;
  }
  try {
    await db.doc(`notifications/${id}`).create(payload);
  } catch (err) {
    if (!isAlreadyExists(err)) throw err;
  }
}

// ============================================================
// ATIVIDADES — agora criadas pelo servidor
// ============================================================

async function getAuthorData(uid) {
  const author = { authorUsername: "", authorName: "", authorPhoto: "" };
  try {
    const snap = await db.doc(`users/${uid}`).get();
    if (snap.exists) {
      const d = snap.data();
      author.authorUsername = d.username || "";
      author.authorName     = buildFullName(d, "");
      author.authorPhoto    = d.userphoto || "";
    }
    if (!author.authorPhoto) {
      const media = await db.doc(`users/${uid}/user-infos/user-media`).get();
      if (media.exists) author.authorPhoto = media.data().userphoto || "";
    }
  } catch (err) {
    console.warn("[getAuthorData]", err.message);
  }
  return author;
}

async function getPhotoOf(uid) {
  try {
    const media = await db.doc(`users/${uid}/user-infos/user-media`).get();
    if (media.exists && media.data().userphoto) return media.data().userphoto;
    const u = await db.doc(`users/${uid}`).get();
    if (u.exists) return u.data().userphoto || "";
  } catch (_) {}
  return "";
}

async function getUsernameOf(uid) {
  try {
    const u = await db.doc(`users/${uid}`).get();
    if (u.exists) return u.data().username || "";
  } catch (_) {}
  return "";
}

// id determinístico (baseado no event.id) → idempotente em retries.
async function createActivity({ id, type, actorUid, payload = {} }) {
  if (!actorUid || !id) return null;
  try {
    const author = await getAuthorData(actorUid);
    await db.doc(`activities/${id}`).create({
      activityId: id,
      type,
      actorUid,
      createdAt:  FieldValue.serverTimestamp(),
      visible:    true,
      ...author,
      ...cleanPayload(payload),
    });
    return id;
  } catch (err) {
    if (isAlreadyExists(err)) return null;
    console.error(`[createActivity] ${type}:`, err);
    return null;
  }
}

// ============================================================
// 1. FRIEND REQUESTS — pedido, aceite e remoção de amizade
//   • criado            → push + notificação "quer ser seu amigo"
//   • virou "accepted"  → cria amizade nos 2 lados, notifica e
//                         cria atividade new_friendship
//   • deletado          → remove os 2 lados
// ============================================================
exports.onFriendRequestWritten = onDocumentWritten(
  { ...TRIGGER_CONFIG, document: "friendRequests/{reqId}" },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;

    // ── Deletado → desfazer amizade ──
    if (!after) {
      const uid1 = before?.from;
      const uid2 = before?.to;
      if (!uid1 || !uid2) return;

      await Promise.allSettled([
        db.doc(`users/${uid1}/friends/${uid2}`).delete(),
        db.doc(`users/${uid2}/friends/${uid1}`).delete(),
        db.doc(`friendRequests/${uid2}_${uid1}`).delete(),
      ]);
      return;
    }

    // ── Criado → pedido de amizade ──
    if (!before) {
      const from = after.from;
      const to   = after.to;
      if (!from || !to || from === to) return;
      if (after.status === "accepted") return;

      const { username, photo } = await getUserData(from);

      await Promise.all([
        notifyUser(
          to,
          username,
          "quer ser seu amigo.",
          { url: `${BASE_URL}/notifications.html`, type: "friend_request", uid: from },
          photo
        ),
        createNotification({
          id: `${event.id}_req`,
          toUid: to, fromUid: from, type: "friend_request",
        }),
      ]);
      return;
    }

    // ── Virou "accepted" → criar amizade ──
    const wasAccepted = before?.status === "accepted";
    const isAccepted  = after?.status  === "accepted";
    if (!isAccepted || wasAccepted) return;

    const uid1 = after.from; // quem enviou
    const uid2 = after.to;   // quem aceitou
    if (!uid1 || !uid2) return;

    const now = FieldValue.serverTimestamp();
    await Promise.all([
      db.doc(`users/${uid1}/friends/${uid2}`).set({ uid: uid2, since: now }),
      db.doc(`users/${uid2}/friends/${uid1}`).set({ uid: uid1, since: now }),
    ]);

    const { username: acceptorName, photo: acceptorPhoto } = await getUserData(uid2);
    const [targetPhoto, targetUsername] = await Promise.all([
      getPhotoOf(uid1),
      getUsernameOf(uid1),
    ]);

    await Promise.all([
      notifyUser(
        uid1,
        acceptorName,
        "aceitou seu pedido de amizade.",
        { url: `${BASE_URL}/profile.html?u=${uid2}`, type: "friend_accepted", uid: uid2 },
        acceptorPhoto
      ),
      createNotification({
        id: `${event.id}_acc`,
        toUid: uid1, fromUid: uid2, type: "friend_accepted",
      }),
      // ator = quem aceitou; alvo = quem enviou o pedido
      createActivity({
        id:       `act_${ACTIVITY_TYPES.NEW_FRIENDSHIP}_${event.id}`,
        type:     ACTIVITY_TYPES.NEW_FRIENDSHIP,
        actorUid: uid2,
        payload:  { targetUid: uid1, targetUsername, targetPhoto },
      }),
    ]);
  }
);

// ============================================================
// 2. POSTS — menções (notificação "post_mention") + atividade
//    new_post (com `location` quando o post tiver localização)
// ============================================================
exports.onNewPost = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "posts/{postId}" },
  async (event) => {
    const post      = event.data.data();
    const postId    = event.params.postId;
    const creatorId = post.creatorid;
    if (!creatorId) return;

    const tasks = [];

    // ── Atividade ──
    tasks.push(createActivity({
      id:       `act_${ACTIVITY_TYPES.NEW_POST}_${event.id}`,
      type:     ACTIVITY_TYPES.NEW_POST,
      actorUid: creatorId,
      payload: {
        postId,
        location: typeof post.location === "string" && post.location ? post.location : undefined,
      },
    }));

    // ── Menções ──
    const rawMentions = Array.isArray(post.mentions) ? post.mentions : [];
    const mentioned = [...new Set(
      rawMentions
        .map(m => (typeof m === "string" ? m : m?.uid))
        .filter(uid => typeof uid === "string" && uid && uid !== creatorId)
    )];

    if (mentioned.length) {
      const creator = await getUserData(creatorId);
      for (const toUid of mentioned) {
        tasks.push(
          createNotification({
            id:      `${event.id}_m_${toUid}`,
            toUid,
            fromUid: creatorId,
            type:    "post_mention",
            postId,
          }),
          notifyUser(
            toUid,
            creator.username,
            "mencionou você em uma publicação.",
            {
              url:  `${BASE_URL}/feed.html?id=${postId}`,
              type: "post_mention",
              postId,
              senderId: creatorId,
            },
            creator.photo
          )
        );
      }
    }

    await Promise.allSettled(tasks);
  }
);

// ============================================================
// 3. NOVO COMENTÁRIO — push + notificação + atividade
// ============================================================
exports.onNewComment = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "posts/{postId}/coments/{comentId}" },
  async (event) => {
    const comment  = event.data.data();
    const postId   = event.params.postId;
    const senderId = comment.senderid;
    if (!senderId) return;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const ownerId = postSnap.data().creatorid;

    const tasks = [
      createActivity({
        id:       `act_${ACTIVITY_TYPES.NEW_COMMENT}_${event.id}`,
        type:     ACTIVITY_TYPES.NEW_COMMENT,
        actorUid: senderId,
        payload: {
          postId,
          targetUid:      ownerId || undefined,
          targetUsername: ownerId ? await getUsernameOf(ownerId) : undefined,
        },
      }),
    ];

    if (ownerId && ownerId !== senderId) {
      const sender = await getUserData(senderId);
      const commentText = truncate(comment.content || comment.text, 80);
      const pushBody = commentText
        ? `${sender.username}: ${commentText}`
        : `${sender.username} comentou na sua publicacao.`;

      tasks.push(
        notifyUser(
          ownerId,
          "Novo comentario",
          pushBody,
          {
            url: `${BASE_URL}/feed.html?id=${postId}`,
            type: "new_comment",
            postId,
            senderId,
          },
          sender.photo
        ),
        createNotification({
          id:      `${event.id}_c`,
          toUid:   ownerId,
          fromUid: senderId,
          type:    "comment",
          message: commentText || null,
          postId,
        })
      );
    }

    await Promise.allSettled(tasks);
  }
);

// ============================================================
// 4. CURTIDAS
// ============================================================
exports.onNewLike = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "posts/{postId}/likers/{likerId}" },
  async (event) => {
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
        id:      `${event.id}_l`,
        toUid:   ownerId,
        fromUid: likerId,
        type:    "like",
        postId,
      }),
    ]);
  }
);

// ============================================================
// 5. MENSAGEM DIRETA
// ============================================================
exports.onNewDirectMessage = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "chats/{chatId}/messages/{msgId}" },
  async (event) => {
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
      { url: `${BASE_URL}/direct.html?chatid=${chatId}`, type: "new_direct_message", senderId, chatId },
      sender.photo
    );
  }
);

// ============================================================
// 6. BUBBLES e EVENTOS — atividades new_bubble / new_event
//    ⚠ Caminhos e campo do criador são SUPOSIÇÕES (ver config).
// ============================================================
const CREATOR_KEYS = ["creatorid", "creatorId", "ownerid", "ownerId", "uid"];
const pickCreator  = (d) => CREATOR_KEYS.map(k => d?.[k]).find(v => typeof v === "string" && v);

exports.onNewBubble = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "bubbles/{bubbleId}" },
  async (event) => {
    const actorUid = pickCreator(event.data.data());
    await createActivity({
      id:       `act_${ACTIVITY_TYPES.NEW_BUBBLE}_${event.id}`,
      type:     ACTIVITY_TYPES.NEW_BUBBLE,
      actorUid,
      payload:  { bubbleId: event.params.bubbleId },
    });
  }
);

exports.onNewEvent = onDocumentCreated(
  { ...TRIGGER_CONFIG, document: "events/{eventId}" },
  async (event) => {
    const data     = event.data.data();
    const actorUid = pickCreator(data);
    const eventTitle = [data.title, data.titulo, data.name, data.nome, data.eventTitle]
      .find(v => typeof v === "string" && v.trim());
    await createActivity({
      id:       `act_${ACTIVITY_TYPES.NEW_EVENT}_${event.id}`,
      type:     ACTIVITY_TYPES.NEW_EVENT,
      actorUid,
      payload:  { eventId: event.params.eventId, eventTitle: eventTitle ? eventTitle.trim() : "" },
    });
  }
);

// Apagar um evento não apaga as subcoleções sozinho: limpa as presenças
// (going) e a atividade new_event que apontava para ele.
exports.onEventDeleted = onDocumentDeleted(
  { ...TRIGGER_CONFIG, document: "events/{eventId}" },
  async (event) => {
    const eventId = event.params.eventId;

    await db.recursiveDelete(db.collection(`events/${eventId}/going`));

    const activities = await db.collection("activities").where("eventId", "==", eventId).get();
    await Promise.all(activities.docs.map(d => d.ref.delete()));
  }
);

// ============================================================
// 7. PERFIL — música, localização, bio, status, foto, novo usuário
//
// PROFILE_WATCH define ONDE cada informação mora (sempre em
// users/{uid}/user-infos/<docId>). `scope`:
//   "user-infos/user-media" → só esse documento
//   "user-infos/*"          → qualquer documento da coleção user-infos
// ============================================================
const PROFILE_WATCH = [
  { scope: "user-infos/more-infos", field: "bio",           kind: "bio" },
  { scope: "user-infos/user-media", field: "musicTheme",    kind: "music" },
  { scope: "user-infos/user-media", field: "userphoto",     kind: "other", label: "foto" },
  { scope: "user-infos/user-media", field: "headerphoto",   kind: "other", label: "capa" },
  { scope: "user-infos/*",          field: "location",      kind: "location" },
  { scope: "user-infos/*",          field: "maritalStatus", kind: "status" },
  { scope: "user-infos/*",          field: "pronom1",       kind: "other", label: "pronomes" },
  { scope: "user-infos/*",          field: "pronom2",       kind: "other", label: "pronomes" },
];

const scopeMatches = (watchScope, scope) =>
  watchScope === scope ||
  (watchScope.endsWith("/*") && scope.startsWith(watchScope.slice(0, -1)));

const isEmpty = (v) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function processProfileChange(eventId, uid, scope, before, after) {
  const tasks = [];
  const otherLabels = new Set();

  for (const w of PROFILE_WATCH.filter(w => scopeMatches(w.scope, scope))) {
    const b = before?.[w.field];
    const a = after?.[w.field];
    if (sameValue(a, b) || isEmpty(a)) continue; // sem mudança, ou campo removido

    const base = { actorUid: uid };
    switch (w.kind) {
      case "music": {
        const type = isEmpty(b) ? ACTIVITY_TYPES.ADD_PROFILE_MUSIC : ACTIVITY_TYPES.UPDATE_PROFILE_MUSIC;
        tasks.push(createActivity({ ...base, id: `act_${type}_${eventId}`, type, payload: { music: a } }));
        break;
      }
      case "location":
        tasks.push(createActivity({
          ...base,
          id: `act_${ACTIVITY_TYPES.NEW_LOCATION}_${eventId}`,
          type: ACTIVITY_TYPES.NEW_LOCATION,
          payload: { location: a },
        }));
        break;
      case "bio":
        tasks.push(createActivity({
          ...base,
          id: `act_${ACTIVITY_TYPES.UPDATE_BIO}_${eventId}`,
          type: ACTIVITY_TYPES.UPDATE_BIO,
          payload: { bio: typeof a === "string" ? truncate(a, 140) : a },
        }));
        break;
      case "status":
        tasks.push(createActivity({
          ...base,
          id: `act_${ACTIVITY_TYPES.STATUS_CHANGE}_${eventId}`,
          type: ACTIVITY_TYPES.STATUS_CHANGE,
          payload: { novoStatus: a },
        }));
        break;
      default:
        otherLabels.add(w.label || w.field);
    }
  }

  // Demais campos → UMA atividade profile_update
  if (otherLabels.size) {
    const campos = [...otherLabels];
    tasks.push(createActivity({
      id:       `act_${ACTIVITY_TYPES.PROFILE_UPDATE}_${eventId}`,
      type:     ACTIVITY_TYPES.PROFILE_UPDATE,
      actorUid: uid,
      payload:  { campos, campo: campos[0] },
    }));
  }

  await Promise.allSettled(tasks);
}

exports.onUserWritten = onDocumentWritten(
  { ...TRIGGER_CONFIG, document: "users/{uid}" },
  async (event) => {
    const uid    = event.params.uid;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;
    if (!after) return;

    // Usuário novo (id fixo → nunca duplica)
    if (!before) {
      await createActivity({
        id:       `act_${ACTIVITY_TYPES.NEW_USER}_${uid}`,
        type:     ACTIVITY_TYPES.NEW_USER,
        actorUid: uid,
        payload:  { uid },
      });
      return;
    }
  }
);

exports.onUserInfoWritten = onDocumentWritten(
  { ...TRIGGER_CONFIG, document: "users/{uid}/user-infos/{infoId}" },
  async (event) => {
    const after = event.data.after.exists ? event.data.after.data() : null;
    if (!after) return;
    const before = event.data.before.exists ? event.data.before.data() : null;

    await processProfileChange(
      event.id,
      event.params.uid,
      `user-infos/${event.params.infoId}`,
      before,
      after
    );
  }
);

// ============================================================
// 8. SUGESTÃO DE AMIZADE — toda sexta 11h (Brasília)
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
        { url: `${BASE_URL}/profile.html?u=${sugeridoUid}`, type: "friend_suggestion", uid: sugeridoUid },
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

// ============================================================
// 9. BUSCA DE PESSOAS
//   • searchIndex/{uid}: índice mantido por triggers (só o servidor lê/escreve)
//   • searchPeople (callable): modos "search" | "profiles" | "random"
//       search + similar:true   → "igual a mim": campos, idade e local aproximados
//       search + filters:{...}  → busca específica: só o que foi digitado, sem idade
//   • o índice se completa sozinho (ensureSearchIndex) e backfillSearchIndex
//     (admin) existe para forçar
// ============================================================

// Onde cada informação mora: o primeiro campo não vazio, em qualquer documento
// de users/{uid}/user-infos (about, likes, user-media...) ou em users/{uid}.
const SEARCH_FIELDS = {
  styles:      { keys: ["styles"],                                              weight: 1   },
  personality: { keys: ["personality"],                                         weight: 1   },
  characters:  { keys: ["characters"],                                          weight: 1   },
  music:       { keys: ["music"],                                               weight: 1   },
  hobbies:     { keys: ["hobbies"],                                             weight: 1   },
  location:    { keys: ["location", "localizacao"],                             weight: 1.5 },
  lookingFor:  { keys: ["searching"],                                           weight: 1.2 }, // "Buscando por" (user-infos/about)
};

const SEARCH_SCHEMA         = 3;    // sobe quando o formato do índice muda (3: campo searching)
const SEARCH_PAGE           = 24;   // pessoas por pedido
const SEARCH_QUEUE_MAX      = 300;  // fila ranqueada devolvida ao cliente
const SEARCH_POOL_PER_QUERY = 120;  // candidatos por prefixo de palavra
const SEARCH_MAX_PREFIXES   = 16;
const SEARCH_MAX_TOKENS     = 15;   // palavras por campo buscado
const SEARCH_HEAL_BATCH     = 60;   // usuários indexados por busca, se faltar índice
const AGE_WEIGHT            = 0.8;
const AGE_TOLERANCE_YEARS   = 8;    // diferença de idade que zera a nota de idade

const SEARCH_STOPWORDS = new Set([
  "para", "com", "que", "uma", "uns", "umas", "das", "dos", "nas", "nos", "por",
  "meu", "minha", "meus", "minhas", "gosto", "amo", "sou", "muito", "mais", "tudo",
  "the", "and", "for", "with", "you", "all",
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// stemming simples: tira "s" final e corta em 6 letras (gato/gatos)
function stemToken(token) {
  let t = token;
  if (t.length > 3 && t.endsWith("s")) t = t.slice(0, -1);
  return t.length > 6 ? t.slice(0, 6) : t;
}

function tokenize(value) {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  const out = new Set();
  for (const raw of normalizeText(text).split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || SEARCH_STOPWORDS.has(raw)) continue;
    out.add(stemToken(raw));
  }
  return [...out];
}

function fieldText(value) {
  if (Array.isArray(value)) return value.filter(v => typeof v === "string").join(", ").trim();
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function pickField(flat, userData, keys) {
  for (const key of keys) {
    const text = fieldText(flat[key] ?? userData[key]);
    if (text) return text;
  }
  return "";
}

function ageFromMillis(ms) {
  if (!Number.isFinite(ms)) return null;
  const birth = new Date(ms);
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const m = today.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < birth.getUTCDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// ── Leitura do perfil (vale para o índice e para o "igual a mim") ──
async function readProfile(uid) {
  const [userSnap, infosSnap] = await Promise.all([
    db.doc(`users/${uid}`).get(),
    db.collection(`users/${uid}/user-infos`).get(),
  ]);
  if (!userSnap.exists) return null;

  const userData = userSnap.data();
  const flat = {};
  infosSnap.docs.forEach(d => {
    for (const [k, v] of Object.entries(d.data())) {
      if (!isEmpty(v) && isEmpty(flat[k])) flat[k] = v;
    }
  });

  const texts = {};
  for (const [field, cfg] of Object.entries(SEARCH_FIELDS)) {
    texts[field] = pickField(flat, userData, cfg.keys);
  }
  texts.overview = pickField(flat, userData, ["overview"]);

  return { userData, flat, texts };
}

const safeUrl = (v) => (typeof v === "string" && v && v.length < 2000 ? v : "");

async function buildSearchIndexDoc(uid) {
  const profile = await readProfile(uid);
  if (!profile) return null;

  const { userData, flat, texts } = profile;
  const fields = {};
  const all = new Set();

  for (const field of Object.keys(SEARCH_FIELDS)) {
    const tokens = tokenize(texts[field]);
    if (tokens.length) {
      fields[field] = tokens.slice(0, 40);
      tokens.forEach(t => all.add(t));
    }
  }
  // "overview" não é um filtro, mas ajuda a achar palavras em outro campo
  tokenize(texts.overview).slice(0, 60).forEach(t => all.add(t));

  const tokens   = [...all].slice(0, 150);
  const birthMs  = userData.nascimento?.toMillis?.() ?? null;

  return {
    schema:    SEARCH_SCHEMA,
    uid,
    username:  userData.username || "",
    name:      buildFullName(userData, userData.username || ""),
    photo:     safeUrl(flat.userphoto)   || safeUrl(userData.userphoto),
    banner:    safeUrl(flat.headerphoto) || safeUrl(userData.headerphoto),
    location:  texts.location.slice(0, 80),
    fields,
    tokens,
    prefixes:  [...new Set(tokens.map(t => t.slice(0, 4)))], // acha palavras parecidas
    birthMs,
    birthYear: birthMs != null ? new Date(birthMs).getUTCFullYear() : null,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function rebuildSearchIndex(uid) {
  const ref = db.doc(`searchIndex/${uid}`);
  const doc = await buildSearchIndexDoc(uid);
  if (!doc) {
    await ref.delete().catch(() => {});
    return;
  }
  await ref.set(doc);
}

const SEARCH_USER_KEYS = [
  "username", "name", "surname", "displayName", "displayname",
  "nascimento", "userphoto", "headerphoto", "location", "localizacao",
];

exports.onSearchIndexUserWritten = onDocumentWritten(
  { ...TRIGGER_CONFIG, document: "users/{uid}" },
  async (event) => {
    const uid    = event.params.uid;
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;

    if (!after) {
      await db.doc(`searchIndex/${uid}`).delete().catch(() => {});
      return;
    }
    // ignora escritas irrelevantes (ex.: fcmToken a cada login)
    if (before && SEARCH_USER_KEYS.every(k => sameValue(before[k], after[k]))) return;

    await rebuildSearchIndex(uid);
  }
);

exports.onSearchIndexInfoWritten = onDocumentWritten(
  { ...TRIGGER_CONFIG, document: "users/{uid}/user-infos/{infoId}" },
  async (event) => {
    const before = event.data.before.exists ? event.data.before.data() : null;
    const after  = event.data.after.exists  ? event.data.after.data()  : null;
    if (sameValue(before, after)) return;

    await rebuildSearchIndex(event.params.uid);
  }
);

async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// Completa o índice sozinho: se há usuários sem índice (ou em formato antigo),
// indexa um lote a cada busca até fechar a conta. Sem isso, só apareceriam
// usuários cujo perfil mudou depois do deploy.
async function ensureSearchIndex() {
  const [users, indexed] = await Promise.all([
    db.collection("users").count().get(),
    db.collection("searchIndex").where("schema", "==", SEARCH_SCHEMA).count().get(),
  ]);

  if (users.data().count - indexed.data().count <= 0) return;

  const metaRef = db.doc("searchMeta/backfill");
  const meta    = await metaRef.get();
  const cursor  = meta.exists ? meta.data().cursor || "" : "";

  let q = db.collection("users").orderBy(FieldPath.documentId()).select().limit(SEARCH_HEAL_BATCH);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  const ids  = snap.docs.map(d => d.id);

  if (ids.length) {
    const current = await db.getAll(...ids.map(id => db.doc(`searchIndex/${id}`)));
    const stale   = ids.filter((id, i) => !current[i].exists || current[i].data().schema !== SEARCH_SCHEMA);
    await inChunks(stale, 20, id => rebuildSearchIndex(id).catch(err => console.error("[heal]", id, err)));
  }

  await metaRef.set({
    cursor:    ids.length === SEARCH_HEAL_BATCH ? ids[ids.length - 1] : "",
    updatedAt: FieldValue.serverTimestamp(),
  });
}

// ── Helpers da busca ─────────────────────────────────────────

// amigos + pedidos pendentes (nos dois sentidos) + o próprio usuário
async function getExcludedUids(uid) {
  const [friendsSnap, sentSnap, receivedSnap] = await Promise.all([
    db.collection(`users/${uid}/friends`).select().get(),
    db.collection("friendRequests").where("from", "==", uid).get(),
    db.collection("friendRequests").where("to", "==", uid).get(),
  ]);

  const excluded = new Set([uid]);
  friendsSnap.docs.forEach(d => excluded.add(d.id));
  sentSnap.docs.forEach(d => { if (d.data().to) excluded.add(d.data().to); });
  receivedSnap.docs.forEach(d => { if (d.data().from) excluded.add(d.data().from); });
  return excluded;
}

// texto livre → { campo: [palavras] } (só campos preenchidos)
function sanitizeFilters(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const field of Object.keys(SEARCH_FIELDS)) {
    const tokens = tokenize(fieldText(raw[field]).slice(0, 300)).slice(0, SEARCH_MAX_TOKENS);
    if (tokens.length) out[field] = tokens;
  }
  return out;
}

function sanitizeAge(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 13 && n <= 100 ? n : null;
}

// apenas uma troca, inserção ou remoção de letra
function withinOneEdit(a, b) {
  if (a === b) return true;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  let i = 0;
  let j = 0;
  let edits = 0;

  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la > lb) i++;
    else if (lb > la) j++;
    else { i++; j++; }
  }
  return edits + (la - i) + (lb - j) <= 1;
}

// 1 = igual · 0.85 = erro de digitação · 0.75 = mesmo começo (jogar/jogando) · 0
function tokenSimilarity(a, b) {
  if (a === b) return 1;
  const min = Math.min(a.length, b.length);
  if (min < 4) return 0;

  if (min >= 5 && Math.abs(a.length - b.length) <= 1 && withinOneEdit(a, b)) return 0.85;

  let common = 0;
  while (common < min && a[common] === b[common]) common++;
  if (common >= 4 && common >= min * 0.6) return 0.75;

  return 0;
}

// Nota 0–100. Cada palavra buscada vale pela melhor palavra parecida no mesmo
// campo do perfil (achar em outro campo vale 40%). Campo vazio no perfil do
// candidato dá 0 naquele campo, mas não tira os pontos dos outros.
function scoreCandidate(index, filters, age) {
  const own    = index.fields || {};
  const allSet = new Set(index.tokens || []);
  let sum = 0;
  let total = 0;

  for (const [field, tokens] of Object.entries(filters)) {
    const ownTokens = own[field] || [];
    const ownSet    = new Set(ownTokens);
    let fieldSum = 0;

    for (const t of tokens) {
      let best = ownSet.has(t) ? 1 : 0;

      if (best < 1) {
        for (const o of ownTokens) {
          const s = tokenSimilarity(t, o);
          if (s > best) best = s;
          if (best >= 0.85) break;
        }
      }
      if (allSet.has(t)) best = Math.max(best, 0.4);

      fieldSum += best;
    }

    const weight = SEARCH_FIELDS[field].weight;
    total += weight;
    sum   += weight * (fieldSum / tokens.length);
  }

  if (age != null) {
    total += AGE_WEIGHT;
    const userAge = ageFromMillis(index.birthMs);
    if (userAge != null) {
      sum += AGE_WEIGHT * Math.max(0, 1 - Math.abs(userAge - age) / AGE_TOLERANCE_YEARS);
    }
  }

  return total ? (sum / total) * 100 : 0;
}

function toCard(index, score = null) {
  return {
    uid:      index.uid,
    username: index.username || "",
    name:     index.name || index.username || "Usuário",
    photo:    index.photo || "",
    banner:   index.banner || "",
    location: index.location || "",
    age:      ageFromMillis(index.birthMs),
    score:    score == null ? null : Math.round(score),
  };
}

// candidatos: quem tem palavra com o mesmo começo (4 letras) + idade próxima
async function fetchSearchPool(filters, age) {
  const seen = new Set();
  const prefixes = [];

  Object.entries(filters)
    .sort((a, b) => SEARCH_FIELDS[b[0]].weight - SEARCH_FIELDS[a[0]].weight)
    .forEach(([, tokens]) => tokens.forEach(t => {
      const p = t.slice(0, 4);
      if (!seen.has(p)) { seen.add(p); prefixes.push(p); }
    }));

  const queries = prefixes.slice(0, SEARCH_MAX_PREFIXES).map(p =>
    db.collection("searchIndex")
      .where("prefixes", "array-contains", p)
      .limit(SEARCH_POOL_PER_QUERY)
      .get()
  );

  if (age != null) {
    const year = new Date().getUTCFullYear() - age;
    queries.push(
      db.collection("searchIndex")
        .where("birthYear", ">=", year - 3)
        .where("birthYear", "<=", year + 3)
        .limit(150)
        .get()
    );
  }

  const snaps = await Promise.all(queries);
  const pool  = new Map();
  snaps.forEach(snap => snap.docs.forEach(d => pool.set(d.id, d.data())));
  return pool;
}

function randomDocId() {
  return crypto.randomBytes(15).toString("base64url").slice(0, 20);
}

// Amostra pseudo-aleatória: lê a partir de um id aleatório (e dá a volta)
async function randomPeople(count, excluded) {
  const out    = [];
  const picked = new Set();

  for (const start of [randomDocId(), ""]) {
    if (out.length >= count) break;

    let q = db.collection("searchIndex").orderBy(FieldPath.documentId());
    if (start) q = q.startAt(start);
    const snap = await q.limit(count * 3).get();

    for (const d of snap.docs) {
      if (out.length >= count) break;
      if (excluded.has(d.id) || picked.has(d.id)) continue;
      picked.add(d.id);
      out.push(d.data());
    }
  }
  return out;
}

function sanitizeUidList(value, max) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(u => typeof u === "string" && u && u.length <= 128))].slice(0, max);
}

const CALLABLE_CORS = IS_EMULATOR
  ? true
  : ["https://socialrealme.com", /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

exports.searchPeople = onCall(
  {
    region: "us-central1",
    cors: CALLABLE_CORS,
    maxInstances: 20,
    timeoutSeconds: 60,
    memory: "512MiB",
  },
  async (request) => {
   try {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "LOGIN_REQUIRED");

    if (!await checkRateLimit(`search:${uid}`, 120, 10 * 60 * 1000)) {
      throw new HttpsError("resource-exhausted", "RATE_LIMITED");
    }

    const data = request.data || {};
    const mode = ["search", "profiles", "random"].includes(data.mode) ? data.mode : "search";

    // ── profiles: dados de uids já ranqueados (fila do cliente) ──
    if (mode === "profiles") {
      const uids = sanitizeUidList(data.uids, 30).filter(u => u !== uid);
      if (!uids.length) return { people: [] };

      const snaps = await db.getAll(...uids.map(u => db.doc(`searchIndex/${u}`)));
      const byUid = new Map(snaps.filter(s => s.exists).map(s => [s.id, s.data()]));
      return { people: uids.filter(u => byUid.has(u)).map(u => toCard(byUid.get(u))) };
    }

    const excluded = await getExcludedUids(uid);
    sanitizeUidList(data.exclude, 400).forEach(u => excluded.add(u));

    // ── random: completa o fim da lista (nota 0) ──
    if (mode === "random") {
      const people = await randomPeople(SEARCH_PAGE, excluded);
      return { people: people.map(p => toCard(p, 0)) };
    }

    // ── search ──
    await ensureSearchIndex().catch(err => console.warn("[ensureSearchIndex]", err.message));

    // Sem nada digitado, a busca é "pessoas parecidas com você".
    let similar = data.similar === true;
    let filters = {};
    let age     = null;
    let me      = null;

    if (!similar) {
      filters = sanitizeFilters(data.filters);   // específica: só o digitado, sem idade
      if (!Object.keys(filters).length) similar = true;
    }

    if (similar) {                                // igual a mim: campos + idade + local
      const mine = await readProfile(uid);
      if (mine) {
        filters = sanitizeFilters(mine.texts);
        age     = sanitizeAge(ageFromMillis(mine.userData.nascimento?.toMillis?.()));

        const fields = {};
        for (const field of Object.keys(SEARCH_FIELDS)) {
          if (mine.texts[field]) fields[field] = mine.texts[field];
        }
        me = { fields, age };
      }
    }

    // ninguém tem nada para comparar: ordem aleatória
    if (!Object.keys(filters).length && age == null) {
      const people = await randomPeople(SEARCH_PAGE, excluded);
      return { people: people.map(p => toCard(p, 0)), queue: [], matched: false, me };
    }

    const pool = await fetchSearchPool(filters, age);

    const ranked = [];
    for (const [id, index] of pool) {
      if (excluded.has(id)) continue;
      const score = scoreCandidate(index, filters, age);
      if (score > 0) ranked.push({ index, score });
    }
    ranked.sort((a, b) => b.score - a.score || (a.index.uid < b.index.uid ? -1 : 1));

    const first = ranked.slice(0, SEARCH_PAGE);
    const queue = ranked
      .slice(SEARCH_PAGE, SEARCH_PAGE + SEARCH_QUEUE_MAX)
      .map(r => ({ uid: r.index.uid, score: Math.round(r.score) }));

    const people = first.map(r => toCard(r.index, r.score));

    // poucos parecidos: completa com pessoas variadas (nota 0, no fim)
    if (people.length < SEARCH_PAGE) {
      first.forEach(r => excluded.add(r.index.uid));
      const extra = await randomPeople(SEARCH_PAGE - people.length, excluded);
      extra.forEach(p => people.push(toCard(p, 0)));
    }

    return { people, queue, matched: true, me };
   } catch (err) {
    if (err instanceof HttpsError) throw err;

    // aparece em: firebase functions:log --only searchPeople
    console.error("[searchPeople]", err);
    throw new HttpsError("internal", "SEARCH_FAILED");
   }
  }
);

// Força a indexação de todos (só quem tem admin/{uid}). Em lotes:
//   backfillSearchIndex({ cursor: null }) → { processed, nextCursor }
// repita com o nextCursor até ele vir null. Normalmente não é preciso:
// a busca já completa o índice sozinha.
exports.backfillSearchIndex = onCall(
  {
    region: "us-central1",
    cors: CALLABLE_CORS,
    timeoutSeconds: 540,
    memory: "512MiB",
    maxInstances: 1,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "LOGIN_REQUIRED");

    const adminSnap = await db.doc(`admin/${uid}`).get();
    if (!adminSnap.exists) throw new HttpsError("permission-denied", "ADMIN_ONLY");

    const data  = request.data || {};
    const batch = Math.min(Math.max(Number(data.limit) || 300, 1), 500);

    let q = db.collection("users").orderBy(FieldPath.documentId()).limit(batch);
    if (typeof data.cursor === "string" && data.cursor) q = q.startAfter(data.cursor);

    const snap = await q.get();
    const ids  = snap.docs.map(d => d.id);

    await inChunks(ids, 10, id =>
      rebuildSearchIndex(id).catch(err => console.error("[backfill]", id, err))
    );

    return {
      processed:  ids.length,
      nextCursor: ids.length === batch ? ids[ids.length - 1] : null,
    };
  }
);

// ============================================================
// 10. CRIAÇÃO DE CONTA (HTTP) — vinda de indexCREATEACC.js
// ============================================================
const RATE_LIMITS = {
  ip:       { max: 5, window: 15 * 60 * 1000 },
  email:    { max: 3, window: 60 * 60 * 1000 },
  username: { max: 5, window: 60 * 60 * 1000 },
};

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalize         = (v) => String(v ?? "").trim();
const normalizeEmail    = (v) => normalize(v).toLowerCase();
const normalizeUsername = (v) => normalize(v).toLowerCase();

const validName     = (v) => /^[\p{L}\s'-]{2,40}$/u.test(v);
const validUsername = (v) => /^[a-z0-9_]{3,20}$/.test(v);
const validEmail    = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const validPassword = (v) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(v);

// Tudo em UTC: a data de nascimento é guardada às 12:00 UTC, então em
// qualquer fuso do Brasil (UTC-2 a UTC-5) o dia exibido é o mesmo digitado.
function parseBirthDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.toISOString().slice(0, 10) !== value) return null; // ex.: 2020-02-31
  if (date.getTime() > Date.now()) return null;               // data no futuro
  return date;
}

function calculateAge(date) {
  const today = new Date();
  let age = today.getUTCFullYear() - date.getUTCFullYear();
  const monthDifference = today.getUTCMonth() - date.getUTCMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getUTCDate() < date.getUTCDate())) {
    age--;
  }
  return age;
}

async function checkRateLimit(key, max, windowMs) {
  const ref = db.collection("rateLimits").doc(hash(key));
  const now = Date.now();

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      transaction.set(ref, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(now + windowMs),
      });
      return true;
    }

    const data = snapshot.data();

    if (now - data.windowStart >= windowMs) {
      transaction.set(ref, {
        count: 1,
        windowStart: now,
        expiresAt: Timestamp.fromMillis(now + windowMs),
      });
      return true;
    }

    if (data.count >= max) return false;

    transaction.update(ref, { count: FieldValue.increment(1) });
    return true;
  });
}

async function releaseUsername(username, uid) {
  const ref = db.collection("usernames").doc(username);
  try {
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return;
      if (snapshot.data().uid === uid) transaction.delete(ref);
    });
  } catch (error) {
    console.error("Failed to release username:", error);
  }
}

exports.createAccount = onRequest(
  {
    region: ACCOUNT_REGION,
    cors: IS_EMULATOR ? true : ["https://socialrealme.com"],
    maxInstances: 5,
    concurrency: 10,
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (req, res) => {
    res.set("Cache-Control", "no-store");

    const fail = (status, error) => res.status(status).json({ success: false, error });

    if (req.method !== "POST") return fail(405, "METHOD_NOT_ALLOWED");

    const ip = req.ip || req.get("x-forwarded-for") || "unknown";
    if (!await checkRateLimit(`ip:${ip}`, RATE_LIMITS.ip.max, RATE_LIMITS.ip.window)) {
      return fail(429, "RATE_LIMITED");
    }

    const body = req.body || {};

    const nome       = normalize(body.nome);
    const sobrenome  = normalize(body.sobrenome);
    const username   = normalizeUsername(body.username);
    const email      = normalizeEmail(body.email);
    const senha      = String(body.senha ?? "");
    const nascimento = normalize(body.nascimento);
    const genero     = normalize(body.genero);

    if (!nome || !sobrenome || !username || !email || !senha || !nascimento || !genero) {
      return fail(400, "MISSING_FIELDS");
    }
    if (!validName(nome))          return fail(400, "INVALID_NAME");
    if (!validName(sobrenome))     return fail(400, "INVALID_SURNAME");
    if (!validUsername(username))  return fail(400, "INVALID_USERNAME");
    if (!validEmail(email))        return fail(400, "INVALID_EMAIL");
    if (!validPassword(senha))     return fail(400, "WEAK_PASSWORD");

    const birthDate = parseBirthDate(nascimento);
    if (!birthDate) return fail(400, "INVALID_BIRTH_DATE");
    if (calculateAge(birthDate) < 13)      return fail(400, "UNDERAGE");

    if (!await checkRateLimit(`email:${email}`, RATE_LIMITS.email.max, RATE_LIMITS.email.window)) {
      return fail(429, "RATE_LIMITED");
    }
    if (!await checkRateLimit(`username:${username}`, RATE_LIMITS.username.max, RATE_LIMITS.username.window)) {
      return fail(429, "RATE_LIMITED");
    }

    let userRecord;

    try {
      try {
        await auth.getUserByEmail(email);
        return fail(409, "EMAIL_ALREADY_IN_USE");
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }

      userRecord = await auth.createUser({
        email,
        password: senha,
        displayName: `${nome} ${sobrenome}`,
      });

      const usernameRef = db.collection("usernames").doc(username);

      const usernameClaimed = await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(usernameRef);
        if (snapshot.exists) return false;
        transaction.create(usernameRef, {
          uid: userRecord.uid,
          status: "active",
          createdAt: FieldValue.serverTimestamp(),
        });
        return true;
      });

      if (!usernameClaimed) {
        await auth.deleteUser(userRecord.uid);
        return fail(409, "USERNAME_TAKEN");
      }

      await db.collection("users").doc(userRecord.uid).set({
        uid: userRecord.uid,
        username,
        email,
        name: nome,
        surname: sobrenome,
        gender: genero,
        nascimento: Timestamp.fromDate(birthDate),
        criadoem: FieldValue.serverTimestamp(),
      });

      return res.status(201).json({ success: true });

    } catch (error) {
      console.error("Account creation error:", error);

      if (userRecord?.uid) {
        try {
          await auth.deleteUser(userRecord.uid);
        } catch (deleteError) {
          console.error("Rollback Auth error:", deleteError);
        }
        await releaseUsername(username, userRecord.uid);
      }

      if (error.code === "auth/email-already-exists") return fail(409, "EMAIL_ALREADY_IN_USE");
      if (error.code === "auth/invalid-password")     return fail(400, "WEAK_PASSWORD");

      return fail(500, "INTERNAL_ERROR");
    }
  }
);