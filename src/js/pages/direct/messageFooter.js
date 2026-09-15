import { auth } from "../../../config/config.js";


function getMessageStatus(timestamp, read) {

    const date = timestamp.toDate();
    const now = new Date();

    const seconds = Math.floor(
        (now - date) / 1000
    );

    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    let time;

    if (minutes < 1) {
        time = "agora";
    } else if (minutes < 60) {
        time = `há ${minutes} min`;
    } else if (hours < 24) {
        time = `há ${hours} horas`;
    } else {
        time = `há ${days} dias`;
    }

    return read ? `visto ${time}` : `enviado ${time}`;
}


export function renderMessages(messages) {

    const messagesList = document.getElementById("dmMessages");

    if (!messagesList) return;

    messagesList.innerHTML = "";

    const currentUserId = auth.currentUser?.uid;

    let currentBox = null;
    let currentSender = null;

    const lastMessageId = messages[messages.length - 1]?.id;

    const chatIsOpen =
        document.querySelector(".dm-chat-area")?.classList.contains("active");

    messages.forEach(function(message) {

        const isMine = message.sender === currentUserId;

        const bubble = document.createElement("div");

        if (message.sender !== currentSender) {

            currentBox = document.createElement("div");

            currentBox.className = isMine
                ? "box mine"
                : "box their";

            messagesList.appendChild(currentBox);

            currentSender = message.sender;
        }

        bubble.className = isMine
            ? "msg-beta-mine"
            : "msg-beta";

        bubble.textContent = message.content;

        currentBox.appendChild(bubble);


        if (
            isMine &&
            message.id === lastMessageId &&
            chatIsOpen
        ) {

            const status = document.createElement("div");

            status.className = "message-status";

            status.textContent = getMessageStatus(
                message.timestamp,
                message.read
            );

            currentBox.appendChild(status);
        }



    });

    messagesList.scrollTop = messagesList.scrollHeight;
}