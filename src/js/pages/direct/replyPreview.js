import { onReplyChange, clearReplyingTo } from "./replyState.js";

const REPLY_PREVIEW_ID = "dmReplyPreview";
const INPUT_ID = "dmMsgInput";

function buildPreviewBar() {
    const bar = document.createElement("div");

    bar.id = REPLY_PREVIEW_ID;
    bar.className = "dm-reply-preview";

    bar.innerHTML = `
        <div class="dm-reply-preview-info">
            <span class="dm-reply-preview-sender"></span>
            <span class="dm-reply-preview-text"></span>
        </div>
        <button type="button" class="dm-reply-preview-close" aria-label="Cancelar resposta">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </button>
    `;

    bar.querySelector(".dm-reply-preview-close").addEventListener(
        "click",
        () => clearReplyingTo()
    );

    return bar;
}

let initialized = false;

export function initReplyPreview() {
    if (initialized) {
        return;
    }

    const input = document.getElementById(INPUT_ID);

    if (!input) {
        return;
    }

    initialized = true;

    const anchor = input.closest("form") || input.parentElement;

    onReplyChange((reply) => {
        let bar = document.getElementById(REPLY_PREVIEW_ID);

        if (!reply) {
            if (bar) {
                bar.remove();
            }
            return;
        }

        if (!bar) {
            bar = buildPreviewBar();
            anchor.parentElement.insertBefore(bar, anchor);
        }

        bar.querySelector(".dm-reply-preview-sender").textContent = `Respondendo ${reply.senderName}`;

        bar.querySelector(".dm-reply-preview-text").textContent = reply.content;
    });
}