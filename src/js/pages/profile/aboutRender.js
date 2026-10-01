import { $ } from "./dom.js";
import { state } from "./state.js";
import { formatBirthday, formatJoinDate, getDisplayName, translateGender } from "./format.js";
import { viewFields, lockedFields, editableFields } from "./aboutFields.js";

const NOT_INFORMED = "Não informado";
const EMPTY_TEXT = "Ainda não há nada por aqui...";

function buildAboutValues() {
  const { user, about, likes } = state.profileData;
  const birthday = user.birthDate || user.nascimento || user.birthday || user.aniversario;

  return {
    name: getDisplayName(user),
    gender: translateGender(user.gender || about.gender) || NOT_INFORMED,
    birthday: formatBirthday(birthday),
    relationship: about.maritalStatus || NOT_INFORMED,
    joinedAt: formatJoinDate(user.createdAt || user.criadoem),
    location: about.location || user.location || NOT_INFORMED,
    searching: about.searching || NOT_INFORMED,
    overview: about.overview || EMPTY_TEXT,
    music: likes.music || EMPTY_TEXT,
    movies: likes.movies || EMPTY_TEXT,
    books: likes.books || EMPTY_TEXT,
    characters: likes.characters || EMPTY_TEXT,
    foods: likes.foods || EMPTY_TEXT,
    hobbies: likes.hobbies || EMPTY_TEXT,
    games: likes.games || EMPTY_TEXT,
    others: likes.others || EMPTY_TEXT,
  };
}

export function renderAboutMenu() {
  const values = buildAboutValues();
  const viewItems = document.querySelectorAll("#aboutContent .about-item-content");
  const lockedItems = document.querySelectorAll("#aboutContentEdit .muted .about-item-content");

  viewFields.forEach((field, index) => {
    viewItems[index].textContent = values[field];
  });

  lockedFields.forEach((field, index) => {
    lockedItems[index].textContent = values[field];
  });

  $("aboutMenuTitle").textContent = `Sobre ${state.profileData.user.username || ""}`;
}

export function fillEditInputs() {
  const source = { ...state.profileData.about, ...state.profileData.likes };
  const inputs = document.querySelectorAll("#aboutContentEdit textarea");

  editableFields.forEach((field, index) => {
    inputs[index].value = source[field] || "";
  });
}

export function readEditInputs() {
  const inputs = document.querySelectorAll("#aboutContentEdit textarea");
  const values = {};

  editableFields.forEach((field, index) => {
    values[field] = inputs[index].value.trim();
  });

  return values;
}
