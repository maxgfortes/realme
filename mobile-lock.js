// js/mobile-lock.js
document.addEventListener("DOMContentLoaded", () => {
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (isMobile) {
    const lockDiv = document.createElement("div");
    lockDiv.id = "mobile-lock";
    lockDiv.innerHTML = `
      <style>
        #mobile-lock {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          backdrop-filter: blur(10px);
          background-color: rgba(0, 0, 0, 0.4);
          color: white;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          z-index: 9999;
          text-align: center;
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        #mobile-lock h1 {
          font-size: 2.5em;
          margin-bottom: 1em;
        }
        #mobile-lock p {
          font-size: 1.2em;
          max-width: 90%;
        }
      </style>
      <h1>RealMe</h1>
      <p>Por enquanto, nossa rede social está disponível apenas no computador. Agradecemos pela compreensão.</p>
    `;
    document.body.appendChild(lockDiv);
    document.body.style.overflow = "hidden";
  }
});
