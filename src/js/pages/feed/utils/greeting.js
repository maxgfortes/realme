import { t } from "/src/i18n/i18n.js";

const greetingPfp = document.getElementById('greetingPfp');
const greeting = document.getElementById('greeting');
const displayNameElement = document.getElementById('greetingUsername');

function greetingText() {
    const h = new Date().getHours();
    if (h < 5) return t("greeting.night");
    if (h < 12) return t("greeting.morning");
    if (h < 18) return t("greeting.afternoon");
    return t("greeting.night");
}

greeting.textContent = greetingText();

import { onCurrentUser } from "/src/shared/currentUser.js";

onCurrentUser(user => {
  if (!user) return;

  if (user.name) displayNameElement.textContent = user.name;
  if (user.photo && greetingPfp.getAttribute("src") !== user.photo) greetingPfp.src = user.photo;
});
