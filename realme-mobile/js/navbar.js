import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
const auth = getAuth();

function configurarPerfilLink() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      const perfilBtns = [
        document.getElementById('linkPerfilSidebar'),
        document.getElementById('linkPerfilMobile'),
        document.getElementById('btnPerfil'),
        document.querySelector('.profile-mini')
      ];
      perfilBtns.forEach(btn => {
        if (btn) {
          btn.onclick = () => {
            window.location.href = `PF.html?userid=${user.uid}`;
          };
        }
      });
    }
  });
}

document.addEventListener("DOMContentLoaded", configurarPerfilLink);