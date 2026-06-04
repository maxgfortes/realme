// ═══════════════════════════════════════════════════════════
// FUNÇÕES DE AMIZADE — Cloud Functions (Firebase)
// Coleção global: friendRequests/{fromUid}_{toUid}
// Subcoleção por usuário: users/{uid}/friends/{friendUid}
//
// O servidor é a única fonte de verdade:
//   - aceitar → cria /friends/ nos dois usuários
//   - rejeitar/desfazer → remove /friends/ nos dois
// ═══════════════════════════════════════════════════════════

const { onDocumentCreated, onDocumentDeleted } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError }                   = require('firebase-functions/v2/https');
const { initializeApp }                        = require('firebase-admin/app');
const { getFirestore, FieldValue }             = require('firebase-admin/firestore');

initializeApp();
const db = getFirestore();

// ───────────────────────────────────────────────────────────
// HELPER — valida que o caller está autenticado
// ───────────────────────────────────────────────────────────
function requireAuth(auth) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Faça login para continuar.');
}

// ═══════════════════════════════════════════════════════════
// enviarPedidoAmizade
// Cria o documento em friendRequests/{meId}_{targetId}
// Regra: não pode enviar para si mesmo, e não pode duplicar.
// ═══════════════════════════════════════════════════════════
exports.enviarPedidoAmizade = onCall(async ({ data, auth }) => {
  requireAuth(auth);
  const meId     = auth.uid;
  const targetId = data?.targetId;

  if (!targetId || typeof targetId !== 'string') throw new HttpsError('invalid-argument', 'targetId inválido.');
  if (meId === targetId) throw new HttpsError('invalid-argument', 'Você não pode se adicionar.');

  // Verifica se já são amigos
  const friendDoc = await db.doc(`users/${meId}/friends/${targetId}`).get();
  if (friendDoc.exists) throw new HttpsError('already-exists', 'Vocês já são amigos.');

  // Verifica pedido duplicado
  const reqId  = `${meId}_${targetId}`;
  const reqDoc = await db.doc(`friendRequests/${reqId}`).get();
  if (reqDoc.exists) throw new HttpsError('already-exists', 'Pedido já enviado.');

  // Se a outra pessoa já mandou pedido → aceita automaticamente
  const reversoId  = `${targetId}_${meId}`;
  const reversoDoc = await db.doc(`friendRequests/${reversoId}`).get();
  if (reversoDoc.exists) {
    return _aceitarAmizade(meId, targetId);
  }

  await db.doc(`friendRequests/${reqId}`).set({
    from:      meId,
    to:        targetId,
    status:    'pending',
    createdAt: FieldValue.serverTimestamp(),
  });

  return { success: true, action: 'requested' };
});

// ═══════════════════════════════════════════════════════════
// aceitarAmizade
// Aceita o pedido de targetId para meId.
// Cria /friends/ nos dois lados e remove o friendRequest.
// ═══════════════════════════════════════════════════════════
exports.aceitarAmizade = onCall(async ({ data, auth }) => {
  requireAuth(auth);
  const meId     = auth.uid;      // quem aceita
  const fromId   = data?.fromId;  // quem mandou o pedido

  if (!fromId || typeof fromId !== 'string') throw new HttpsError('invalid-argument', 'fromId inválido.');
  if (meId === fromId) throw new HttpsError('invalid-argument', 'Operação inválida.');

  const reqId  = `${fromId}_${meId}`;
  const reqDoc = await db.doc(`friendRequests/${reqId}`).get();
  if (!reqDoc.exists) throw new HttpsError('not-found', 'Pedido de amizade não encontrado.');

  return _aceitarAmizade(meId, fromId);
});

// ═══════════════════════════════════════════════════════════
// recusarPedido
// Remove o friendRequest sem criar amizade.
// ═══════════════════════════════════════════════════════════
exports.recusarPedido = onCall(async ({ data, auth }) => {
  requireAuth(auth);
  const meId   = auth.uid;
  const fromId = data?.fromId;

  if (!fromId) throw new HttpsError('invalid-argument', 'fromId inválido.');

  const batch = db.batch();
  batch.delete(db.doc(`friendRequests/${fromId}_${meId}`));
  await batch.commit();

  return { success: true };
});

// ═══════════════════════════════════════════════════════════
// cancelarPedido
// O remetente cancela o próprio pedido antes de ser aceito.
// ═══════════════════════════════════════════════════════════
exports.cancelarPedido = onCall(async ({ data, auth }) => {
  requireAuth(auth);
  const meId     = auth.uid;
  const targetId = data?.targetId;

  if (!targetId) throw new HttpsError('invalid-argument', 'targetId inválido.');

  await db.doc(`friendRequests/${meId}_${targetId}`).delete();
  return { success: true };
});

