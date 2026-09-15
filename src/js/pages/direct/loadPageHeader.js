import { auth, db } from "../../../config/config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  doc,
  onSnapshot,
  getFirestore,
  getDocs,
  query,
  orderBy,
  where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const dmTitle = document.getElementById("dmTitle");

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
      dmTitle.textContent = greeting.displayName;
    }
  }
}

function getDisplayName(uid) {
  const ref = doc(db, "users", uid);
  onSnapshot(ref, function (snap) {
    if (snap.exists()) {
      const dados = snap.data();
      const displayName = `${dados.name || ""} ${dados.surname || ""}`.trim();
      dmTitle.textContent = displayName;
      salvarCacheGreeting({
        displayName: displayName
      });
    }
  });
}

mostrarCacheGreeting();

onAuthStateChanged(auth, function (user) {
  if (user) {
    getDisplayName(user.uid);
  }
});