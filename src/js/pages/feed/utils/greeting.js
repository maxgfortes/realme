import { db, auth } from "../../../../config/config.js";
import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


const greetingPfp = document.getElementById('greetingPfp');
const greeting = document.getElementById('greeting');
const displayNameElement = document.getElementById('greetingUsername');

function greetingText() {
    const h = new Date().getHours();
    if (h < 5) return "Boa noite";
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
}

greeting.textContent = greetingText();

function lerCache() {
  const localGreeting = localStorage.getItem("greeting");

  if (!localGreeting) {
    return null;
  }

  return JSON.parse(localGreeting);
}

function salvarCacheGreeting(dadosNovos) {
  const atual = lerCache();

  const cache = {
    displayName: dadosNovos.displayName || (atual ? atual.displayName : null),
    userphoto: dadosNovos.userphoto || (atual ? atual.userphoto : null)
  };

  localStorage.setItem("greeting", JSON.stringify(cache));
}

function mostrarCacheGreeting() {
  const greeting = lerCache();
  if (greeting) {
    if (greeting.displayName) {
      displayNameElement.textContent = greeting.displayName;
    }
    if (greeting.userphoto) {
      greetingPfp.src = greeting.userphoto;
    }
  }
}

function getDisplayName(uid) {
  const ref = doc(db, "users", uid);
  onSnapshot(ref, function (snap) {
    if (snap.exists()) {
      const dados = snap.data();
      const displayName = `${dados.name || ""} ${dados.surname || ""}`.trim();
      displayNameElement.textContent = displayName;
      salvarCacheGreeting({
        displayName: displayName
      });
    }
  });
}

function getProfilePicture(uid) {
  const ref = doc(db, "users", uid, "user-infos", "user-media");
  onSnapshot(ref, function (snap) {
    if (snap.exists()) {
      const dados = snap.data();
      greetingPfp.src = dados.userphoto;
      salvarCacheGreeting({ userphoto: dados.userphoto });
    }
  });
}

mostrarCacheGreeting();

onAuthStateChanged(auth, function (user) {
  if (user) {
    getDisplayName(user.uid);
    getProfilePicture(user.uid);
  }
});

const btn = document.getElementById('openPostLayer');

const frases = [
  "Como foi o seu dia?",
  "O que você está pensando?",
  "Quer compartilhar algo?",
  "O que rolou hoje?",
  "Alguma novidade?"
];

const indiceAleatorio = Math.floor(Math.random() * frases.length);
btn.textContent = frases[indiceAleatorio];