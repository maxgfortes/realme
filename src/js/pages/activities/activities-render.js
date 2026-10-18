import { t, getLanguage, getLocale } from "/src/i18n/i18n.js";
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

const UM_MES_MS = 30 * 24 * 60 * 60 * 1000;
const GROUPING_WINDOW = 6 * 60 * 60 * 1000;
const DEFAULT_PHOTO   = '../public/img/default.jpg';

const ACTIVITIES_CACHE_KEY = `xact_cache_v2_${getLanguage()}`;
const ACTIVITIES_CACHE_TTL = 1 * 60 * 1000;

function lerCacheAtividades(uid) {
  try {
    const raw = localStorage.getItem(`${ACTIVITIES_CACHE_KEY}_${uid}`);
    if (!raw) return null;
    const { timestamp, html } = JSON.parse(raw);
    if (!html || !timestamp) return null;
    return { html, timestamp, stale: Date.now() - timestamp > ACTIVITIES_CACHE_TTL };
  } catch (_) {
    return null;
  }
}

function salvarCacheAtividades(uid, html) {
  try {
    localStorage.setItem(
      `${ACTIVITIES_CACHE_KEY}_${uid}`,
      JSON.stringify({ timestamp: Date.now(), html })
    );
  } catch (_) {
  }
}

function limparCacheAtividades(uid) {
  try { localStorage.removeItem(`${ACTIVITIES_CACHE_KEY}_${uid}`); } catch (_) {}
}

const PHOTO_LS_KEY = 'xact_photo_cache_v1';
const PHOTO_LS_TTL = 30 * 60 * 1000;

function carregarPhotoCacheLS() {
  try {
    const raw = localStorage.getItem(PHOTO_LS_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    const agora = Date.now();
    Object.keys(data).forEach(uid => {
      if (agora - data[uid].t > PHOTO_LS_TTL) delete data[uid];
    });
    return data;
  } catch (_) { return {}; }
}

function salvarPhotoCacheLS(uid, photoUrl) {
  try {
    const data = carregarPhotoCacheLS();
    data[uid] = { url: photoUrl, t: Date.now() };
    localStorage.setItem(PHOTO_LS_KEY, JSON.stringify(data));
  } catch (_) {}
}

const _photoCacheLS = carregarPhotoCacheLS();

const PHOTO_CACHE_TTL = 5 * 60 * 1000;
const userCache = {};

async function fetchPhotoFromFirestore(uid) {
  const lsCached = _photoCacheLS[uid];
  if (lsCached && Date.now() - lsCached.t < PHOTO_LS_TTL) {
    return lsCached.url || DEFAULT_PHOTO;
  }

  try {
    const mediaSnap = await getDoc(doc(db, `users/${uid}/user-infos/user-media`));
    if (mediaSnap.exists()) {
      const url = mediaSnap.data().userphoto || DEFAULT_PHOTO;
      salvarPhotoCacheLS(uid, url);
      _photoCacheLS[uid] = { url, t: Date.now() };
      return url;
    }
  } catch (_) {}
  return DEFAULT_PHOTO;
}

function patchAvatarsNoDom(uid, novaFoto) {
  document.querySelectorAll(`img[data-uid="${uid}"]`).forEach(img => {
    if (img.src !== novaFoto && novaFoto !== DEFAULT_PHOTO) {
      img.src = novaFoto;
    }
  });
}

async function refreshPhotoBackground(uid) {
  const novaFoto = await fetchPhotoFromFirestore(uid);
  if (userCache[uid]) {
    const mudou = userCache[uid].photo !== novaFoto;
    userCache[uid].photo          = novaFoto;
    userCache[uid].photoFetchedAt = Date.now();
    if (mudou) patchAvatarsNoDom(uid, novaFoto);
  }
}

async function resolveUser(uid) {
  const cached = userCache[uid];

  if (cached) {
    const fotoVelha = Date.now() - (cached.photoFetchedAt || 0) > PHOTO_CACHE_TTL;
    if (fotoVelha) {
      refreshPhotoBackground(uid);
    }
    return cached;
  }

  try {
    const [snap, foto] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      fetchPhotoFromFirestore(uid)
    ]);

    const data = { username: uid, nome: uid, photo: foto, photoFetchedAt: Date.now() };
    if (snap.exists()) {
      const d = snap.data();
      data.username = d.username || uid;
      const nomeCompleto = [d.name, d.surname]
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean)
        .join(' ');
      data.nome     = nomeCompleto || d.displayName || d.displayname || d.nome || d.username || uid;
    }

    userCache[uid] = data;
    return data;
  } catch (_) {
    return { username: uid, nome: uid, photo: DEFAULT_PHOTO, photoFetchedAt: Date.now() };
  }
}

