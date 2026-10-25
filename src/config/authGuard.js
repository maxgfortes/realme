import { auth } from "./config.js";
import "/src/shared/appGuard.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("/welcome.html");
  }
});