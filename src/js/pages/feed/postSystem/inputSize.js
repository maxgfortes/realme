const textarea = document.getElementById("commentInput");
const inputArea = document.getElementById("commentInputArea");

textarea.addEventListener("input", () => {
    textarea.style.height = "42px";
    textarea.style.height = textarea.scrollHeight + "px";

    inputArea.style.height = Math.min(textarea.scrollHeight + 8, 120) + "px";
});