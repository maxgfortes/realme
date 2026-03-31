// ============================================================
// activities-render.js — Realme
// Versão 2 — layout big+small, swipe-to-delete, ranking inteligente
// ============================================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, query, where, orderBy, limit,
  getDocs, getDoc, doc, deleteDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

function esperarAuth() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => { unsub(); resolve(user); });
  });
}

const DUAS_SEMANAS_MS = 14 * 24 * 60 * 60 * 1000;
const GROUPING_WINDOW = 6 * 60 * 60 * 1000;
const DEFAULT_PHOTO   = './src/icon/default.jpg';

// ─── Cache de usuários ────────────────────────────────────────────────────────
const userCache = {};
async function resolveUser(uid) {
  if (userCache[uid]) return userCache[uid];
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    let data = { username: uid, nome: uid, photo: DEFAULT_PHOTO };
    if (snap.exists()) {
      const d = snap.data();
      data.username = d.username || uid;
      data.nome     = d.displayName || d.displayname || d.nome || d.name || d.username || uid;
    }
    try {
      const mediaSnap = await getDoc(doc(db, `users/${uid}/user-infos/user-media`));
      if (mediaSnap.exists()) data.photo = mediaSnap.data().pfp || mediaSnap.data().userphoto || DEFAULT_PHOTO;
    } catch (_) {}
    userCache[uid] = data;
    return data;
  } catch (_) {
    return { username: uid, nome: uid, photo: DEFAULT_PHOTO };
  }
}

// ─── Busca amigos do usuário atual ───────────────────────────────────────────
async function buscarAmigos(uid) {
  const amigos = new Set();
  try {
    const [followersSnap, followingSnap] = await Promise.all([
      getDocs(collection(db, `users/${uid}/followers`)),
      getDocs(collection(db, `users/${uid}/following`))
    ]);
    followersSnap.forEach(d => amigos.add(d.id));
    followingSnap.forEach(d => amigos.add(d.id));
  } catch (_) {}
  return amigos;
}

