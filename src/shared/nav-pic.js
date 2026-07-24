import { db, auth } from "/src/config/config.js";
import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";


const navPfp = document.getElementById('nav-pic');


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
    userphoto: dadosNovos.userphoto || (atual ? atual.userphoto : null)
  };

  localStorage.setItem("greeting", JSON.stringify(cache));
}

function mostrarCacheGreeting() {
  const greeting = lerCache();
  if (greeting) {
    if (greeting.userphoto) {
      navPfp.src = greeting.userphoto;
    }
  }
}

function getProfilePicture(uid) {
  const ref = doc(db, "users", uid, "user-infos", "user-media");
  onSnapshot(ref, function (snap) {
    if (snap.exists()) {
      const dados = snap.data();
      navPfp.src = dados.userphoto;
      salvarCacheGreeting({ userphoto: dados.userphoto });
    }
  });
}

mostrarCacheGreeting();

onAuthStateChanged(auth, function (user) {
  if (user) {
    getProfilePicture(user.uid);
  }
});