// ═══════════════════════════════════════════════════════════
// desfazerAmizade
// Remove a amizade dos dois lados (simétrico).
// ═══════════════════════════════════════════════════════════
exports.desfazerAmizade = onCall(async ({ data, auth }) => {
  requireAuth(auth);
  const meId     = auth.uid;
  const targetId = data?.targetId;

  if (!targetId) throw new HttpsError('invalid-argument', 'targetId inválido.');

  const batch = db.batch();
  batch.delete(db.doc(`users/${meId}/friends/${targetId}`));
  batch.delete(db.doc(`users/${targetId}/friends/${meId}`));
  // limpa possíveis requests residuais
  batch.delete(db.doc(`friendRequests/${meId}_${targetId}`));
  batch.delete(db.doc(`friendRequests/${targetId}_${meId}`));
  await batch.commit();

  return { success: true };
});

// ═══════════════════════════════════════════════════════════
// listarPedidosPendentes
// Retorna os pedidos de amizade pendentes para o usuário logado.
// ═══════════════════════════════════════════════════════════
exports.listarPedidosPendentes = onCall(async ({ auth }) => {
  requireAuth(auth);
  const snap = await db
    .collection('friendRequests')
    .where('to', '==', auth.uid)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .get();

  const pedidos = await Promise.all(
    snap.docs.map(async d => {
      const req     = d.data();
      const userDoc = await db.doc(`users/${req.from}`).get();
      const user    = userDoc.exists ? userDoc.data() : {};
      return {
        requestId: d.id,
        from:      req.from,
        username:  user.username || user.name || req.from,
        createdAt: req.createdAt,
      };
    })
  );

  return { pedidos };
});

// ═══════════════════════════════════════════════════════════
// TRIGGER: ao criar friendRequest → notifica o destinatário
// ═══════════════════════════════════════════════════════════
exports.onFriendRequestCreated = onDocumentCreated(
  'friendRequests/{reqId}',
  async event => {
    const req = event.data?.data();
    if (!req) return;

    const senderDoc = await db.doc(`users/${req.from}`).get();
    const sender    = senderDoc.exists ? senderDoc.data() : {};
    const senderName = sender.username || sender.name || 'Alguém';

    const targetDoc = await db.doc(`users/${req.to}`).get();
    if (!targetDoc.exists) return;

    const fcmToken = targetDoc.data()?.fcmToken;
    if (!fcmToken) return;

    // Envia notificação push via FCM (requer firebase-admin messaging)
    try {
      const { getMessaging } = require('firebase-admin/messaging');
      await getMessaging().send({
        token:        fcmToken,
        notification: {
          title: 'Pedido de Amizade',
          body:  `${senderName} te enviou um pedido de amizade`,
        },
        data: {
          type:   'friend_request',
          fromId: req.from,
        },
      });
    } catch (e) {
      console.warn('[FCM] Falha ao enviar notificação:', e.message);
    }
  }
);

// ═══════════════════════════════════════════════════════════
// TRIGGER: ao deletar friendRequest → garante consistência
// Se o documento era 'accepted' (raro), remove amizade dos dois lados.
// ═══════════════════════════════════════════════════════════
exports.onFriendRequestDeleted = onDocumentDeleted(
  'friendRequests/{reqId}',
  async event => {
    const req = event.data?.data();
    if (!req || req.status !== 'accepted') return;
    // Limpeza defensiva: se o request foi deletado com status accepted,
    // remove /friends/ nos dois lados para manter consistência.
    const batch = db.batch();
    batch.delete(db.doc(`users/${req.from}/friends/${req.to}`));
    batch.delete(db.doc(`users/${req.to}/friends/${req.from}`));
    await batch.commit();
  }
);

// ═══════════════════════════════════════════════════════════
// HELPER interno — cria amizade bidirecional e limpa request
// ═══════════════════════════════════════════════════════════
async function _aceitarAmizade(meId, fromId) {
  const now   = FieldValue.serverTimestamp();
  const batch = db.batch();

  batch.set(db.doc(`users/${meId}/friends/${fromId}`),  { uid: fromId, since: now });
  batch.set(db.doc(`users/${fromId}/friends/${meId}`),  { uid: meId,   since: now });
  batch.delete(db.doc(`friendRequests/${fromId}_${meId}`));
  batch.delete(db.doc(`friendRequests/${meId}_${fromId}`)); // limpa reverso se existir

  await batch.commit();
  return { success: true, action: 'accepted' };
}