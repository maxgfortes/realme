const textarea = document.getElementById("dmMsgInput");
const inputArea = document.querySelector(".input-area");
const dmMessages = document.getElementById("dmMessages");

textarea.addEventListener("input", () => {
    textarea.style.height = "42px";
    textarea.style.height = textarea.scrollHeight + "px";

    inputArea.style.height = Math.min(textarea.scrollHeight + 8, 120) + "px";
});