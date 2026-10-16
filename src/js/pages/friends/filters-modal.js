import { db } from "/src/config/config.js";

import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  currentUserId,
  filtrosInputs,
  getFieldKey,
  extrairCampos,
  calcularIdade,
  setIdadeBase
} from "/src/js/pages/friends/filters-state.js";

const mainPage = document.getElementById('mainPage');
const optionsOverlay = document.getElementById('optionsOverlay');

const btnOpenOptions = document.getElementById('btnOpenOptions');
const btnCloseOptions = document.getElementById('btnCloseOptions');

const startBtn = document.getElementById('start-filter-btn');

const switchIgualAMim = document.getElementById('igualAMim');


function openSearch() {
  if (!optionsOverlay || !mainPage) return;

  optionsOverlay.classList.add('active');
  mainPage.classList.add('hidden');
}

export function closeSearch() {
  if (!optionsOverlay || !mainPage) return;

  optionsOverlay.classList.remove('active');
  mainPage.classList.remove('hidden');
}

btnOpenOptions?.addEventListener('click', openSearch);
btnCloseOptions?.addEventListener('click', closeSearch);
startBtn?.addEventListener('click', openSearch);

switchIgualAMim?.addEventListener('change', alternarIgualAMim);


// dispara o autoajuste de altura dos textareas (inputSize.js)
function avisarMudanca(input) {
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

async function alternarIgualAMim() {

  if (switchIgualAMim.checked) {

    filtrosInputs.forEach((el) => {
      el.disabled = true;
      el.classList.add('cinza');
    });

    await preencherComDadosDoUsuarioAtual();

  } else {

    setIdadeBase(null);

    filtrosInputs.forEach((el) => {
      el.disabled = false;
      el.classList.remove('cinza');
      el.value = '';
      avisarMudanca(el);
    });
  }
}


// Cache em memória: não rele o perfil a cada vez que o switch é ligado
let meuPerfil = null;

async function carregarMeuPerfil() {

  if (meuPerfil) return meuPerfil;

  // um único getDocs traz todos os docs de user-infos (about, likes, ...)
  const [userSnap, infosSnap] = await Promise.all([
    getDoc(doc(db, "users", currentUserId)),
    getDocs(collection(db, "users", currentUserId, "user-infos"))
  ]);

  const userData = userSnap.exists() ? userSnap.data() : {};

  meuPerfil = {
    campos: extrairCampos(userData, infosSnap.docs.map(d => d.data())),
    idade: calcularIdade(userData.nascimento)
  };

  return meuPerfil;
}

async function preencherComDadosDoUsuarioAtual() {

  if (!currentUserId) return;

  try {

    const { campos, idade } = await carregarMeuPerfil();

    // o usuário desligou o switch enquanto carregava
    if (!switchIgualAMim.checked) return;

    filtrosInputs.forEach((input) => {

      const campo = getFieldKey(input);
      if (!campo) return;

      input.value = campo === 'age'
        ? (idade ?? '')
        : (campos[campo] || '');

      avisarMudanca(input);
    });

    // idade aproximada entra na busca automaticamente,
    // mesmo que o HTML não tenha um input de idade
    setIdadeBase(idade);

  } catch (error) {

    console.error('Erro ao carregar dados do usuário:', error);

  }
}