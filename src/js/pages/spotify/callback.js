import { t } from "/src/i18n/i18n.js";
import { app, auth } from "/src/config/config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

const textEl = document.getElementById("spotifyCallbackText");
const backLink = document.getElementById("spotifyCallbackBack");

const params = new URLSearchParams(location.search);
const code = params.get("code");
const state = params.get("state");

const connectCall = httpsCallable(getFunctions(app, "us-central1"), "spotifyConnect");

function fail(message) {
  textEl.textContent = message;
  backLink.hidden = false;
  document.body.classList.add("failed");
}

async function finish(user) {
  if (!user) {
    location.replace("/login.html");
    return;
  }

  if (params.get("error") || !code || !state) {
    location.replace("/profile.html");
    return;
  }

  history.replaceState(null, "", location.pathname);

  try {
    await connectCall({ code, state });
    location.replace("/profile.html?spotify=connected");
  } catch (error) {
    console.error("Erro ao conectar Spotify:", error);
    fail(t("spotify.connectError"));
  }
}

const unsubscribe = onAuthStateChanged(auth, user => {
  unsubscribe();
  finish(user);
});