async function buscarAmigos(uid) {
  const amigos = new Set();
  try {
    const [comoRemetente, comoDestinatario] = await Promise.all([
      getDocs(query(
        collection(db, 'friendRequests'),
        where('from',   '==', uid),
        where('status', '==', 'accepted')
      )),
      getDocs(query(
        collection(db, 'friendRequests'),
        where('to',     '==', uid),
        where('status', '==', 'accepted')
      ))
    ]);
    comoRemetente.forEach(d => amigos.add(d.data().to));
    comoDestinatario.forEach(d => amigos.add(d.data().from));
  } catch (_) {}
  return amigos;
}

function toMs(ts) {
  if (!ts) return 0;
  if (ts.seconds) return ts.seconds * 1000;
  return new Date(ts).getTime();
}

function tempoContextual(ms) {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  const w = Math.floor(d / 7);

  if (diff < 60000) return t('act.time.now');
  if (m < 60)       return t('act.time.minutes', { count: m });
  if (h < 24)       return t('act.time.hours', { count: h });
  if (d < 7)        return t('act.time.days', { count: d });
  if (w < 5)        return t('act.time.weeks', { count: w });
  return t('act.time.months', { count: Math.floor(d / 30) });
}
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function profileLink(username, nome) {
  return `<a class="act-link" href="profile.html?u=${encodeURIComponent(username)}">${escapeHtml(nome || username)}</a>`;
}
function spanDestaque(text) { return `<span class="act-link">${escapeHtml(text)}</span>`; }
function spanAcao(text)  { return `<span class="act-acao">${text}.</span>`; }
function spanTempo(text) { return `<span class="act-tempo">${text}</span>`; }

function gerarTexto(tipo, items, ultimoMs) {
  const primeiro = items[0];
  const n        = items.length;

  const autor = profileLink(
    primeiro.authorUsername || primeiro.actorUid,
    primeiro.authorNome || primeiro.authorName
  );

  const tempo = spanTempo(
    tempoContextual(ultimoMs)
  );

  const autoresUnicos = [
    ...new Map(
      items.map(i => [i.actorUid, i])
    ).values()
  ];

  const autoresLinks = autoresUnicos.map(i =>
    profileLink(i.authorUsername || i.actorUid, i.authorNome || i.authorName)
  );

  const alvoLink = (i) => (i.targetUsername || i.targetUid)
    ? profileLink(i.targetUsername || i.targetUid, i.targetNome)
    : t('act.someone');

  function listarNomes(links) {
    return new Intl.ListFormat(getLocale(), { type: 'conjunction' }).format(links);
  }

  const statusLabel = {
    solteiro: t('act.status.solteiro'),
    namorando: t('act.status.namorando'),
    casado: t('act.status.casado'),
    em_compromisso: t('act.status.em_compromisso'),
    viuvo: t('act.status.viuvo')
  };

  switch (tipo) {
    case 'new_post':
      return t('act.newPost', { count: n, author: autor, time: tempo });

    case 'new_bubble':
      return t('act.newNote', { count: n, author: autor, time: tempo });

    case 'new_comment': {
      const proprio = (i) => i.targetUid && i.targetUid === i.actorUid;
      const todosProprios = items.every(proprio);
      const alvosUnicos = new Set(items.map(i => i.targetUid || ''));

      if (n === 1) {
        return proprio(primeiro)
          ? t('act.commentOwn', { author: autor, time: tempo })
          : t('act.commentOn', { author: autor, target: alvoLink(primeiro), time: tempo });
      }
      if (todosProprios)
        return t('act.commentOwnMany', { count: n, author: autor, time: tempo });
      if (alvosUnicos.size === 1)
        return t('act.commentOnMany', { count: n, author: autor, target: alvoLink(primeiro), time: tempo });
      return t('act.commentMany', { count: n, author: autor, time: tempo });
    }

    case 'new_friendship':
      return t('act.friendship', { author: autor, target: alvoLink(primeiro), time: tempo });

    case 'profile_update':
      return t('act.profileUpdate', { author: autor, time: tempo });

    case 'status_change': {
      const novoStatus = spanDestaque(
        statusLabel[primeiro.novoStatus] || primeiro.novoStatus
      );
      return t('act.statusChange', { author: autor, status: novoStatus, time: tempo });
    }

    case 'new_location':
      return t('act.location', { author: autor, location: spanDestaque(primeiro.location), time: tempo });

    case 'add_profile_music':
      return t('act.addMusic', { author: autor, time: tempo });

    case 'update_profile_music':
      return t('act.updateMusic', { author: autor, time: tempo });

    case 'update_bio':
      return t('act.updateBio', { author: autor, time: tempo });

    case 'new_event':
      return t('act.newEvent', { count: n, author: autor, title: escapeHtml(primeiro.eventTitle || ''), time: tempo });

    case 'new_user':
      return n === 1
        ? t('act.newUser', { author: autor, time: tempo })
        : t('act.newUsers', { names: listarNomes(autoresLinks), time: tempo });

    default:
      return t('act.default', { author: autor, time: tempo });
  }
}

