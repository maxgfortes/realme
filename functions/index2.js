const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onRequest }         = require("firebase-functions/v2/https");
const { onSchedule }        = require("firebase-functions/v2/scheduler");
const { initializeApp }     = require("firebase-admin/app");
const { getAuth }           = require("firebase-admin/auth");
const { getAppCheck }       = require("firebase-admin/app-check");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getMessaging }      = require("firebase-admin/messaging");
const crypto                = require("crypto");

initializeApp();
const db       = getFirestore();
const auth     = getAuth();
const appCheck = getAppCheck();
const fcm      = getMessaging();

const TRIGGER_CONFIG = {
  region:   "us-central1",
  database: "(default)",
};

const ACCOUNT_REGION = "southamerica-east1";
const IS_EMULATOR    = process.env.FUNCTIONS_EMULATOR === "true";

const BASE_URL  = "https://socialrealme.com/";
const ICON_URL  = `${BASE_URL}/src/icon/icon.png`;
const BADGE_URL = `${BASE_URL}/src/icon/icon.png`;

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
    const actorUid = pickCreator(event.data.data());
    await createActivity({
      id:       `act_${ACTIVITY_TYPES.NEW_EVENT}_${event.id}`,
      type:     ACTIVITY_TYPES.NEW_EVENT,
      actorUid,
      payload:  { eventId: event.params.eventId },
    });
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
// 9. CRIAÇÃO DE CONTA (HTTP) — vinda de indexCREATEACC.js
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

function calculateAge(date) {
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDifference = today.getMonth() - date.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < date.getDate())) {
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

    if (!IS_EMULATOR) {
      const appCheckToken = req.get("X-Firebase-AppCheck");
      if (!appCheckToken) return fail(401, "APP_CHECK_REQUIRED");
      try {
        await appCheck.verifyToken(appCheckToken);
      } catch (error) {
        return fail(401, "INVALID_APP_CHECK");
      }
    }

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

    const birthDate = new Date(`${nascimento}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return fail(400, "INVALID_BIRTH_DATE");
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