import { t } from "/src/i18n/i18n.js";
import { getDaySeparatorLabel } from "/src/js/pages/direct/formatRelativeTime.js";
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
import { getActiveEvent } from "./loadEvent.js";

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
let unsubscribeGoing = null;
let goingToken = 0;
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

function firstName(uid) {
    const summary = peekUserSummary(uid);
    return (summary?.name || "").split(" ")[0] || t("common.user");
}

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function dayKey(date) {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function bubble(message, mine) {
    if (isImage(message)) {
        return `<div class="${mine ? "msg-beta-image-mine" : "msg-beta-image"}"><img class="dm-image loaded" src="${escapeHTML(message.content)}" alt="" loading="lazy"></div>`;
    }

    return `<div class="${mine ? "msg-beta-mine" : "msg-beta"}">${escapeHTML(message.content || "")}</div>`;
}

function groupHTML(group, me) {
    const mine = group.sender === me;
    const bubbles = group.messages.map(message => bubble(message, mine)).join("");

    if (mine) return `<div class="box mine">${bubbles}</div>`;

    const summary = peekUserSummary(group.sender);

    return `
        <div class="box their group-their" data-sender="${escapeHTML(group.sender)}">
            <a class="group-sender" href="/profile.html?uid=${encodeURIComponent(group.sender)}">
                <img src="${escapeHTML(summary?.photo || DEFAULT_PHOTO)}" alt="">
                <span>${escapeHTML(firstName(group.sender))}</span>
            </a>
            ${bubbles}
        </div>
    `;
}

function render(messages) {
    const me = auth.currentUser?.uid;
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;

    if (!messages.length) {
        list.innerHTML = `
            <div class="ec-empty">
                <div class="ec-empty-title">${escapeHTML(t("events.chatEmptyTitle"))}</div>
                <div class="ec-empty-text">${escapeHTML(t("events.chatEmpty"))}</div>
            </div>
        `;
        return;
    }

    let html = "";
    let group = null;
    let lastDay = "";
    const unknown = new Set();

    const flush = () => {
        if (group) html += groupHTML(group, me);
        group = null;
    };

    messages.forEach(message => {
        const date = toDate(message.timestamp) || new Date();
        const key = dayKey(date);

        if (key !== lastDay) {
            flush();
            html += `<div class="dm-day-separator"><span>${escapeHTML(getDaySeparatorLabel(date))}</span></div>`;
            lastDay = key;
        }

        if (message.type === "system") {
            flush();
            html += `<div class="dm-system">${escapeHTML(message.content || "")}</div>`;
            return;
        }

        if (!group || group.sender !== message.sender) {
            flush();
            group = { sender: message.sender, messages: [] };
            if (message.sender !== me && !peekUserSummary(message.sender)) unknown.add(message.sender);
        }

        group.messages.push(message);
    });

    flush();
    list.innerHTML = html;

    if (nearBottom || list.dataset.loaded !== chatId) {
        list.scrollTop = list.scrollHeight;
        list.dataset.loaded = chatId;
    }

    unknown.forEach(uid => {
        getUserSummary(uid).then(summary => {
            list.querySelectorAll(`.box[data-sender="${CSS.escape(uid)}"] .group-sender`).forEach(label => {
                label.querySelector("img").src = summary.photo || DEFAULT_PHOTO;
                label.querySelector("span").textContent = (summary.name || "").split(" ")[0] || t("common.user");
            });
        });
    });
}

function goingText(names, total) {
    if (total === 1) return t("events.goingOne", { a: names[0] });
    if (total === 2) return t("events.goingTwo", { a: names[0], b: names[1] });
    return t("events.goingMany", { a: names[0], b: names[1], count: total - 2 });
}

async function renderGoing(uids, token) {
    if (!goingElement) return;

    const me = auth.currentUser?.uid;
    const ordered = [...uids].sort((a, b) => (a === me) - (b === me));

    if (!ordered.length) {
        goingElement.innerHTML = "";
        return;
    }

    const shown = ordered.slice(0, 3);
    const people = await Promise.all(shown.map(getUserSummary));

    if (token !== goingToken) return;

    const names = people.slice(0, 2).map(person => person.uid === me ? t("dm.you") : (person.name || "").split(" ")[0] || t("common.user"));

    goingElement.innerHTML = `
        <div class="ec-going-faces">
            ${people.map(person => `<img src="${escapeHTML(person.photo || DEFAULT_PHOTO)}" alt="">`).join("")}
        </div>
        <div class="ec-going-text">${escapeHTML(goingText(names, ordered.length))}</div>
        <a class="ec-going-direct" href="/direct.html?chatid=${encodeURIComponent(chatId || "")}" aria-label="${escapeHTML(t("events.openInDirect"))}">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13.973 20.046 21.77 6.928C22.8 5.195 21.55 3 19.535 3H4.466C2.138 3 .984 5.825 2.646 7.456l4.842 4.752 1.723 7.121c.548 2.266 3.571 2.721 4.762.717Z"/><path d="M7.488 12.208 15.515 7.641" stroke-linecap="round"/></svg>
        </a>
    `;
}

function watchGoing(eventId) {
    unsubscribeGoing?.();
    const token = ++goingToken;

    unsubscribeGoing = onSnapshot(collection(db, "events", eventId, "going"), snapshot => {
        const uids = new Set(snapshot.docs.map(goingDoc => goingDoc.id));
        const creatorId = getActiveEvent()?.data?.creatorId;
        if (creatorId) uids.add(creatorId);
        renderGoing(uids, token);
    }, () => {});
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
    unsubscribeGoing?.();
    unsubscribeGoing = null;
    goingToken++;
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

        watchGoing(eventId);

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
