import { $ } from "./dom.js";
import { state } from "./state.js";
import { shareProfile } from "./share.js";

const openSettingsBtn = $("openSettingsBtn");
const closeSettingsBtn = $("closeSettingsBtn");
const shareMyProfileBtn = $("shareMyProfileBtn");

const sideMenu = $("sideMenu");
const profilePage = $("profilePage");

function openSettings() {
  sideMenu.classList.add("active");
  profilePage.classList.add("active");
}

function closeSettings() {
  sideMenu.classList.remove("active");
  profilePage.classList.remove("active");
}

function shareMyProfile(event) {
  event.preventDefault();
  shareProfile(state.currentUsername);
}

openSettingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
shareMyProfileBtn.addEventListener("click", shareMyProfile);
