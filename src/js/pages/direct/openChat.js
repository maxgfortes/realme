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

function closeChat() {
    stopTyping();
    stopLoadingTyping();
    destroyMessages();

    chatArea.classList.remove("active");
    listPage.classList.remove("active");
}

btnCloseChat.addEventListener("click", closeChat);