import { signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { $, select } from "./dom.js";
import { state } from "./state.js";
import { LOGIN_PAGE } from "./constants.js";
import { clearOwnUid } from "./profileCache.js";

const loginBtn = $("loginBtn");
const logoutBtn = $("logoutBtn");

export function renderAuthMenu() {
  const loggedIn = Boolean(state.currentUserId);

  loginBtn.classList.toggle("hidden", loggedIn);
  logoutBtn.classList.toggle("hidden", !loggedIn);
  $("shareMyProfileBtn").classList.toggle("hidden", !loggedIn);
  select(".menu-item-link.edit").classList.toggle("hidden", !loggedIn);
}

function goToLogin(event) {
  event.preventDefault();
  location.href = LOGIN_PAGE;
}

async function logout(event) {
  event.preventDefault();
  clearOwnUid();
  await signOut(auth);
  location.replace(LOGIN_PAGE);
}

loginBtn.addEventListener("click", goToLogin);
logoutBtn.addEventListener("click", logout);
