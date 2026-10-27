import { onCurrentUser } from "/src/shared/currentUser.js";

const navPfp = document.getElementById("nav-pic");
const navPfpPc = document.getElementById("navPicPc");

onCurrentUser(user => {
  if (!user?.photo) return;

  [navPfp, navPfpPc].forEach(image => {
    if (image && image.getAttribute("src") !== user.photo) image.src = user.photo;
  });
});
