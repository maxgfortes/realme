import { onCurrentUser } from "/src/shared/currentUser.js";

const userPfp = document.getElementById("creationModalPfp");
const displayNameCreation = document.getElementById("creationModalDisplayName");

onCurrentUser(user => {
  if (!user) return;

  if (displayNameCreation && user.name) displayNameCreation.textContent = user.name;
  if (userPfp && user.photo && userPfp.getAttribute("src") !== user.photo) userPfp.src = user.photo;
});
