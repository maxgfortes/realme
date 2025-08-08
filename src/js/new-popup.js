// ===================
// SISTEMA DE POP-UPS
// ===================
function criarPopup(titulo, mensagem, tipo = 'info') {
  // Remover pop-up existente se houver
  const popupExistente = document.querySelector('.custom-popup');
  if (popupExistente) {
    popupExistente.remove();
  }

  const popup = document.createElement('div');
  popup.className = `custom-popup ${tipo}`;
  
  const iconMap = {
    'success': 'fas fa-check-circle',
    'error': 'fas fa-exclamation-circle',
    'warning': 'fas fa-exclamation-triangle',
    'info': 'fas fa-info-circle'
  };

  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <i class="${iconMap[tipo] || iconMap.info}"></i>
        <h3>${titulo}</h3>
      </div>
      <div class="popup-body">
        <p>${mensagem}</p>
      </div>
      <div class="popup-footer">
        <button class="popup-btn popup-btn-primary" onclick="this.closest('.custom-popup').remove()">
          OK
        </button>
      </div>
    </div>
    <div class="popup-overlay" onclick="this.closest('.custom-popup').remove()"></div>
  `;

  document.body.appendChild(popup);

  // Auto-remover após 5 segundos para mensagens de sucesso
  if (tipo === 'success') {
    setTimeout(() => {
      if (popup.parentNode) {
        popup.remove();
      }
    }, 5000);
  }

  return popup;
}

function mostrarPopupConfirmacao(titulo, mensagem, callback) {
  const popup = document.createElement('div');
  popup.className = 'custom-popup warning';
  
  popup.innerHTML = `
    <div class="popup-content">
      <div class="popup-header">
        <i class="fas fa-question-circle"></i>
        <h3>${titulo}</h3>
      </div>
      <div class="popup-body">
        <p>${mensagem}</p>
      </div>
      <div class="popup-footer">
        <button class="popup-btn popup-btn-secondary" onclick="this.closest('.custom-popup').remove()">
          Cancelar
        </button>
        <button class="popup-btn popup-btn-primary" id="popup-confirm-btn">
          Confirmar
        </button>
      </div>
    </div>
    <div class="popup-overlay" onclick="this.closest('.custom-popup').remove()"></div>
  `;

  document.body.appendChild(popup);

  const confirmBtn = popup.querySelector('#popup-confirm-btn');
  confirmBtn.addEventListener('click', () => {
    popup.remove();
    if (callback) callback();
  });

  return popup;
}

// Mostrar pop-up de boas-vindas para novos usuários
window.addEventListener('DOMContentLoaded', () => {
  // Obter número de vezes que o popup foi exibido
  let count = parseInt(localStorage.getItem('popupBoasVindasCount')) || 0;

  if (count < 1) {
    // Mostrar o popup
    const popup = criarPopup(
      'Novo por aqui?',
      'Veja como usar o RealMe',
      'info'
    );

    // Substituir botão "OK" pelo botão de redirecionamento
    const btn = popup.querySelector('.popup-btn-primary');
    btn.textContent = 'Ver tutorial';
    btn.onclick = () => {
      window.location.href = 'como-usar.html';
    };

    // Atualizar o contador no localStorage
    localStorage.setItem('popupBoasVindasCount', (count + 1).toString());
  }
});
