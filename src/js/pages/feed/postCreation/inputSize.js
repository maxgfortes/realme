const textarea = document.getElementById("npTextInput");
const inputArea = document.getElementById("inputArea");

textarea.addEventListener("input", () => {
    textarea.style.height = "42px";
    textarea.style.height = textarea.scrollHeight + "px";

    inputArea.style.height = Math.min(textarea.scrollHeight + 8, 120) + "px";
});