// ============================================================
// activity-creator.js — Realme
// Gera atividades no Firestore a cada ação importante do usuário.
// ============================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:606331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Tipos de atividade ───────────────────────────────────────────────────────
export const ACTIVITY_TYPES = {
  NEW_POST:        'new_post',
  NEW_BUBBLE:      'new_bubble',
  NEW_COMMENT:     'new_comment',
  NEW_FRIENDSHIP:  'new_friendship',
  PROFILE_UPDATE:  'profile_update',
  STATUS_CHANGE:   'status_change',
  NEW_USER:        'new_user',
};

// ─── Gera ID único para atividade ────────────────────────────────────────────
function gerarActivityId(tipo) {
  const ts  = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 7);
  return `act_${tipo}_${ts}_${rnd}`;
}

// ─── Busca dados do autor ─────────────────────────────────────────────────────
async function buscarAuthorData(uid) {
  let authorData = {};
  try {
    const userSnap = await getDoc(doc(db, 'users', uid));
    if (userSnap.exists()) {
      const d = userSnap.data();
      authorData = {
        authorUsername: d.username || '',
        authorName:     d.nome || d.name || d.displayName || d.displayname || d.username || '',
        authorPhoto:    d.userphoto || ''
      };
    }
    if (!authorData.authorPhoto) {
      const mediaSnap = await getDoc(doc(db, `users/${uid}/user-infos/user-media`));
      if (mediaSnap.exists()) authorData.authorPhoto = mediaSnap.data().userphoto || '';
    }
  } catch (_) {}
  return authorData;
}

// ─── Função central de criação ────────────────────────────────────────────────
/**
 * Cria um documento em /activities/{activityId}.
 *
 * @param {string} tipo         — um dos ACTIVITY_TYPES
 * @param {object} payload      — dados extras da atividade
 * @param {string} [actorUid]   — UID do autor (padrão: usuário logado)
 */
