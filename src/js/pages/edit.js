import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


import {
  triggerEdicaoPerfil,
  triggerMudancaStatus
} from './activitie-creator.js';

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

const IMGBB_API_KEY = "fc8497dcdf559dc9cbff97378c82344c";

async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res  = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, { method:'POST', body:formData });
  const data = await res.json();
  if (data.success) return data.data.url;
  throw new Error('ImgBB: ' + (data.error?.message || 'Erro desconhecido'));
}


let currentUser = null;
let currentData = {};
let pendingUploads = { pfp: null, banner: null };


const pfpImg        = document.querySelector('.pfp');
const bannerImg     = document.querySelector('.banner');
const inputs        = document.querySelectorAll('.label-input');
const inNome        = inputs[0];
const inUsername    = inputs[1];
const inPronomes    = inputs[2];
const inBio         = inputs[3];
const inLocalizacao = inputs[5];
const inMusica      = inputs[7];
const inCor         = inputs[8];
const saveBtn       = document.querySelector('.save-btn');


const _inGeneroOrig = inputs[4];
const selGenero = document.createElement('select');
selGenero.className = _inGeneroOrig.className;
selGenero.style.cssText = 'width:100%;background:transparent;border:none;color:inherit;font-size:inherit;outline:none;appearance:none;-webkit-appearance:none;cursor:pointer;';
[
  { val: '',          label: 'Selecione...' },
  { val: 'masculino', label: 'Masculino' },
  { val: 'feminino',  label: 'Feminino'  },
].forEach(({ val, label }) => {
  const o = document.createElement('option');
  o.value = val; o.textContent = label; o.style.background = '#1a1a1a';
  selGenero.appendChild(o);
});
_inGeneroOrig.parentNode.replaceChild(selGenero, _inGeneroOrig);

const _inRelacOrig = inputs[6];
const selRelac = document.createElement('select');
selRelac.className = _inRelacOrig.className;
selRelac.style.cssText = 'width:100%;background:transparent;border:none;color:inherit;font-size:inherit;outline:none;appearance:none;-webkit-appearance:none;cursor:pointer;';

function getStatusOpcoes(genero) {
  const f = genero === 'feminino';
  return [
    { val: '',              label: 'Selecione...'  },
    { val: 'solteiro',      label: f ? 'Solteira'       : 'Solteiro'      },
    { val: 'namorando',     label:     'Namorando'                         },
    { val: 'casado',        label: f ? 'Casada'         : 'Casado'        },
    { val: 'em compromisso',label:     'Em compromisso'                    },
    { val: 'viuvo',         label: f ? 'Viúva'          : 'Viúvo'         },
  ];
}

function atualizarOpcoeStatus(genero, valorAtual) {
  selRelac.innerHTML = '';
  getStatusOpcoes(genero).forEach(({ val, label }) => {
    const o = document.createElement('option');
    o.value = val; o.textContent = label; o.style.background = '#1a1a1a';
    selRelac.appendChild(o);
  });
  if (valorAtual !== undefined) selRelac.value = valorAtual;
}

atualizarOpcoeStatus('', '');
selGenero.addEventListener('change', () => atualizarOpcoeStatus(selGenero.value, selRelac.value));
_inRelacOrig.parentNode.replaceChild(selRelac, _inRelacOrig);

const inGenero = selGenero;
const inRelac  = selRelac;


let toastTimeout;
function showToast(msg, type = 'info') {
  let toast = document.getElementById('edit-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'edit-toast';
    toast.style.cssText = `
      position: fixed; bottom: calc(90px + env(safe-area-inset-bottom, 0px)); left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: #1e1e1e; color: #f8f9f9; padding: 12px 22px;
      border-radius: 14px; font-size: 14px; font-weight: 600;
      z-index: 999999; opacity: 0; pointer-events: none;
      transition: opacity .25s, transform .25s;
      border: 1px solid #333; max-width: 100vw; text-align: center;
      display: flex; align-items: center; gap: 8px; text-wrap: nowrap;`;
    document.body.appendChild(toast);
  }
  const icons = { success: '', error: '', loading: '', info: '' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  clearTimeout(toastTimeout);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  if (type !== 'loading') {
    toastTimeout = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, 3500);
  }
}