function getBucket(ms) {
  const agora   = Date.now();
  const diff    = agora - ms;
  const diffMin = diff / 60000;
  const diffH   = diff / 3600000;
  const diffD   = diff / 86400000;

  const hoje    = new Date(); hoje.setHours(0, 0, 0, 0);
  const ontem   = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
  const data    = new Date(ms);

  const diaSemana = data.getDay();
  const nomes = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];

  if (diffMin < 5)  return { key: 'agora',           label: t('act.bucket.now') };
  if (diffH   < 24 && data >= hoje)
                    return { key: 'hoje',             label: t('act.bucket.today') };
  if (data >= ontem)
                    return { key: 'ontem',            label: t('act.bucket.yesterday') };
  if (diffD   < 7)  return { key: nomes[diaSemana],  label: label7dias(diaSemana) };
  if (diffD   < 14) return { key: 'semana_passada',  label: t('act.bucket.lastWeek') };
  if (diffD   < 21) return { key: '2_semanas',        label: t('act.bucket.twoWeeks') };
  if (diffD   < 30) return { key: '3_semanas',        label: t('act.bucket.threeWeeks') };
  if (diffD   < 60) return { key: 'um_mes',           label: t('act.bucket.oneMonth') };
  return              { key: 'muito_tempo',           label: t('act.bucket.longAgo') };
}

function label7dias(diaSemana) {
  return t(`time.weekdayCap.${diaSemana}`);
}

function isBig(tipo) {
  return ['new_post', 'new_bubble', 'new_friendship', 'new_user'].includes(tipo);
}

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

function injetarCSS() {
  if (document.getElementById('xact-style')) return;
  const s = document.createElement('style');
  s.id = 'xact-style';
  s.textContent = `
  .act-post-thumb {
    width: 40px;
    height: 46px;
    object-fit: cover;
    border-radius: 8px;
    flex-shrink: 0;
    align-self: center;
    margin-left: auto;
  }
  .act-big[data-profile-nav] {
    cursor: pointer;
  }
  `;
  document.head.appendChild(s);
}

function avatarsHtml(fotos) {
  function imgTag({ src, uid } = {}) {
    const u = uid ? `data-uid="${uid}"` : '';
    return `<img src="${src || DEFAULT_PHOTO}" ${u} onerror="this.src='${DEFAULT_PHOTO}'" loading="lazy">`;
  }
  if (fotos.length >= 2) {
    return `<div class="act-avatars duo">
      ${imgTag(fotos[0])}
      ${imgTag(fotos[1])}
    </div>`;
  }
  return `<div class="act-avatars single">
    ${imgTag(fotos[0] || { src: DEFAULT_PHOTO })}
  </div>`;
}

const postImgCache = {};

async function fetchPostImage(postId) {
  if (!postId) return null;
  if (postId in postImgCache) return postImgCache[postId];

  try {
    const snap = await getDoc(doc(db, 'posts', postId));
    if (snap.exists()) {
      const d = snap.data();
      const first = Array.isArray(d.imgs) && d.imgs.length ? d.imgs[0] : null;
      const firstUrl = typeof first === 'string'
        ? first
        : first?.type === 'video'
          ? first.poster || null
          : first?.url || null;
      const url =
        (typeof d.img === 'string' && d.img.trim() ? d.img.trim() : null) ||
        firstUrl ||
        null;
      postImgCache[postId] = url;
      return url;
    }
  } catch (_) {}

  postImgCache[postId] = null;
  return null;
}

