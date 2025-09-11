
  const menuItems = document.querySelectorAll('.menu-item');
  const tabs = document.querySelectorAll('.tab');

  menuItems.forEach((item, index) => {
    item.addEventListener('click', () => {
      // Troca abas
      tabs.forEach(tab => tab.classList.remove('active'));
      tabs[index].classList.add('active');

      // Troca botão ativo
      menuItems.forEach(btn => btn.classList.remove('active'));
      item.classList.add('active');
    });
  });

  window.addEventListener("DOMContentLoaded", () => {
  const user = JSON.parse(localStorage.getItem("usuarioLogado"));

  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const nomeCompleto = document.getElementById("nomeCompleto");
  if (nomeCompleto) {
    nomeCompleto.textContent = `${user.nome} ${user.sobrenome}`;
  }

  const username = document.getElementById("username");
  if (username) {
    username.textContent = `@${user.username}`;
  }
});

