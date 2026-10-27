import { onCurrentUser } from "/src/shared/currentUser.js";

const dmTitle = document.getElementById("dmTitle");

onCurrentUser(user => {
  if (dmTitle && user?.name) dmTitle.textContent = user.name;
});