function postImageHtml(items) {
  const postId = items.find(i => i.postId)?.postId;
  const cached = postId ? postImgCache[postId] : undefined;
  if (cached) {
    return `<img class="act-post-thumb" src="${cached}" onerror="this.style.display='none'" loading="lazy" alt="">`;
  }

  const imgUrl = items.find(i => i.img?.trim())?.img;
  if (imgUrl) return `<img class="act-post-thumb" src="${imgUrl}" onerror="this.style.display='none'" loading="lazy" alt="">`;

  return '';
}

async function fetchPostImages(grupos) {
  const postIds = [
    ...new Set(
      grupos
        .filter(g => g.tipo === 'new_post')
        .flatMap(g => g.items.map(i => i.postId).filter(Boolean))
    )
  ];
  if (!postIds.length) return;
  await Promise.all(postIds.map(fetchPostImage));
}

function profileNavAttr(tipo, items) {
  if (['profile_update', 'status_change', 'new_location', 'add_profile_music', 'update_profile_music', 'update_bio'].includes(tipo)) {
    const username = items[0].authorUsername || items[0].actorUid;
    return `data-profile-nav="${encodeURIComponent(username)}"`;
  }
  return '';
}

function renderBigCard(grupo, currentUid) {
  const { tipo, items, ultimoMs, _isAmigo } = grupo;
  const ids    = items.map(i => i.activityId).join(',');
  const isDono = items.some(i => i.actorUid === currentUid);
  const texto  = gerarTexto(tipo, items, ultimoMs);
  const navAttr = profileNavAttr(tipo, items);

  let fotos;
  if (tipo === 'new_friendship') {
    fotos = [
      { src: items[0].authorPhoto || DEFAULT_PHOTO, uid: items[0].actorUid },
      { src: DEFAULT_PHOTO,                          uid: items[0].targetUid }
    ].filter(f => f.uid);

    if (items[0].targetUid && userCache[items[0].targetUid]) {
      fotos[1].src = userCache[items[0].targetUid].photo || DEFAULT_PHOTO;
    } else if (items[0].targetUid) {
      resolveUser(items[0].targetUid);
    }
  } else {
    fotos = [...new Map(items.map(i => [i.actorUid, i])).values()]
      .map(i => ({ src: i.authorPhoto || DEFAULT_PHOTO, uid: i.actorUid }))
      .filter(f => f.src)
      .slice(0, 2);
  }

  return `
  <div class="act-swipe-wrapper" data-type="${tipo}">
    <div class="act-big" data-ids="${ids}" data-dono="${isDono}" data-type="${tipo}" ${navAttr}>
      <div class="act-inner">
        <div>
          ${avatarsHtml(fotos)}
        </div>
        <div class="act-text"><p>${texto}</p></div>
        ${postImageHtml(items)}
      </div>
    </div>
  </div>`;
}

function renderSmallCard(grupo, currentUid) {
  const { tipo, items, ultimoMs, _isAmigo } = grupo;
  const ids    = items.map(i => i.activityId).join(',');
  const isDono = items.some(i => i.actorUid === currentUid);
  const texto  = gerarTexto(tipo, items, ultimoMs);
  const navAttr = profileNavAttr(tipo, items);

  const fotos = [...new Map(items.map(i => [i.actorUid, i])).values()]
    .map(i => ({ src: i.authorPhoto || DEFAULT_PHOTO, uid: i.actorUid }))
    .filter(f => f.src)
    .slice(0, 2);
  if (!fotos.length) fotos.push({ src: DEFAULT_PHOTO, uid: items[0].actorUid });

  return `
  <div class="act-swipe-wrapper" data-type="${tipo}">
    <div class="act-delete-hint"><i class="fas fa-trash-can"></i></div>
    <div class="act-big" data-ids="${ids}" data-dono="${isDono}" data-type="${tipo}" ${navAttr}>
      <div class="act-inner">
        <div>
          ${avatarsHtml(fotos)}
        </div>
        <div class="act-text"><p>${texto}</p></div>
        ${postImageHtml(items)}
      </div>
    </div>
  </div>`;
}

function montarLayout(grupos, currentUid) {
  let html = '';
  let bucketAtual = null;

  for (const grupo of grupos) {
    const bucket = getBucket(grupo.ultimoMs);

    if (bucket.key !== bucketAtual) {
      bucketAtual = bucket.key;
      html += `<div class="act-section-label">${bucket.label}</div>`;
    }

    if (isBig(grupo.tipo)) html += renderBigCard(grupo, currentUid);
    else                   html += renderSmallCard(grupo, currentUid);
  }

  return html;
}