// ─── Tempo relativo contextual ────────────────────────────────────────────────
function toMs(ts) {
  if (!ts) return 0;
  if (ts.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime();
}

function tempoContextual(ms) {
  const diff = Date.now() - ms;
  const m    = Math.floor(diff / 60000);
  const h    = Math.floor(diff / 3600000);
  const d    = Math.floor(diff / 86400000);
  const hora = new Date(ms).getHours();
  const periodo = hora < 12 ? 'de manhã' : hora < 18 ? 'à tarde' : 'à noite';

  if (diff < 60000)  return 'agora mesmo';
  if (m < 60)        return `${m}min atrás`;
  if (h < 24)        return `${h}h atrás`;
  if (d === 1)       return `ontem ${periodo}`;
  if (d < 7)         return `${d} dias atrás`;
  if (d < 14)        return 'semana passada';
  return `${d} dias atrás`;
}
function profileLink(username) {
  return `<a class="act-link" href="profile.html?u=${username}">${username}</a>`;
}
function spanAcao(text)  { return `<span class="act-acao">${text}</span>`; }
function spanTempo(text) { return `<span class="act-tempo">${text}</span>`; }

// ─── Texto limpo e natural ────────────────────────────────────────────────────
function gerarTexto(tipo, items, ultimoMs) {
  const primeiro = items[0];
  const n        = items.length;
  const autor    = profileLink(primeiro.authorUsername || primeiro.actorUid);
  const tempo    = tempoContextual(ultimoMs);
  const diffDays = Math.floor((Date.now() - ultimoMs) / 86400000);

  const autoresUnicos = [...new Map(items.map(i => [i.actorUid, i])).values()];
  const autoresLinks  = autoresUnicos.map(i => profileLink(i.authorUsername || i.actorUid));
  function listarNomes(links) {
    if (links.length === 1) return links[0];
    if (links.length === 2) return `${links[0]} e ${links[1]}`;
    const u = [...links]; const last = u.pop();
    return `${u.join(', ')} e ${last}`;
  }

  const statusLabel = {
    solteiro: 'solteiro', namorando: 'namorando',
    casado: 'casado', em_compromisso: 'em compromisso', viuvo: 'viúvo'
  };
  const campoLabel = {
    bio: 'atualizou a bio', foto: 'mudou a foto', banner: 'mudou o banner',
    nome: 'mudou o nome', pronomes: 'atualizou os pronomes',
    localizacao: 'atualizou a localização', musica: 'mudou a música favorita',
    genero: 'atualizou o gênero', username: 'mudou o username'
  };

  switch (tipo) {
    case 'new_post':
      return n === 1
        ? `${autor} ${spanAcao('publicou um post')} ${spanTempo(tempo)}`
        : `${autor} ${spanAcao('fez')} ${spanAcao(n + ' novos posts')} ${spanTempo(tempo)}`;

    case 'new_bubble':
      return n === 1
        ? `${autor} ${spanAcao('publicou uma nota')} ${spanTempo(tempo)}`
        : `${autor} ${spanAcao('publicou')} ${spanAcao(n + ' notas')} ${spanTempo(tempo)}`;

    case 'new_comment': {
      const alvo = primeiro.targetUsername ? profileLink(primeiro.targetUsername) : 'alguém';
      return n === 1
        ? `${autor} ${spanAcao('comentou em')} ${alvo} ${spanTempo(tempo)}`
        : `${autor} ${spanAcao('deixou')} ${spanAcao(n + ' comentários')} ${spanAcao('em')} ${alvo} ${spanTempo(tempo)}`;
    }

    case 'new_friendship': {
      const amigo = primeiro.targetUsername ? profileLink(primeiro.targetUsername) : 'alguém';
      return `${autor} ${spanAcao('e')} ${amigo} ${spanAcao('são amigos agora')} • ${spanTempo(tempo)}`;
    }

    case 'profile_update': {
      const campos = Array.isArray(primeiro.campos) ? primeiro.campos : [primeiro.campo];
      if (campos.length === 1) {
        const acao = campoLabel[campos[0]] || 'atualizou o perfil';
        return diffDays === 1
          ? `${autor} ${spanAcao(acao)} ${spanTempo('ontem')}`
          : `${autor} ${spanAcao(acao)} ${spanTempo(tempo)}`;
      }
      const acoes = campos.map(c => campoLabel[c] || c).join(', ');
      return `${autor} ${spanAcao('atualizou o perfil')} — ${spanAcao(acoes)} ${spanTempo(tempo)}`;
    }

    case 'status_change': {
      const novoStatus = statusLabel[primeiro.novoStatus] || primeiro.novoStatus;
      return diffDays === 0
        ? `${autor} ${spanAcao('está')} ${spanAcao(novoStatus)} ${spanTempo(tempo)}`
        : `${autor} ${spanAcao('está')} ${spanAcao(novoStatus)} ${spanAcao('desde')} ${spanTempo(tempo)}`;
    }

    case 'new_user':
      return n === 1
        ? `${autor} ${spanAcao('chegou ao Realme')} ${spanTempo(tempo)} 👋`
        : `${listarNomes(autoresLinks)} ${spanAcao('entraram no Realme')} ${spanTempo(tempo)} 👋`;

    default:
      return `${autor} ${spanAcao('fez algo novo')} ${spanTempo(tempo)}`;
  }
}

// ─── isBig ────────────────────────────────────────────────────────────────────
function isBig(tipo) {
  return ['new_post', 'new_bubble', 'new_friendship', 'new_user'].includes(tipo);
}

// ─── Agrupamento ─────────────────────────────────────────────────────────────
function agrupar(atividades) {
  const grupos = [];
  for (const act of atividades) {
    const actMs = toMs(act.createdAt);
    let adicionado = false;
    for (const grupo of grupos) {
      const mesmotipo = grupo.tipo === act.type;
      const mesmoAtor = act.type === 'new_user' ? true : grupo.items[0].actorUid === act.actorUid;
      const naJanela  = Math.abs(actMs - grupo.ultimoMs) <= GROUPING_WINDOW;
      if (mesmotipo && mesmoAtor && naJanela) {
        if (act.type === 'new_user' && grupo.items.some(i => i.actorUid === act.actorUid)) {
          adicionado = true; break;
        }
        grupo.items.push(act);
        grupo.ultimoMs = Math.min(grupo.ultimoMs, actMs);
        adicionado = true; break;
      }
    }
    if (!adicionado) grupos.push({ tipo: act.type, items: [act], ultimoMs: actMs });
  }
  return grupos;
}

// ════════════════════════════════════════════════════════════════════════════
// ALGORITMO DE RANKING
// ════════════════════════════════════════════════════════════════════════════
/**
 * Calcula score de cada grupo para ordenação final.
 *
 * Base: score cronológico decrescente (mais recente = maior score).
 * Modificadores:
 *   +40%  se o ator for amigo do usuário atual
 *   +15%  se o tipo for "big" (mais relevante)
 *   Fator de redescoberta aleatória: ±10% para quebrar monotonia
 *     — aplicado com peso menor em atividades muito recentes (< 6h)
 *
 * Uma atividade de amigo de 3 dias atrás ainda pode superar
 * um desconhecido de 1 dia atrás, mas nunca supera algo de horas atrás.
 */
function calcularRanking(grupos, amigosSet) {
  const agora = Date.now();

  return grupos.map(grupo => {
    const ageMs    = agora - grupo.ultimoMs;
    const ageHours = ageMs / 3600000;

    // Score base: decai com o tempo (0 a 1, 1 = agora, 0 ≈ 2 semanas)
    const baseScore = Math.max(0, 1 - ageMs / DUAS_SEMANAS_MS);

    // Boost de amigo
    const isAmigo    = grupo.items.some(i => amigosSet.has(i.actorUid));
    const friendBoost = isAmigo ? 0.40 : 0;

    // Boost de tipo big
    const typeBoost = isBig(grupo.tipo) ? 0.15 : 0;

    // Fator de redescoberta — menor para conteúdo muito fresco
    const recentDamp = ageHours < 6 ? 0.02 : 0.10;
    const redescoberta = (Math.random() * 2 - 1) * recentDamp;

    const score = baseScore * (1 + friendBoost + typeBoost) + redescoberta;

    return { ...grupo, _score: score, _isAmigo: isAmigo };
  });
}

// ════════════════════════════════════════════════════════════════════════════
// INJETAR CSS
// ════════════════════════════════════════════════════════════════════════════
function injetarCSS() {
  if (document.getElementById('xact-style')) return;
  const s = document.createElement('style');
  s.id = 'xact-style';
  s.textContent = `
  
  `;
  document.head.appendChild(s);
}

// ─── Monta bloco de avatares (1 ou 2 fotos) ──────────────────────────────────
function avatarsHtml(fotos) {
  if (fotos.length >= 2) {
    return `<div class="act-avatars duo">
      <img src="${fotos[0]}" onerror="this.src='${DEFAULT_PHOTO}'" loading="lazy">
      <img src="${fotos[1]}" onerror="this.src='${DEFAULT_PHOTO}'" loading="lazy">
    </div>`;
  }
  return `<div class="act-avatars single">
    <img src="${fotos[0] || DEFAULT_PHOTO}" onerror="this.src='${DEFAULT_PHOTO}'" loading="lazy">
  </div>`;
}

// ─── Renderiza card grande ────────────────────────────────────────────────────
function renderBigCard(grupo, currentUid) {
  const { tipo, items, ultimoMs, _isAmigo } = grupo;
  const ids    = items.map(i => i.activityId).join(',');
  const isDono = items.some(i => i.actorUid === currentUid);
  const texto  = gerarTexto(tipo, items, ultimoMs);

  // Para new_friendship pega foto do ator + foto do target; demais pega fotos dos atores únicos
  let fotos;
  if (tipo === 'new_friendship' && items[0].targetPhoto) {
    fotos = [items[0].authorPhoto || DEFAULT_PHOTO, items[0].targetPhoto].filter(Boolean);
  } else {
    fotos = [...new Map(items.map(i => [i.actorUid, i.authorPhoto])).values()].filter(Boolean).slice(0, 2);
  }

  const badgeHtml = _isAmigo ? `<span class="act-friend-badge">amigo</span>` : '';

  return `
  <div class="act-swipe-wrapper">
    <div class="act-big" data-ids="${ids}" data-dono="${isDono}">
      <div class="act-inner">
        <div>
          ${avatarsHtml(fotos)}
          ${badgeHtml}
        </div>
        <div class="act-text"><p>${texto}</p></div>
      </div>
    </div>
  </div>`;
}

// ─── Renderiza card pequeno — agora usa layout big ───────────────────────────
function renderSmallCard(grupo, currentUid) {
  const { tipo, items, ultimoMs, _isAmigo } = grupo;
  const ids    = items.map(i => i.activityId).join(',');
  const isDono = items.some(i => i.actorUid === currentUid);
  const texto  = gerarTexto(tipo, items, ultimoMs);
  const foto   = items[0].authorPhoto || DEFAULT_PHOTO;

  const fotos = [...new Map(items.map(i => [i.actorUid, i.authorPhoto])).values()].filter(Boolean).slice(0, 2);
  if (!fotos.length) fotos.push(foto);

  const badgeHtml = _isAmigo ? `<span class="act-friend-badge">amigo</span>` : '';

  return `
  <div class="act-swipe-wrapper">
    <div class="act-delete-hint"><i class="fas fa-trash-can"></i></div>
    <div class="act-big" data-ids="${ids}" data-dono="${isDono}">
      <div class="act-inner">
        <div>
          ${avatarsHtml(fotos)}
          ${badgeHtml}
        </div>
        <div class="act-text"><p>${texto}</p></div>
      </div>
    </div>
  </div>`;
}

// ─── Layout: todos os cards em coluna, sem pares ─────────────────────────────
function montarLayout(grupos, currentUid) {
  return grupos.map(grupo => {
    if (isBig(grupo.tipo)) return renderBigCard(grupo, currentUid);
    return renderSmallCard(grupo, currentUid);
  }).join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
// SWIPE TO REVEAL DELETE BUTTON
// ════════════════════════════════════════════════════════════════════════════
const SWIPE_THRESHOLD  = 60;   // px para revelar o botão
const SWIPE_MAX        = 100;  // px máximo de arrasto

function ativarSwipeDelete(container, currentUid) {
  // Fecha todos os cards abertos exceto o alvo
  function fecharOutros(exceptWrapper) {
    container.querySelectorAll('.act-swipe-wrapper.open').forEach(w => {
      if (w === exceptWrapper) return;
      const c = w.querySelector('.act-big');
      if (c) {
        c.style.transition = 'transform .2s ease';
        c.style.transform  = 'translateX(0)';
      }
      w.classList.remove('open');
    });
  }

  container.querySelectorAll('.act-big').forEach(card => {
    const isDono  = card.dataset.dono === 'true';
    const wrapper = card.closest('.act-swipe-wrapper');
    const hint    = wrapper?.querySelector('.act-delete-hint');
    if (!wrapper || !hint) return;

    // Injeta botão de apagar no hint (uma vez)
    if (!hint.querySelector('.act-delete-btn')) {
      hint.innerHTML = `<button class="act-delete-btn"> Apagar</button>`;
    }
    const btn = hint.querySelector('.act-delete-btn');

    // Clique no botão confirma a exclusão
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!isDono) return;

      card.style.transition = 'transform .25s ease, opacity .25s ease';
      card.style.transform  = 'translateX(-110%)';
      card.style.opacity    = '0';
      await new Promise(r => setTimeout(r, 250));

      const ids = card.dataset.ids.split(',').filter(id => !id.startsWith('_'));
      await Promise.all(ids.map(id => deleteDoc(doc(db, 'activities', id)).catch(() => {})));

      const doble = wrapper.closest('.act-doble');
      if (doble) {
        wrapper.remove();
        if (!doble.querySelector('.act-swipe-wrapper')) doble.remove();
      } else {
        wrapper.remove();
      }
    });

    let startX = 0, currentX = 0, dragging = false;

    function onStart(e) {
      if (!isDono) return;
      const touch = e.touches ? e.touches[0] : e;
      startX   = touch.clientX;
      currentX = 0;
      dragging = true;
      card.classList.add('swiping');
      fecharOutros(wrapper);
    }

    function onMove(e) {
      if (!dragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = Math.min(0, touch.clientX - startX);
      currentX = Math.max(dx, -SWIPE_MAX);
      card.style.transform = `translateX(${currentX}px)`;
    }

    function onEnd() {
      if (!dragging) return;
      dragging = false;
      card.classList.remove('swiping');

      if (Math.abs(currentX) >= SWIPE_THRESHOLD && isDono) {
        // Mantém aberto — usuário precisa clicar em "Apagar"
        card.style.transition = 'transform .2s ease';
        card.style.transform  = `translateX(-${SWIPE_MAX}px)`;
        wrapper.classList.add('open');
      } else {
        // Volta ao lugar
        card.style.transition = 'transform .2s ease';
        card.style.transform  = 'translateX(0)';
        wrapper.classList.remove('open');
      }
    }

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
      if (wrapper.classList.contains('open') && !wrapper.contains(e.target)) {
        card.style.transition = 'transform .2s ease';
        card.style.transform  = 'translateX(0)';
        wrapper.classList.remove('open');
      }
    });

    card.addEventListener('touchstart', onStart, { passive: true });
    card.addEventListener('touchmove',  onMove,  { passive: true });
    card.addEventListener('touchend',   onEnd);

    card.addEventListener('mousedown', e => { if (isDono) onStart(e); });
    document.addEventListener('mousemove', e => { if (dragging) onMove(e); });
    document.addEventListener('mouseup',   () => { if (dragging) onEnd(); });
  });
}

