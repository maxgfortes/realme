import { db } from "./firebase.js";
import { doc, setDoc } from "./firestore.js";
import { $ } from "./dom.js";
import { state } from "./state.js";
import { showToast } from "./toast.js";
import { fillEditInputs, readEditInputs } from "./aboutRender.js";
import { aboutDocFields, likesDocFields } from "./aboutFields.js";

const aboutMenuArea = $("aboutMenuArea");
const aboutMenuOverlay = $("aboutMenuOverlay");
const aboutMenu = $("aboutMenu");

const aboutContent = $("aboutContent");
const aboutContentEdit = $("aboutContentEdit");

const openViewMoreBtn = $("openViewMoreBtn");
const editAboutBtn = $("editAboutBtn");
const saveAboutBtn = $("saveAboutBtn");
const cancelAboutBtn = $("cancelAboutBtn");

function openAboutMenu() {
  aboutMenuArea.classList.add("active");
  aboutMenuOverlay.classList.add("active");
  aboutMenu.classList.add("active");
}

function closeAboutMenu() {
  aboutMenuOverlay.classList.remove("active");
  aboutMenu.classList.remove("active");
  setTimeout(() => aboutMenuArea.classList.remove("active"), 300);
}

function openEditMode() {
  fillEditInputs();

  editAboutBtn.classList.remove("active");
  cancelAboutBtn.classList.add("active");
  saveAboutBtn.classList.add("active");

  aboutContent.classList.remove("active");
  aboutContentEdit.classList.add("active");
}

function closeEditMode() {
  editAboutBtn.classList.toggle("active", state.isOwnProfile);
  cancelAboutBtn.classList.remove("active");
  saveAboutBtn.classList.remove("active");

  aboutContent.classList.add("active");
  aboutContentEdit.classList.remove("active");
}

function pickFields(values, fields) {
  return Object.fromEntries(fields.map(field => [field, values[field]]));
}

function infoDoc(name) {
  return doc(db, "users", state.currentUserId, "user-infos", name);
}

async function saveAbout() {
  const values = readEditInputs();

  await Promise.all([
    setDoc(infoDoc("about"), pickFields(values, aboutDocFields), { merge: true }),
    setDoc(infoDoc("likes"), pickFields(values, likesDocFields), { merge: true }),
  ]);

  closeEditMode();
  showToast("Informações salvas com sucesso.");
}

export function setupAboutPermissions() {
  editAboutBtn.classList.toggle("active", state.isOwnProfile);
}

editAboutBtn.addEventListener("click", openEditMode);
cancelAboutBtn.addEventListener("click", closeEditMode);
saveAboutBtn.addEventListener("click", saveAbout);

openViewMoreBtn.addEventListener("click", openAboutMenu);
aboutMenuOverlay.addEventListener("click", closeAboutMenu);