const SWIPE_THRESHOLD  = 60;
const SWIPE_MAX        = 100;

function ativarSwipeDelete(container, currentUid) {
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

    if (!hint.querySelector('.act-delete-btn')) {
      hint.innerHTML = `<button class="act-delete-btn">
        <svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M432,144,403.33,419.74A32,32,0,0,1,371.55,448H140.46a32,32,0,0,1-31.78-28.26L80,144" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></path><rect x="32" y="64" width="448" height="80" rx="16" ry="16" style="fill:none;;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></rect><line x1="312" y1="240" x2="200" y2="352" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></line><line x1="312" y1="352" x2="200" y2="240" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></line></g></svg>
      </button>`;
    }
    const btn = hint.querySelector('.act-delete-btn');

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
        card.style.transition = 'transform .2s ease';
        card.style.transform  = `translateX(-${SWIPE_MAX}px)`;
        wrapper.classList.add('open');
      } else {
        card.style.transition = 'transform .2s ease';
        card.style.transform  = 'translateX(0)';
        wrapper.classList.remove('open');
      }
    }

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

    card.addEventListener('click', e => {
      if (e.target.closest('.act-link')) return;
      const nav = card.dataset.profileNav;
      if (nav) window.location.href = `profile.html?username=${nav}`;
    });
  });
}

async function fetchEMontarHtml(uid) {
  const duasSemanasAtras = Timestamp.fromMillis(Date.now() - UM_MES_MS);

  const [snap, amigosSet] = await Promise.all([
    getDocs(query(
      collection(db, 'activities'),
      where('createdAt', '>=', duasSemanasAtras),
      where('visible', '==', true),
      orderBy('createdAt', 'desc'),
      limit(150)
    )),
    buscarAmigos(uid)
  ]);

  let atividades = snap.docs.map(d => ({ activityId: d.id, ...d.data() }));

  atividades = await Promise.all(atividades.map(async act => {
    if (act.actorUid) {
      const u = await resolveUser(act.actorUid);
      return {
        ...act,
        authorUsername: act.authorUsername || u.username,
        authorNome:     u.nome || act.authorName,
        authorPhoto:    u.photo
      };
    }
    return act;
  }));

  atividades = await Promise.all(atividades.map(async act => {
    if (!act.targetUid) return act;
    const t = await resolveUser(act.targetUid);
    return { ...act, targetUsername: t.username || act.targetUsername, targetNome: t.nome };
  }));

  try {
    const nuSnap = await getDocs(query(
      collection(db, 'newusers'),
      where('createat', '>=', duasSemanasAtras),
      orderBy('createat', 'desc'),
      limit(30)
    ));
    for (const d of nuSnap.docs) {
      const newUid = d.id;
      if (atividades.some(a => a.type === 'new_user' && a.actorUid === newUid)) continue;
      const u = await resolveUser(newUid);
      atividades.push({
        activityId: `_newuser_${newUid}`, type: 'new_user', actorUid: newUid,
        authorUsername: u.username, authorNome: u.nome, authorPhoto: u.photo,
        createdAt: d.data().createat, visible: true
      });
    }
  } catch (e) {
    console.warn('[activities-render] Erro ao varrer newusers:', e);
  }

  atividades = atividades.filter(act =>
    act.actorUid === uid || amigosSet.has(act.actorUid)
  );

  atividades.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

  const grupos = agrupar(atividades);
  if (!grupos.length) return null;

  await fetchPostImages(grupos);

  const gruposOrdenados = grupos.map(grupo => ({
    ...grupo,
    _isAmigo: grupo.items.some(i => amigosSet.has(i.actorUid)),
    _isSeu:   grupo.items.some(i => i.actorUid === uid)
  }));

  return `
    <div class="xact-list">${montarLayout(gruposOrdenados, uid)}</div>
    <div class="end-feed">
    <h3>${t('act.endTitle')}</h3>
    <p>${t('act.endText')}</p>
    </div>`;
}

