function createPcAlert({ title, subtitle, logo } = {}) {
  if (!document.getElementById("pc-alert-style")) {
    const style = document.createElement("style");
    style.id = "pc-alert-style";
    style.textContent = `
      @media (min-width: 901px) {
        .pc-alert {
          display: flex;
          background-color: #0f0f0fc2;
          height: 100vh;
          width: 100%;
          position: fixed;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          flex-direction: column;
          background-image: url("/public/img/alert-bg.png");
          background-position: center;
          background-repeat: no-repeat;
          background-size: cover;
          top: 0;
          pointer-events: all;
        }
        .pc-alert-logo { font-size: 2em; font-weight: bold; color: #fff; font-family: Arial, Helvetica, sans-serif; }
        .logo-area { padding-bottom: 30px; }
        .pc-alert-subtitle { font-size: 1em; color: #aaa; }
        .pc-alert-title { font-size: 1.2em; font-weight: bold; color: #fff; }
      }
      @media (max-width: 900px) {
        .pc-alert { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  const el = document.createElement("div");
  el.className = "pc-alert";
  el.innerHTML = `
    <div class="logo-area">
      <div class="pc-alert-logo">${logo ?? "RealMe"}</div>
    </div>
    <div class="pc-alert-title">${title ?? "Indisponivel em PCs"}</div>
    <div class="pc-alert-subtitle">${subtitle ?? "por enquanto o realme só esta disponivel em celulares."}</div>
  `;
  return el;
}

document.body.appendChild(createPcAlert());