const RULES = {
  nome: {
    max: 40,
    validate: v => {
      if (!v.trim()) return 'O nome não pode estar vazio.';
      if (v.trim().length > 40) return 'Nome deve ter no máximo 40 caracteres.';
      return null;
    }
  },
  username: {
    max: 20,
    validate: v => {
      if (!v.trim()) return 'Username não pode estar vazio.';
      if (v.length < 3) return 'Username deve ter pelo menos 3 caracteres.';
      if (v.length > 20) return 'Username deve ter no máximo 20 caracteres.';
      if (!/^[a-z0-9_]+$/.test(v)) return 'Username só pode ter letras minúsculas, números e _.';
      return null;
    }
  },
  pronomes: {
    max: 30,
    validate: v => {
      if (v.length > 30) return 'Pronomes devem ter no máximo 30 caracteres.';
      return null;
    }
  },
  bio: {
    max: 150,
    validate: v => {
      if (v.length > 150) return 'Bio deve ter no máximo 150 caracteres.';
      return null;
    }
  },
  localizacao: {
    max: 50,
    validate: v => {
      if (v.length > 50) return 'Localização deve ter no máximo 50 caracteres.';
      return null;
    }
  },
  musica: {
    validate: v => {
      if (!v) return null;
      const isYT = /youtube\.com|youtu\.be/.test(v);
      if (!isYT) return 'Cole uma URL válida do YouTube.';
      return null;
    }
  },
};

function setupCharCounter(input, fieldKey) {
  const rule = RULES[fieldKey];
  if (!rule?.max) return;
  const counter = document.createElement('span');
  counter.style.cssText = 'font-size:11px;color:#555;position:absolute;right:10px;bottom:4px;pointer-events:none; display:none;';
  const area = input.parentElement;
  area.style.position = 'relative';
  area.appendChild(counter);
  const update = () => {
    const len = input.value.length;
    counter.textContent = `${len}/${rule.max}`;
    counter.style.color = len > rule.max * 0.9 ? (len >= rule.max ? '#f85149' : '#d29922') : '#555';
  };
  input.addEventListener('input', update);
  update();
}

function setFieldError(input, msg) {
  input.style.borderBottom = '2px solid #f85149';
  let err = input.parentElement.querySelector('.field-error');
  if (!err) { err = document.createElement('span'); err.className = 'field-error';
    err.style.cssText = 'font-size:11px;color:#f85149;display:block;margin-top:3px;'; input.parentElement.appendChild(err); }
  err.textContent = msg;
}
function clearFieldError(input) {
  input.style.borderBottom = '';
  input.parentElement.querySelector('.field-error')?.remove();
}


inUsername.addEventListener('input', () => {
  const pos = inUsername.selectionStart;
  inUsername.value = inUsername.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
  inUsername.setSelectionRange(pos, pos);
  clearFieldError(inUsername);
});


[inNome, inPronomes, inBio, inLocalizacao, inMusica].forEach(inp => {
  inp.addEventListener('input', () => clearFieldError(inp));
});


function criarFileInput(accept, callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) callback(file);
    input.remove();
  });
  return input;
}

function validarImagem(file) {
  const tipos = ['image/jpeg','image/png','image/webp','image/gif'];
  if (!tipos.includes(file.type)) return 'Formato inválido. Use JPG, PNG, WEBP ou GIF.';
  if (file.size > 5 * 1024 * 1024) return 'Imagem deve ter no máximo 5MB.';
  return null;
}

function previewImagem(file, imgEl) {
  const reader = new FileReader();
  reader.onload = e => { imgEl.src = e.target.result; };
  reader.readAsDataURL(file);
}

async function uploadImagem(file) {
  showToast('Enviando imagem…', 'loading');
  const url = await uploadToImgBB(file);
  return url;
}

document.querySelector('.pfp-area').addEventListener('click', () => {
  const fi = criarFileInput('image/*', file => {
    const err = validarImagem(file);
    if (err) { showToast(err, 'error'); return; }
    pendingUploads.pfp = file;
    previewImagem(file, pfpImg);
    showToast('Foto selecionada. Clique em Salvar.', 'info');
  });
  fi.click();
});

document.querySelector('.banner-area').addEventListener('click', () => {
  const fi = criarFileInput('image/*', file => {
    const err = validarImagem(file);
    if (err) { showToast(err, 'error'); return; }
    pendingUploads.banner = file;
    previewImagem(file, bannerImg);
    showToast('Banner selecionado. Clique em Salvar.', 'info');
  });
  fi.click();
});

document.querySelector('.pfp-area').style.cursor = 'pointer';
document.querySelector('.banner-area').style.cursor = 'pointer';

function addCameraOverlay(containerSel) {
  const c = document.querySelector(containerSel);
  if (!c) return;
  const ov = document.createElement('div');
  ov.style.cssText = `
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,0); border-radius:inherit; transition:background .2s; pointer-events:none;`;
  const icon = document.createElement('i');
  icon.className = 'fas fa-camera';
  icon.style.cssText = 'color:#fff; font-size:22px; opacity:0; transition:opacity .2s; filter:drop-shadow(0 1px 4px #000);';
  ov.appendChild(icon);
  c.style.position = 'relative';
  c.appendChild(ov);
  c.addEventListener('mouseenter', () => { ov.style.background='rgba(0,0,0,.45)'; icon.style.opacity='1'; });
  c.addEventListener('mouseleave', () => { ov.style.background='rgba(0,0,0,0)';   icon.style.opacity='0'; });
}
addCameraOverlay('.pfp-area');
addCameraOverlay('.banner-area');


