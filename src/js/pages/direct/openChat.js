import { loadMessages } from "./loadMessages.js";
import { destroyMessages } from "./renderMessages.js";
import { setupTyping, stopTyping } from "./typing.js";
import { loadTyping, stopLoadingTyping } from "./showTyping.js";
import { markMessagesAsRead } from "./markAsRead.js";

const btnCloseChat = document.getElementById("dmBackBtn");

const chatArea = document.getElementById("dmChatArea");
const listPage = document.getElementById("listPage");

const chatheaderPfp = document.getElementById("dmChatUserImg");
const chatHeaderName = document.getElementById("dmChatUserName");

const chatFromUrl = new URLSearchParams(location.search).get("chatid");

export function openChat(user) {
    stopTyping();
    stopLoadingTyping();

    const userImg = user.querySelector(".user-pfp-area img");
    const userName = user.querySelector(".user-box-displayname");

    const chatId = user.dataset.chatId;
    const otherUserId = user.dataset.uid;
    const otherUserName = userName.textContent.trim();

    destroyMessages();

    chatArea.dataset.chatId = chatId;

    chatheaderPfp.src = userImg.src;

    chatHeaderName.innerHTML = "";

    const profileLink = document.createElement("a");

    profileLink.href = `/profile.html?uid=${otherUserId}`;

    profileLink.textContent = otherUserName;

    chatHeaderName.appendChild(profileLink);

    chatArea.classList.add("active");

    listPage.classList.add("active");

    loadMessages(chatId, otherUserName);
    markMessagesAsRead(chatId, otherUserId);
    setupTyping(chatId);
    loadTyping(chatId, otherUserId);
}

const OPEN_RETRY_MS = 100;
const OPEN_TIMEOUT_MS = 15000;

export function openChatById(chatId, startedAt = Date.now()) {
    if (!chatId) return;

    const user = document.querySelector(
        `.user-list-box[data-chat-id="${CSS.escape(chatId)}"]`
    );

    if (user) {
        openChat(user);
        return;
    }

    if (Date.now() - startedAt > OPEN_TIMEOUT_MS) return;

    setTimeout(() => openChatById(chatId, startedAt), OPEN_RETRY_MS);
}

function openChatFromUrl() {
    if (!chatFromUrl) return;

    openChatById(chatFromUrl);
}

openChatFromUrl();

function closeChat() {
    stopTyping();
    stopLoadingTyping();
    destroyMessages();

    chatArea.classList.remove("active");
    listPage.classList.remove("active");
}

btnCloseChat.addEventListener("click", closeChat);