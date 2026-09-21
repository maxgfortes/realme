import {
    doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "../../../config/config.js";

let typingUnsubscribe = null;
let hideTimeout = null;

export function loadTyping(chatId, otherUserId) {
    if (!chatId || !otherUserId) {
        return;
    }

    stopLoadingTyping();

    const chatRef = doc(db, "chats", chatId);

    typingUnsubscribe = onSnapshot(
        chatRef,
        function (snapshot) {
            const data = snapshot.data();

            const isTyping = data?.typing?.[otherUserId] === true;

            if (isTyping) {
                showTyping();
            } else {
                hideTyping();
            }
        },
        function (error) {
            console.error("Erro ao observar typing:", error);
        }
    );
}

export function stopLoadingTyping() {
    if (typingUnsubscribe) {
        typingUnsubscribe();
        typingUnsubscribe = null;
    }

    hideTyping(true);
}

function isNearBottom(messagesList) {
    return (
        messagesList.scrollHeight -
            messagesList.scrollTop -
            messagesList.clientHeight <
        120
    );
}

function buildTypingArea() {
    const area = document.createElement("div");
    area.className = "typing-area";

    const inner = document.createElement("div");
    inner.className = "typing-area-inner";

    const bubble = document.createElement("div");
    bubble.className = "typing-bubble";

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement("div");
        dot.className = "typing-dot";
        bubble.appendChild(dot);
    }

    inner.appendChild(bubble);
    area.appendChild(inner);

    return area;
}

function showTyping() {
    const messagesList = document.getElementById("dmMessages");

    if (!messagesList) {
        return;
    }

    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    const existing = messagesList.querySelector(".typing-area");

    if (existing) {

        existing.classList.add("show");
        return;
    }

    const area = buildTypingArea();
    const stick = isNearBottom(messagesList);

    messagesList.appendChild(area);

    requestAnimationFrame(function () {
        area.classList.add("show");

        if (stick) {
            messagesList.scrollTo({
                top: messagesList.scrollHeight,
                behavior: "smooth"
            });
        }
    });
}

function hideTyping(immediate) {
    const typing = document.querySelector(".typing-area");

    if (!typing) {
        return;
    }

    if (immediate) {
        typing.remove();
        return;
    }

    typing.classList.remove("show");

    if (hideTimeout) {
        clearTimeout(hideTimeout);
    }

    hideTimeout = setTimeout(function () {
        hideTimeout = null;

        if (!typing.classList.contains("show")) {
            typing.remove();
        }
    }, 260);
}