export async function criarAtividade(tipo, payload = {}, actorUid = null) {
  try {
    const user = actorUid ? { uid: actorUid } : auth.currentUser;
    if (!user) return;

    const authorData = await buscarAuthorData(user.uid);
    const activityId = gerarActivityId(tipo);

    const activity = {
      activityId,
      type:      tipo,
      actorUid:  user.uid,
      createdAt: serverTimestamp(),
      visible:   true,
      ...authorData,
      ...payload
    };

    await setDoc(doc(db, 'activities', activityId), activity);
    return activityId;
  } catch (err) {
    console.warn('[activity-creator] Falha ao criar atividade:', err);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LÓGICA DE LAYOUT — act-big e act-small
// ════════════════════════════════════════════════════════════════════════════

/**
 * Dado um array de atividades (já buscadas do Firestore), retorna
 * cada uma anotada com seu tamanho de card:
 *
 *   • ≤ 2 atividades  → todas 'big'
 *   • ≥ 3 atividades  → a primeira é 'big', as demais são 'small'
 *
 * Atividades de NEW_FRIENDSHIP sempre carregam fotos dos dois usuários.
 *
 * @param  {Array}  atividades  — array de objetos de atividade
 * @returns {Array}             — mesmo array com campo `cardSize: 'big'|'small'`
 */
export function aplicarLayoutAtividades(atividades) {
  if (!Array.isArray(atividades) || atividades.length === 0) return [];

  return atividades.map((ativ, index) => ({
    ...ativ,
    cardSize: (atividades.length <= 2 || index === 0) ? 'big' : 'small'
  }));
}

// ════════════════════════════════════════════════════════════════════════════
// TRIGGERS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Dispare após salvar um novo post.
 */
export async function triggerNovoPost(postId) {
  return criarAtividade(ACTIVITY_TYPES.NEW_POST, { postId });
}

/**
 * Dispare após salvar um novo bubble.
 */
export async function triggerNovoBubble(bubbleId) {
  return criarAtividade(ACTIVITY_TYPES.NEW_BUBBLE, { bubbleId });
}

/**
 * Dispare após enviar um comentário.
 * Busca automaticamente o username do dono do post para enriquecer a atividade.
 *
 * @param {string} postId
 * @param {string} postOwnerUid
 * @param {string} [postOwnerUsername]  — opcional; se omitido, busca do Firestore
 */
export async function triggerNovoComentario(postId, postOwnerUid, postOwnerUsername) {
  // Se o username do dono não foi passado, busca no Firestore
  let targetUsername = postOwnerUsername || '';
  if (!targetUsername && postOwnerUid) {
    try {
      const snap = await getDoc(doc(db, 'users', postOwnerUid));
      if (snap.exists()) targetUsername = snap.data().username || '';
    } catch (_) {}
  }

  return criarAtividade(ACTIVITY_TYPES.NEW_COMMENT, {
    postId,
    targetUid:      postOwnerUid,
    targetUsername
  });
}

/**
 * Dispare quando dois usuários tornarem-se amigos mútuos.
 * Busca e salva as fotos de AMBOS os usuários na atividade.
 *
 * @param {string} friendUid
 * @param {string} [friendUsername]
 */
export async function triggerNovaAmizade(friendUid, friendUsername) {
  const user = auth.currentUser;
  if (!user) return;

  // Foto do amigo
  let friendPhoto = '';
  try {
    const mediaSnap = await getDoc(doc(db, `users/${friendUid}/user-infos/user-media`));
    if (mediaSnap.exists()) friendPhoto = mediaSnap.data().userphoto || '';
    if (!friendPhoto) {
      const userSnap = await getDoc(doc(db, 'users', friendUid));
      if (userSnap.exists()) friendPhoto = userSnap.data().userphoto || '';
    }
  } catch (_) {}

  // Username do amigo, se não foi passado
  let resolvedFriendUsername = friendUsername || '';
  if (!resolvedFriendUsername) {
    try {
      const snap = await getDoc(doc(db, 'users', friendUid));
      if (snap.exists()) resolvedFriendUsername = snap.data().username || '';
    } catch (_) {}
  }

  return criarAtividade(ACTIVITY_TYPES.NEW_FRIENDSHIP, {
    targetUid:      friendUid,
    targetUsername: resolvedFriendUsername,
    targetPhoto:    friendPhoto  // foto do segundo usuário
  });
}

/**
 * Dispare ao salvar edições de perfil.
 * Recebe um array de campos alterados e cria UMA única atividade.
 *
 * @param {string[]} campos  — ex: ['bio', 'foto', 'pronomes']
 */
export async function triggerEdicaoPerfil(campos) {
  // Aceita string (compatibilidade retroativa) ou array
  const camposArray = Array.isArray(campos) ? campos : [campos];
  if (camposArray.length === 0) return;

  return criarAtividade(ACTIVITY_TYPES.PROFILE_UPDATE, {
    campos: camposArray,
    // campo mantido por compatibilidade retroativa (primeiro campo alterado)
    campo: camposArray[0]
  });
}

/**
 * Dispare ao alterar status de relacionamento.
 */
export async function triggerMudancaStatus(novoStatus) {
  return criarAtividade(ACTIVITY_TYPES.STATUS_CHANGE, { novoStatus });
}

/**
 * Dispare no primeiro acesso / cadastro do usuário.
 */
export async function triggerNovoUsuario(uid) {
  const dedupId = `act_new_user_${uid}`;
  try {
    const snap = await getDoc(doc(db, 'activities', dedupId));
    if (snap.exists()) return;
  } catch (_) {}

  return criarAtividade(
    ACTIVITY_TYPES.NEW_USER,
    { uid },
    uid
  ).then(() => {
    setDoc(doc(db, 'activities', dedupId), {
      activityId: dedupId,
      type:       ACTIVITY_TYPES.NEW_USER,
      actorUid:   uid,
      createdAt:  serverTimestamp(),
      visible:    true,
      uid
    }).catch(() => {});
  });
}