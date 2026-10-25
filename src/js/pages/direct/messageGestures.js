import { t } from "/src/i18n/i18n.js";
import { deleteMessage } from "./deleteMessage.js";
import { toggleHeartReaction } from "./reactMessage.js";
import { setReplyingTo } from "./replyState.js";

const LONG_PRESS_MS = 500;
const DOUBLE_TAP_MS = 300;
const SWIPE_THRESHOLD_PX = 70;
const SWIPE_MAX_DRAG_PX = 90;
const SWIPE_MAX_VERTICAL_PX = 40;
const MOVE_CANCEL_PX = 10;

const lastTapByBubble = new WeakMap();

export function attachMessageGestures(bubbleEl, message, options) {
    const { chatId, isMine, otherUserName } = options;

    let pointerStartX = 0;
    let pointerStartY = 0;
    let longPressTimer = null;
    let longPressTriggered = false;
    let dragging = false;

    bubbleEl.addEventListener("pointerdown", (event) => {
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        longPressTriggered = false;
        dragging = false;

        if (isMine) {
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                collapseAndDelete(bubbleEl, chatId, message.id);
            }, LONG_PRESS_MS);
        }
    });

    bubbleEl.addEventListener("pointermove", (event) => {
        const deltaX = event.clientX - pointerStartX;
        const deltaY = event.clientY - pointerStartY;

        if (
            Math.abs(deltaX) > MOVE_CANCEL_PX ||
            Math.abs(deltaY) > MOVE_CANCEL_PX
        ) {
            clearTimeout(longPressTimer);
        }

        if (
            deltaX > 0 &&
            Math.abs(deltaY) < SWIPE_MAX_VERTICAL_PX &&
            !longPressTriggered
        ) {
            dragging = true;

            const offset = Math.min(deltaX, SWIPE_MAX_DRAG_PX);

            bubbleEl.style.transition = "none";
            bubbleEl.style.transform = `translateX(${offset}px)`;
        }
    });

    bubbleEl.addEventListener("pointerup", (event) => {
        clearTimeout(longPressTimer);

        if (longPressTriggered) {
            return;
        }

        const deltaX = event.clientX - pointerStartX;
        const deltaY = event.clientY - pointerStartY;

        bubbleEl.style.transition = "transform 0.2s ease";
        bubbleEl.style.transform = "translateX(0)";

        if (
            dragging &&
            deltaX > SWIPE_THRESHOLD_PX &&
            Math.abs(deltaY) < SWIPE_MAX_VERTICAL_PX
        ) {
            setReplyingTo(message, isMine ? t("common.you") : otherUserName);
            return;
        }

        handleTapForReaction(bubbleEl, chatId, message);
    });

    bubbleEl.addEventListener("pointercancel", () => {
        clearTimeout(longPressTimer);
        bubbleEl.style.transition = "transform 0.2s ease";
        bubbleEl.style.transform = "translateX(0)";
    });

    if (isMine) {
        bubbleEl.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });
    }
}

function handleTapForReaction(bubbleEl, chatId, message) {
    const now = Date.now();
    const lastTap = lastTapByBubble.get(bubbleEl) || 0;

    if (now - lastTap < DOUBLE_TAP_MS) {
        lastTapByBubble.delete(bubbleEl);
        toggleHeartReaction(chatId, message);
        showHeartBurst(bubbleEl);
    } else {
        lastTapByBubble.set(bubbleEl, now);
    }
}

const HEART_SVG = '<svg class="dm-heart-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21Z"/></svg>';

function showHeartBurst(bubbleEl) {
    const heart = document.createElement("span");

    heart.className = "dm-heart-burst";
    heart.innerHTML = HEART_SVG;

    bubbleEl.appendChild(heart);

    requestAnimationFrame(() => heart.classList.add("show"));

    setTimeout(() => heart.remove(), 800);
}

function collapseAndDelete(bubbleEl, chatId, messageId) {
    const container = bubbleEl.closest(".box");

    const startHeight = bubbleEl.getBoundingClientRect().height;
    const computedStyle = getComputedStyle(bubbleEl);

    bubbleEl.style.overflow = "hidden";
    bubbleEl.style.height = `${startHeight}px`;
    bubbleEl.style.marginTop = computedStyle.marginTop;
    bubbleEl.style.marginBottom = computedStyle.marginBottom;
    
    void bubbleEl.offsetHeight;

    bubbleEl.style.transition =
        "height 0.2s ease, margin 0.2s ease, opacity 0.2s ease";
    bubbleEl.style.opacity = "0";

    requestAnimationFrame(() => {
        bubbleEl.style.height = "0px";
        bubbleEl.style.marginTop = "0px";
        bubbleEl.style.marginBottom = "0px";
    });

    bubbleEl.addEventListener("transitionend", function onEnd(event) {
        if (event.propertyName !== "height") {
            return;
        }

        bubbleEl.removeEventListener("transitionend", onEnd);
        bubbleEl.remove();

        if (container && container.children.length === 0) {
            container.remove();
        }

        deleteMessage(chatId, messageId);
    });
}