document.addEventListener('DOMContentLoaded', function() {
  if (window.innerWidth <= 768) {
    // Cria o overlay
    const overlay = document.createElement('div');
    overlay.id = 'mobile-blocked';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = '#181818';
    overlay.style.color = '#fff';
    overlay.style.zIndex = '999999999999';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    // Conteúdo do aviso
    overlay.innerHTML = `
      <div style="
        text-align:center;
        padding:32px;
      ">
        <div style="font-size:48px;margin-bottom:16px;color:#4A90E2;">
          <i class="fas fa-desktop"></i>
        </div>
        <h2 style="font-size:22px;margin-bottom:10px;">Essa página só está disponível em PCs</h2>
        <p style="font-size:16px;color:#ccc;margin-bottom:24px;">Use um computador para acessar esta funcionalidade.</p>
        <button id="voltar-btn" style="
          font-size:16px;
          padding:10px 24px;
          border-radius:8px;
          border:none;
          background:#4A90E2;
          color:#fff;
          cursor:pointer;
        ">Voltar</button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Botão de voltar
    document.getElementById('voltar-btn').onclick = function() {
      window.history.back();
    };
  }
});