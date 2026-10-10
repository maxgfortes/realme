let overlay = null;
let titleEl = null;
let textEl = null;
let confirmBtn = null;
let cancelBtn = null;
let resolver = null;

function createConfirm() {
  if (overlay) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div class="overlay-alert" id="confirmOverlay">
      <div class="alert-box">
        <div class="alert-area">
          <div class="alert-title"></div>
          <div class="alert-text"></div>
        </div>
        <div class="alert-actions">
          <button class="alert-btn" id="confirmCancelBtn">Cancelar</button>
          <button class="alert-btn critic-btn" id="confirmOkBtn"></button>
        </div>
      </div>
    </div>
  `);

  overlay = document.getElementById("confirmOverlay");
  titleEl = overlay.querySelector(".alert-title");
  textEl = overlay.querySelector(".alert-text");
  confirmBtn = overlay.querySelector("#confirmOkBtn");
  cancelBtn = overlay.querySelector("#confirmCancelBtn");

  cancelBtn.addEventListener("click", () => closeConfirm(false));
  confirmBtn.addEventListener("click", () => closeConfirm(true));
  overlay.addEventListener("click", event => {
    if (event.target === overlay) closeConfirm(false);
  });
}

function closeConfirm(result) {
  overlay.classList.remove("active");
  resolver?.(result);
  resolver = null;
}

export function confirmAlert({ title, text, confirmLabel = "Confirmar" }) {
  createConfirm();

  titleEl.textContent = title;
  textEl.textContent = text;
  confirmBtn.textContent = confirmLabel;
  overlay.classList.add("active");

  return new Promise(resolve => {
    resolver = resolve;
  });
}