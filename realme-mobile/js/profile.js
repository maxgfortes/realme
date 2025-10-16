
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

