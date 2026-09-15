const notesRow = document.getElementById("notesRow");

const createNoteBtn = document.getElementById("createNoteBtn");

const createNoteArea = document.getElementById("createNoteArea");

const createNoteOverlay = document.getElementById("createNoteOverlay");

const createNoteModal = document.getElementById("createNoteModal");

const sendFeeling = document.getElementById("sendFeeling");

const cancelFeeling = document.getElementById("cancelFeeling");

const noteName = document.getElementById("notenName");

const notePfp = document.getElementById("notePfp");

const createNoteModalPfp = document.getElementById("createNoteModalPfp");
const createNoteModalName = document.getElementById("createNoteModalName");


function openNoteOverlay() {

  createNoteArea.classList.add("active");

  createNoteOverlay.classList.add("active");

  createNoteModal.classList.add("active");

}


function closeNoteOverlay() {

  createNoteOverlay.classList.remove("active");

  createNoteModal.classList.remove("active");

  setTimeout(function() {

    createNoteArea.classList.remove("active");

  }, 300);

}


async function postNote() {

}


async function deleteNote() {

}


async function loadNotes() {

}


function loadUserInfo() {

  const cache = localStorage.getItem("greeting");

  if (!cache) {

    return;

  }

  const dados = JSON.parse(cache);

  if (dados.displayName) {

    noteName.textContent = dados.displayName;

  }

  if (dados.userphoto) {

    notePfp.src = dados.userphoto;

    createNoteModalPfp.src = dados.userphoto;

  }

  if (dados.displayName) {
    createNoteModalName.textContent = dados.displayName + " está:";
  }

}

function renderNotes() {

}


createNoteBtn.addEventListener("click", openNoteOverlay);

cancelFeeling.addEventListener("click", closeNoteOverlay);

loadUserInfo();