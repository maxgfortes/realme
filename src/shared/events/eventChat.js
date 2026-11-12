import { t } from "/src/i18n/i18n.js";
import { app, auth, db } from "/src/config/config.js";
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    query,
    orderBy,
    limit,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { getUserSummary, peekUserSummary } from "/src/shared/userSummary.js";

const functions = getFunctions(app, "us-central1");
const ensureEventChatCall = httpsCallable(functions, "ensureEventChat");

const MESSAGE_LIMIT = 80;
const DEFAULT_PHOTO = "/public/img/default.jpg";

const eventLayer = document.getElementById("eventLayer");
const area = document.getElementById("eventChatArea");
const openButton = document.getElementById("openEventChatBtn");
const closeButton = document.getElementById("closeChatBtn");
const list = document.getElementById("eventMessages");
const titleElement = area?.querySelector(".event-chat-title");
const goingElement = area?.querySelector(".event-chat-going");
const input = area?.querySelector(".eventMsgInput");
const sendButton = document.getElementById("eventSendBtn");
const inputArea = input?.closest(".input-area");

let chatId = null;
let unsubscribe = null;
let unsubscribeChat = null;
let session = 0;
let sending = false;
let canSend = false;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function isImage(message) {
    return message.type === "image" || (typeof message.content === "string" && /^https:\/\/i\.ibb\.co\//.test(message.content));
}

function setNotice(text) {
    list.innerHTML = `<div class="event-chat-notice">${escapeHTML(text)}</div>`;
}

function senderLabel(uid) {
    const summary = peekUserSummary(uid);

    return `
        <a class="event-chat-sender" href="/profile.html?uid=${encodeURIComponent(uid)}" data-sender="${escapeHTML(uid)}">
            <img src="${escapeHTML(summary?.photo || DEFAULT_PHOTO)}" alt="">
            <span>${escapeHTML((summary?.name || "").split(" ")[0] || t("common.user"))}</span>
        </a>
    `;
}

function bubble(message, mine) {
    if (isImage(message)) {
        return `<div class="${mine ? "msg-beta-image-mine" : "msg-beta-image"}"><img class="dm-image loaded" src="${escapeHTML(message.content)}" alt=""></div>`;
    }

    return `<div class="${mine ? "msg-beta-mine" : "msg-beta"}">${escapeHTML(message.content || "")}</div>`;
}

function render(messages) {
    const me = auth.currentUser?.uid;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;

    if (!messages.length) {
        setNotice(t("events.chatEmpty"));
        return;
    }

    let html = "";
    let currentSender = null;
    const unknown = new Set();

    messages.forEach(message => {
        const mine = message.sender === me;

        if (message.sender !== currentSender) {
            if (currentSender !== null) html += "</div>";
            html += `<div class="box ${mine ? "mine" : "their"}">`;
            if (!mine) {
                html += senderLabel(message.sender);
                if (!peekUserSummary(message.sender)) unknown.add(message.sender);
            }
            currentSender = message.sender;
        }

        html += bubble(message, mine);
    });

    html += "</div>";
    list.innerHTML = html;

    if (nearBottom || list.dataset.loaded !== chatId) {
        list.scrollTop = list.scrollHeight;
        list.dataset.loaded = chatId;
    }

    unknown.forEach(uid => {
        getUserSummary(uid).then(summary => {
            list.querySelectorAll(`[data-sender="${CSS.escape(uid)}"]`).forEach(label => {
                label.querySelector("img").src = summary.photo || DEFAULT_PHOTO;
                label.querySelector("span").textContent = (summary.name || "").split(" ")[0] || t("common.user");
            });
        });
    });
}

function markRead() {
    const me = auth.currentUser?.uid;
    if (!me || !chatId || !canSend) return;
    updateDoc(doc(db, "chats", chatId), { [`readBy.${me}`]: Date.now() }).catch(() => {});
}

function setComposerEnabled(enabled) {
    canSend = enabled;
    if (input) {
        input.disabled = !enabled;
        input.placeholder = enabled ? t("direct.mensagem") : t("events.chatLocked");
    }
    if (sendButton) sendButton.disabled = !enabled;
}

function stop() {
    session++;
    unsubscribe?.();
    unsubscribe = null;
    unsubscribeChat?.();
    unsubscribeChat = null;
    chatId = null;
}

async function start() {
    const eventId = eventLayer?.dataset.eventId;
    if (!eventId || !list) return;

    stop();
    const current = session;

    if (titleElement) titleElement.textContent = document.getElementById("eventLayerTitle")?.textContent || "";
    if (goingElement) goingElement.textContent = "";

    setComposerEnabled(false);
    list.innerHTML = `<div class="loading-gif-area"><img class="loading-gif" src="/public/img/loading.gif" alt=""></div>`;

    try {
        const { data } = await ensureEventChatCall({ eventId });
        if (current !== session) return;

        chatId = data.chatId;

        if (!data.member) {
            setNotice(t("events.chatJoinFirst"));
            return;
        }

        setComposerEnabled(true);

        unsubscribe = onSnapshot(
            query(collection(db, "chats", chatId, "messages"), orderBy("timestamp", "desc"), limit(MESSAGE_LIMIT)),
            snapshot => {
                if (current !== session) return;
                const messages = snapshot.docs
                    .map(messageDoc => ({ id: messageDoc.id, ...messageDoc.data({ serverTimestamps: "estimate" }) }))
                    .reverse();
                render(messages);
                markRead();
            },
            error => {
                console.error("Erro no chat do evento:", error);
                setNotice(t("events.chatError"));
            }
        );

        unsubscribeChat = onSnapshot(doc(db, "chats", chatId), snap => {
            if (current !== session || !goingElement) return;
            const count = (snap.data()?.participants || []).length;
            goingElement.innerHTML = `<span>${escapeHTML(t("dm.members", { count }))}</span><a href="/direct.html?chatid=${encodeURIComponent(chatId)}">${escapeHTML(t("events.openInDirect"))}</a>`;
        }, () => {});
    } catch (error) {
        console.error("Erro ao abrir chat do evento:", error);
        if (current === session) setNotice(t("events.chatError"));
    }
}

async function send() {
    const me = auth.currentUser?.uid;
    const content = input?.value.trim();

    if (!me || !chatId || !content || sending || !canSend) return;

    sending = true;
    input.value = "";
    inputArea?.classList.remove("has-text");

    try {
        await addDoc(collection(db, "chats", chatId, "messages"), {
            content,
            sender: me,
            read: false,
            timestamp: serverTimestamp()
        });

        await updateDoc(doc(db, "chats", chatId), {
            lastMessage: content,
            lastMessageTime: serverTimestamp(),
            lastSender: me,
            [`readBy.${me}`]: Date.now()
        });
    } catch (error) {
        console.error("Erro ao enviar no chat do evento:", error);
        input.value = content;
    } finally {
        sending = false;
    }
}

if (area && list) {
    openButton?.addEventListener("click", start);
    closeButton?.addEventListener("click", stop);
    document.getElementById("closeEventBtn")?.addEventListener("click", stop);

    sendButton?.addEventListener("click", send);

    input?.addEventListener("input", () => {
        inputArea?.classList.toggle("has-text", input.value.trim().length > 0);
    });

    input?.addEventListener("keydown", event => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    });
}