async function carregarAtividades() {
  injetarCSS();
  const container = document.getElementById('activities-section');
  if (!container) return;

  const user = await esperarAuth();
  if (!user) {
    container.innerHTML = `<p class="xact-empty">${t('act.signIn')}</p>`;
    return;
  }

  const uid    = user.uid;
  const cached = lerCacheAtividades(uid);

  if (cached) {
    container.innerHTML = cached.html;
    ativarSwipeDelete(container, uid);

    if (!cached.stale) return;

    fetchEMontarHtml(uid).then(html => {
      if (!html) return;
      salvarCacheAtividades(uid, html);
      if (container.scrollTop < 80) {
        container.innerHTML = html;
        ativarSwipeDelete(container, uid);
      }
    }).catch(err => console.warn('[activities-render] Revalidação em background falhou:', err));

    return;
  }

  container.innerHTML = `<div class="loading-area"><div class="xact-loading"></div></div>`;

  try {
    const html = await fetchEMontarHtml(uid);

    if (!html) {
      container.innerHTML = `<p class="xact-empty">${t('act.empty')}</p>`;
      return;
    }

    salvarCacheAtividades(uid, html);
    container.innerHTML = html;
    ativarSwipeDelete(container, uid);

  } catch (err) {
    console.error('[activities-render] Erro:', err);
    container.innerHTML = `<p class="xact-empty">${t('act.error')}</p>`;
  }
}

window.recarregarAtividades = async function () {
  const container = document.getElementById('activities-section');
  const user = auth.currentUser;
  if (!container || !user) return;

  limparCacheAtividades(user.uid);
  container.innerHTML = `<div class="loading-area"><div class="xact-loading"></div></div>`;

  try {
    const html = await fetchEMontarHtml(user.uid);
    if (!html) { container.innerHTML = `<p class="xact-empty">${t('act.empty')}</p>`; return; }
    salvarCacheAtividades(user.uid, html);
    container.innerHTML = html;
    ativarSwipeDelete(container, user.uid);
  } catch (err) {
    console.error('[activities-render] Erro ao recarregar:', err);
  }
};

const FILTER_TYPES = {
  'Todos':          null,
  'Comentarios':    ['new_comment'],
  'Novas Amizades': ['new_friendship', 'new_user'],
  'Posts':          ['new_post'],
  'Notas':          ['new_bubble'],
};

function aplicarFiltro(filtroLabel) {
  const tipos   = FILTER_TYPES[filtroLabel] ?? null;
  const section = document.getElementById('activities-section');
  if (!section) return;

  section.querySelectorAll('.act-swipe-wrapper').forEach(wrapper => {
    const visivel = !tipos || tipos.includes(wrapper.dataset.type);
    wrapper.style.display = visivel ? '' : 'none';
  });

  section.querySelectorAll('.act-section-label').forEach(label => {
    let next = label.nextElementSibling;
    let temVisivel = false;
    while (next && !next.classList.contains('act-section-label') && !next.classList.contains('end-feed')) {
      if (next.style.display !== 'none') { temVisivel = true; break; }
      next = next.nextElementSibling;
    }
    label.style.display = temVisivel ? '' : 'none';
  });
}

function iniciarFiltros() {
  const section = document.getElementById('activities-section');
  if (!section) return;

  new MutationObserver(() => {
    const ativo = document.querySelector('.act-filter.active');
    if (ativo) aplicarFiltro(ativo.dataset.filter || ativo.textContent.trim());
  }).observe(section, { childList: true });

  document.querySelectorAll('.act-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.act-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aplicarFiltro(btn.dataset.filter || btn.textContent.trim());
    });
  });
}

const AUTO_REFRESH_MS = 60 * 1000;
let atualizandoEmSilencio = false;

async function atualizarEmSilencio() {
  const container = document.getElementById('activities-section');
  const user = auth.currentUser;

  if (!container || !user || document.hidden || atualizandoEmSilencio) return;
  if (container.scrollTop >= 80 || container.querySelector('.swiping, .act-swipe-wrapper.open')) return;

  atualizandoEmSilencio = true;

  try {
    const html = await fetchEMontarHtml(user.uid);

    if (!html || html === lerCacheAtividades(user.uid)?.html || container.scrollTop >= 80) return;

    salvarCacheAtividades(user.uid, html);
    container.innerHTML = html;
    ativarSwipeDelete(container, user.uid);
  } catch (err) {
    console.warn('[activities-render] Atualização automática falhou:', err);
  } finally {
    atualizandoEmSilencio = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  carregarAtividades();
  iniciarFiltros();

  setInterval(atualizarEmSilencio, AUTO_REFRESH_MS);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) atualizarEmSilencio();
  });
});