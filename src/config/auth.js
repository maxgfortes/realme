import { db, auth } from "/src/config/config.js";
import {
  doc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { salvarCache } from "/src/shared/cache.js";

// --- estado interno ---
let currentUser = null;
let currentUserData = null; // { username }
let currentUserMedia = null; // { userphoto }

const userListeners = [];   // callbacks(user)
const dataListeners = [];   // callbacks({ username, userphoto })

// --- redistribui pra quem já se inscreveu + dispara evento global ---
function notifyUser(user) {
  userListeners.forEach((cb) => cb(user));
  window.dispatchEvent(new CustomEvent("authReady", { detail: user }));
}

function notifyData() {
  const combined = {
    username: currentUserData?.username ?? null,
    userphoto: currentUserMedia?.userphoto ?? null
  };
  salvarCache(combined);
  dataListeners.forEach((cb) => cb(combined));
  window.dispatchEvent(new CustomEvent("userDataReady", { detail: combined }));
}

// --- único listener de auth de toda a aplicação ---
onAuthStateChanged(auth, function (user) {
  currentUser = user;

  if (!user) {

    // window.location.href = "/login.html";
    notifyUser(null);
    return;
  }

  notifyUser(user);

  // único listener do doc "users/{uid}" (username, etc)
  const userRef = doc(db, "users", user.uid);
  onSnapshot(userRef, function (snap) {
    if (snap.exists()) {
      currentUserData = snap.data();
      notifyData();
    }
  });

  // único listener do doc "users/{uid}/user-infos/user-media" (foto)
  const mediaRef = doc(db, "users", user.uid, "user-infos", "user-media");
  onSnapshot(mediaRef, function (snap) {
    if (snap.exists()) {
      currentUserMedia = snap.data();
      notifyData();
    }
  });
});

export function onUserReady(callback) {
  if (currentUser) callback(currentUser);
  userListeners.push(callback);
}

// chama callback com { username, userphoto } assim que disponível
export function onUserDataReady(callback) {
  if (currentUserData || currentUserMedia) {
    callback({
      username: currentUserData?.username ?? null,
      userphoto: currentUserMedia?.userphoto ?? null
    });
  }
  dataListeners.push(callback);
}

export function getCurrentUser() {
  return currentUser;
}