async function carregarDadosAtuais(uid) {
  try {
    const [userDoc, mediaDoc, moreDoc, aboutDoc, linksDoc] = await Promise.all([
      getDoc(doc(db, 'users', uid)),
      getDoc(doc(db, `users/${uid}/user-infos/user-media`)),
      getDoc(doc(db, `users/${uid}/user-infos/more-infos`)),
      getDoc(doc(db, `users/${uid}/user-infos/about`)),
      getDoc(doc(db, `users/${uid}/user-infos/links`)),
    ]);
    const u  = userDoc.exists()  ? userDoc.data()  : {};
    const m  = mediaDoc.exists() ? mediaDoc.data() : {};
    const mi = moreDoc.exists()  ? moreDoc.data()  : {};
    const a  = aboutDoc.exists() ? aboutDoc.data() : {};
    const l  = linksDoc.exists() ? linksDoc.data() : {};

    currentData = { ...u, media: m, moreInfos: mi, about: a, linksData: l };

    inNome.value       = u.displayName || u.displayname || u.name || '';
    inUsername.value   = u.username || '';
    inBio.value        = mi.bio || '';
    const genVal = a.gender || u.gender || '';
    selGenero.value = genVal;
    atualizarOpcoeStatus(genVal, a.maritalStatus || '');
    inLocalizacao.value = a.location || u.location || '';
    inMusica.value = m.musicTheme || '';
    if (m.profileColor) inCor.value = m.profileColor;

    const p1 = a.pronom1 || '', p2 = a.pronom2 || '';
    inPronomes.value = p2 ? `${p1}/${p2}` : p1;

    const foto = m.pfp || m.userphoto;
    if (foto) pfpImg.src = foto;
    const banner = m.banner || m.headerphoto;
    if (banner) bannerImg.src = banner;

    document.querySelectorAll('[data-link]').forEach(input => {
      const key = input.dataset.link;
      input.value = l[key] || '';
    });

  } catch (e) { console.error('carregarDados:', e); showToast('Erro ao carregar seus dados.', 'error'); }
}

async function usernameDisponivel(newUsername, currentUid) {
  if (newUsername === (currentData.username || '')) return true;
  const snap = await getDoc(doc(db, 'usernames', newUsername));
  if (!snap.exists()) return true;
  return snap.data().uid === currentUid;
}


