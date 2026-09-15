import {
    doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "../../../config/config.js";

let typingUnsubscribe = null;

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

            const isTyping =
                data?.typing?.[otherUserId] === true;

            if (isTyping) {
                showTyping();
            } else {
                hideTyping();
            }
        },
        function (error) {
            console.error(
                "Erro ao observar typing:",
                error
            );
        }
    );
}

export function stopLoadingTyping() {
    if (typingUnsubscribe) {
        typingUnsubscribe();
        typingUnsubscribe = null;
    }

    hideTyping();
}

function showTyping() {
    const messagesList = document.getElementById("dmMessages");

    if (!messagesList) {
        return;
    }

    if (messagesList.querySelector(".typing-area")) {
        return;
    }

    const area = document.createElement("div");
    area.className = "typing-area";

    const bubble = document.createElement("div");
    bubble.className = "typing-bubble";

    for (let i = 0; i < 3; i++) {
        const dot = document.createElement("div");
        dot.className = "typing-dot";
        bubble.appendChild(dot);
    }

    area.appendChild(bubble);
    messagesList.appendChild(area);

    messagesList.scrollTop = messagesList.scrollHeight;
}

function hideTyping() {
    const typing = document.querySelector(".typing-area");

    if (!typing) {
        return;
    }

    typing.remove();
}