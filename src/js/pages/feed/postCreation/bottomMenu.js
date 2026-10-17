
export function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function setupBottomMenu({ trigger, content, onOpen, onConfirm, onCancel, onClose }) {
    const area = content?.closest(".bottom-menu-area");

    if (!trigger || !area) {
        console.warn("bottomMenu: botão ou menu não encontrado nesta página.");
        return null;
    }

    const overlay = area.querySelector(".bottom-menu-overlay");
    const menu = area.querySelector(".bottom-menu");
    const confirmButton = area.querySelector(".bottom-btn:not(.cancel)");
    const cancelButton = area.querySelector(".bottom-btn.cancel");

    let closeTimer = null;

    function open() {
        clearTimeout(closeTimer);

        area.classList.add("active");
        overlay?.classList.add("active");
        menu?.classList.add("active");

        onOpen?.();
    }

    function close() {
        menu?.classList.remove("active");
        overlay?.classList.remove("active");

        closeTimer = setTimeout(() => area.classList.remove("active"), 300);

        onClose?.();
    }

    trigger.addEventListener("click", open);

    overlay?.addEventListener("click", () => {
        onCancel?.();
        close();
    });

    cancelButton?.addEventListener("click", () => {
        onCancel?.();
        close();
    });

    confirmButton?.addEventListener("click", () => {
        onConfirm?.();
        close();
    });

    return { open, close };
}