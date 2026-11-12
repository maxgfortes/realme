import { loadMessages, stopMessages } from "./loadMessages.js";
import { destroyMessages } from "./renderMessages.js";
import { setupTyping, stopTyping } from "./typing.js";
import { loadTyping, stopLoadingTyping } from "./showTyping.js";
import { markMessagesAsRead, markGroupRead } from "./markAsRead.js";
import { t } from "/src/i18n/i18n.js";

const btnCloseChat = document.getElementById("dmBackBtn");

const chatArea = document.getElementById("dmChatArea");
const listPage = document.getElementById("listPage");

const chatheaderPfp = document.getElementById("dmChatUserImg");
const chatHeaderName = document.getElementById("dmChatUserName");

const chatFromUrl = new URLSearchParams(location.search).get("chatid");

export function openChat(user) {
    stopTyping();
    stopLoadingTyping();

    if (user.dataset.group === "1") {
        openGroupChat(user);
        return;
    }

    delete chatArea.dataset.group;
    document.getElementById("dmGroupInfoBtn")?.setAttribute("hidden", "");

    const userImg = user.querySelector(".user-pfp-area img");
    const userName = user.querySelector(".user-box-displayname");

    const chatId = user.dataset.chatId;
    const otherUserId = user.dataset.uid;
    const otherUserName = userName.textContent.trim();

    destroyMessages();

    chatArea.dataset.chatId = chatId;

    chatheaderPfp.src = userImg.src;
    chatheaderPfp.parentElement.dataset.presenceUid = otherUserId;

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

function openGroupChat(item) {
    const chatId = item.dataset.chatId;
    const name = item.querySelector(".user-box-displayname")?.textContent.trim() || t("dm.group");
    const photo = item.dataset.photo || item.querySelector(".user-pfp-area img")?.src || "./public/img/default.jpg";

    destroyMessages();

    chatArea.dataset.chatId = chatId;
    chatArea.dataset.group = "1";

    chatheaderPfp.src = photo;
    delete chatheaderPfp.parentElement.dataset.presenceUid;
    chatheaderPfp.parentElement.querySelector(".presence-dot")?.remove();

    chatHeaderName.innerHTML = "";

    const title = document.createElement("span");
    title.className = "dm-group-title";
    title.textContent = name;

    const subtitle = document.createElement("span");
    subtitle.className = "dm-group-subtitle";
    subtitle.textContent = item.dataset.event === "1"
        ? t("dm.eventGroup", { count: Number(item.dataset.members) || 0 })
        : t("dm.members", { count: Number(item.dataset.members) || 0 });

    chatHeaderName.append(title, subtitle);

    const infoButton = document.getElementById("dmGroupInfoBtn");
    infoButton?.removeAttribute("hidden");

    chatArea.classList.add("active");
    listPage.classList.add("active");

    loadMessages(chatId, name);
    markGroupRead(chatId);
    setupTyping(chatId);
    loadTyping(chatId, null);
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
    stopMessages();
    destroyMessages();
    delete chatArea.dataset.chatId;
    delete chatArea.dataset.group;

    chatArea.classList.remove("active");
    listPage.classList.remove("active");
}

export function closeActiveChat() {
    closeChat();
}

btnCloseChat.addEventListener("click", closeChat);