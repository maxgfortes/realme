const textarea = document.getElementById("dmMsgInput");
const inputArea = document.querySelector(".input-area");
const dmMessages = document.getElementById("dmMessages");

function syncInput() {
    textarea.style.height = "42px";
    textarea.style.height = textarea.scrollHeight + "px";

    inputArea.style.height = Math.min(textarea.scrollHeight + 8, 120) + "px";
    inputArea.classList.toggle("has-text", textarea.value.trim().length > 0);
}

textarea.addEventListener("input", syncInput);
syncInput();