// ─── Função principal ─────────────────────────────────────────────────────────
async function carregarAtividades() {
  injetarCSS();
  const container = document.getElementById('activities-section');
  if (!container) return;

  container.innerHTML = `<div class="loading-area"><div class="xact-loading"></div></div>`;

  const user = await esperarAuth();
  if (!user) {
    container.innerHTML = `<p class="xact-empty">Você precisa estar logado para ver as atividades.</p>`;
    return;
  }

  try {
    const duasSemanasAtras = Timestamp.fromMillis(Date.now() - DUAS_SEMANAS_MS);

    // Busca atividades e amigos em paralelo
    const [snap, amigosSet] = await Promise.all([
      getDocs(query(
        collection(db, 'activities'),
        where('createdAt', '>=', duasSemanasAtras),
        where('visible', '==', true),
        orderBy('createdAt', 'desc'),
        limit(150)
      )),
      buscarAmigos(user.uid)
    ]);

    let atividades = snap.docs.map(d => ({ activityId: d.id, ...d.data() }));

    // Enriquece autor
    atividades = await Promise.all(atividades.map(async act => {
      if (!act.authorUsername && act.actorUid) {
        const u = await resolveUser(act.actorUid);
        return { ...act, authorUsername: u.username, authorNome: u.nome, authorPhoto: act.authorPhoto || u.photo };
      }
      return act;
    }));

    // Varrer /newusers
    try {
      const nuSnap = await getDocs(query(
        collection(db, 'newusers'),
        where('createat', '>=', duasSemanasAtras),
        orderBy('createat', 'desc'),
        limit(30)
      ));
      for (const d of nuSnap.docs) {
        const uid = d.id;
        if (atividades.some(a => a.type === 'new_user' && a.actorUid === uid)) continue;
        const u = await resolveUser(uid);
        atividades.push({
          activityId: `_newuser_${uid}`, type: 'new_user', actorUid: uid,
          authorUsername: u.username, authorNome: u.nome, authorPhoto: u.photo,
          createdAt: d.data().createat, visible: true
        });
      }
    } catch (e) {
      console.warn('[activities-render] Erro ao varrer newusers:', e);
    }

    // Ordena cronologicamente antes de agrupar
    atividades.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

    // Agrupa
    const grupos = agrupar(atividades);

    if (!grupos.length) {
      container.innerHTML = `<p class="xact-empty">Nenhuma atividade recente ainda.</p>`;
      return;
    }

    // Aplica ranking com peso de amizade + redescoberta
    const gruposRankeados = calcularRanking(grupos, amigosSet)
      .sort((a, b) => b._score - a._score);

    container.innerHTML = `
    <div class="xact-list">${montarLayout(gruposRankeados, user.uid)}</div>
    <div class="end-feed">
    <h3>As atividades acabaram...</h3>
    <p>ja viu tudo? porque não puxar assunto com alguém agora?</p>
    </div>`;

    // Ativa swipe-to-delete
    ativarSwipeDelete(container, user.uid);

  } catch (err) {
    console.error('[activities-render] Erro:', err);
    container.innerHTML = `<p class="xact-empty">Não foi possível carregar as atividades.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', carregarAtividades);