saveBtn.addEventListener('click', async () => {
  if (!currentUser) { showToast('Você precisa estar logado.', 'error'); return; }
  const uid = currentUser.uid;
 
  const validations = [
    { input: inNome,        key: 'nome',       val: inNome.value.trim() },
    { input: inUsername,    key: 'username',   val: inUsername.value },
    { input: inPronomes,    key: 'pronomes',   val: inPronomes.value },
    { input: inBio,         key: 'bio',        val: inBio.value },
    { input: inLocalizacao, key: 'localizacao',val: inLocalizacao.value },
    { input: inMusica,      key: 'musica',     val: inMusica.value },
  ];
 
  let hasError = false;
  for (const { input, key, val } of validations) {
    clearFieldError(input);
    const err = RULES[key]?.validate(val);
    if (err) { setFieldError(input, err); hasError = true; }
  }
  if (hasError) { showToast('Corrija os campos em vermelho.', 'error'); return; }

  const newUsername = inUsername.value;
  showToast('Verificando username…', 'loading');
  let disponivel;
  try { disponivel = await usernameDisponivel(newUsername, uid); }
  catch { showToast('Erro ao verificar username.', 'error'); return; }
  if (!disponivel) { setFieldError(inUsername, 'Este username já está em uso.'); showToast('Username já está em uso.', 'error'); return; }
 
  saveBtn.disabled = true;
  showToast('Salvando…', 'loading');
 
  let pfpUrl    = currentData.media?.userphoto || currentData.media?.pfp || null;
  let bannerUrl = currentData.media?.banner || currentData.media?.headerphoto || null;
 
  const mudouFoto    = !!pendingUploads.pfp;
  const mudouBanner  = !!pendingUploads.banner;
  const mudouNome    = inNome.value.trim() !== (currentData.displayName || currentData.displayname || currentData.name || '');
  const mudouBio     = inBio.value.trim() !== (currentData.moreInfos?.bio || '');
  const mudouStatus  = inRelac.value && inRelac.value !== (currentData.about?.maritalStatus || '');
  const mudouGenero  = inGenero.value !== (currentData.about?.gender || currentData.gender || '');
  const mudouLocal   = inLocalizacao.value.trim() !== (currentData.about?.location || currentData.location || '');
  const mudouMusica  = inMusica.value.trim() !== (currentData.media?.musicTheme || '');
  const mudouPronomes = inPronomes.value.trim() !== (() => {
    const p1 = currentData.about?.pronom1 || '';
    const p2 = currentData.about?.pronom2 || '';
    return p2 ? `${p1}/${p2}` : p1;
  })();
 
  try {
    if (pendingUploads.pfp) {
      showToast('Enviando foto de perfil…', 'loading');
      pfpUrl = await uploadImagem(pendingUploads.pfp);
      pendingUploads.pfp = null;
    }
    if (pendingUploads.banner) {
      showToast('Enviando banner…', 'loading');
      bannerUrl = await uploadImagem(pendingUploads.banner);
      pendingUploads.banner = null;
    }
  } catch (e) {
    console.error('upload:', e);
    showToast('Erro ao enviar imagem. Tente novamente.', 'error');
    saveBtn.disabled = false;
    return;
  }
 
  const pronoSplit = inPronomes.value.trim().split('/');
  const pronom1 = pronoSplit[0]?.trim() || '';
  const pronom2 = pronoSplit[1]?.trim() || '';
 
  try {
    const oldUsername = currentData.username || '';
 
    await setDoc(doc(db, 'users', uid), {
      displayName: inNome.value.trim(),
      displayname: inNome.value.trim(),
      username:    newUsername,
    }, { merge: true });

    if (newUsername !== oldUsername) {
      await setDoc(doc(db, 'usernames', newUsername), { uid, username: newUsername });
    }
 
    const mediaPayload = {
      musicTheme:   inMusica.value.trim(),
      profileColor: inCor.value,
    };
    if (pfpUrl)    mediaPayload.userphoto = pfpUrl;
    if (bannerUrl) mediaPayload.banner = bannerUrl;
    await setDoc(doc(db, `users/${uid}/user-infos/user-media`), mediaPayload, { merge: true });
 
    await setDoc(doc(db, `users/${uid}/user-infos/more-infos`), {
      bio: inBio.value.trim(),
    }, { merge: true });
 
    await setDoc(doc(db, `users/${uid}/user-infos/about`), {
      gender:        inGenero.value.trim(),
      location:      inLocalizacao.value.trim(),
      maritalStatus: inRelac.value.trim(),
      pronom1,
      pronom2,
    }, { merge: true });

    const linksPayload = {};
    document.querySelectorAll('[data-link]').forEach(input => {
      const key = input.dataset.link;
      linksPayload[key] = input.value.trim();
    });
    await setDoc(doc(db, `users/${uid}/user-infos/links`), linksPayload, { merge: true });
 
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('profile_cache_'))
        .forEach(k => localStorage.removeItem(k));
    } catch {}

    const camposAlterados = [];
    if (mudouFoto)     camposAlterados.push('foto');
    if (mudouBanner)   camposAlterados.push('banner');
    if (mudouNome)     camposAlterados.push('nome');
    if (mudouBio)      camposAlterados.push('bio');
    if (mudouPronomes) camposAlterados.push('pronomes');
    if (mudouGenero)   camposAlterados.push('genero');
    if (mudouLocal)    camposAlterados.push('localizacao');
    if (mudouMusica)   camposAlterados.push('musica');

    if (camposAlterados.length > 0) {
      triggerEdicaoPerfil(camposAlterados).catch(console.warn);
    }
    if (mudouStatus) triggerMudancaStatus(inRelac.value).catch(console.warn);
 
    showToast('Perfil salvo com sucesso!', 'success');
 
    setTimeout(() => {
      window.location.href = `profile.html?username=${newUsername}`;
    }, 1500);
 
  } catch (e) {
    console.error('save:', e);
    showToast('Erro ao salvar. Tente novamente.', 'error');
    saveBtn.disabled = false;
  }
});



setupCharCounter(inNome,        'nome');
setupCharCounter(inUsername,    'username');
setupCharCounter(inPronomes,    'pronomes');
setupCharCounter(inBio,         'bio');
setupCharCounter(inLocalizacao, 'localizacao');


onAuthStateChanged(auth, async user => {
  if (!user) {
    showToast('Você precisa estar logado.', 'error');
    setTimeout(() => { window.location.href = 'index.html'; }, 2000);
    return;
  }
  currentUser = user;
  await carregarDadosAtuais(user.uid);
});


const toggle = document.getElementById('links-toggle');
const linksList = document.querySelector('.links-list');
const arrow = toggle.querySelector('.toggle-arrow');

toggle.addEventListener('click', () => {
  linksList.classList.toggle('open');
  arrow.classList.toggle('rotated');
});