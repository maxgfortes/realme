import { db } from "/src/config/config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { currentUserId, filtrosInputs } from "/src/js/pages/friends/filters-state.js";

const filterBtn       = document.getElementById('filterBtn');
const optionBar        = document.querySelector('.option-bar');
const closeOptionsBtn  = document.getElementById('closeOptionsBtn');
const startBtn         = document.getElementById('start-filter-btn');
const switchIgualAMim  = document.getElementById('igualAMim');

// ─── Abrir fechar modal ───────────────────────────────────────────────────
if (filterBtn && optionBar) {
  filterBtn.addEventListener('click', () => optionBar.classList.add('open'));
}
if (closeOptionsBtn && optionBar) {
  closeOptionsBtn.addEventListener('click', () => optionBar.classList.remove('open'));
}
if (startBtn && optionBar) {
  startBtn.addEventListener('click', () => optionBar.classList.add('open'));
}

export function fecharModal() {
  optionBar?.classList.remove('open');
}

// ─── Toggle "Igual a mim" ───────────────────────────────────────────────────
if (switchIgualAMim) {
  switchIgualAMim.addEventListener('change', alternarIgualAMim);
}

async function alternarIgualAMim() {
  if (switchIgualAMim.checked) {
    filtrosInputs.forEach(el => { el.disabled = true; el.classList.add('cinza'); });
    await preencherComDadosDoUsuarioAtual();
  } else {
    filtrosInputs.forEach(el => { el.disabled = false; el.classList.remove('cinza'); el.value = ''; });
  }
}

async function preencherComDadosDoUsuarioAtual() {
  if (!currentUserId) return;

  const [userSnap, mediaSnap, aboutSnap, likesSnap] = await Promise.all([
    getDoc(doc(db, "users", currentUserId)),
    getDoc(doc(db, "users", currentUserId, "user-infos", "user-media")),
    getDoc(doc(db, "users", currentUserId, "user-infos", "about")),
    getDoc(doc(db, "users", currentUserId, "user-infos", "likes")),
  ]);

  const userData = userSnap.exists()  ? userSnap.data()  : {};
  const about    = aboutSnap.exists() ? aboutSnap.data() : {};
  const likes    = likesSnap.exists() ? likesSnap.data() : {};

  filtrosInputs.forEach(input => {
    const label = input.previousElementSibling?.textContent?.toLowerCase() || '';
    if (label.includes('estilo'))        input.value = about.styles      || '';
    if (label.includes('personalidade')) input.value = about.personality || '';
    if (label.includes('sonho'))         input.value = about.dreams      || '';
    if (label.includes('musica'))        input.value = likes.music       || '';
    if (label.includes('personagem'))    input.value = likes.characters  || '';
    if (label.includes('hobbies'))       input.value = likes.hobbies     || '';
    if (label.includes('local'))         input.value = userData.location || userData.localizacao || '';
  });
}