import { db } from "../../../config/config.js";

import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    getDocs,
    startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { renderMessages, appendMessages } from "./renderMessages.js";

let messages = [];
let oldestMessage = null;
let loadingMore = false;
let hasMoreMessages = true;
let renderedIds = new Set();
let isFirstLoad = true;
let currentChatId = null;
let currentOtherUserName = "";

export function loadMessages(chatId, otherUserName) {
    if (!chatId) return;

    messages = [];
    oldestMessage = null;
    loadingMore = false;
    hasMoreMessages = true;
    renderedIds = new Set();
    isFirstLoad = true;
    currentChatId = chatId;
    currentOtherUserName = otherUserName || "";

    const messagesRef = collection(db, "chats", chatId, "messages");

    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "desc"),
        limit(100)
    );

    onSnapshot(messagesQuery, (snapshot) => {
        const incoming = [];

        snapshot.forEach((doc) => {
            incoming.push({
                id: doc.id,
                ...doc.data()
            });
        });

        incoming.reverse();

        if (snapshot.docs.length > 0) {
            oldestMessage = snapshot.docs[snapshot.docs.length - 1];
        }
        hasMoreMessages = snapshot.size === 100;

        if (isFirstLoad) {
            messages = incoming;
            renderMessages(messages, chatId, currentOtherUserName);
            renderedIds = new Set(messages.map(m => m.id));
            isFirstLoad = false;
            setupScroll(chatId, currentOtherUserName);
            return;
        }

        const previousIds = new Set(messages.map(m => m.id));
        const added = incoming.filter(m => !previousIds.has(m.id));

        const isOnlyAppend =
            added.length > 0 &&
            added.length === (incoming.length - messages.length) &&
            incoming.slice(0, messages.length).every((m, i) => m.id === messages[i]?.id);

        if (isOnlyAppend) {
            appendMessages(added, chatId, currentOtherUserName);
            messages = incoming;
            added.forEach(m => renderedIds.add(m.id));
        } else {
            messages = incoming;
            renderMessages(messages, chatId, currentOtherUserName);
            renderedIds = new Set(messages.map(m => m.id));
        }
    });
}

async function loadMoreMessages(chatId, otherUserName) {
    if (loadingMore || !hasMoreMessages || !oldestMessage) return;

    const messagesList = document.getElementById("dmMessages");
    if (!messagesList) return;

    loadingMore = true;

    const oldHeight = messagesList.scrollHeight;
    const oldTop = messagesList.scrollTop;

    const messagesRef = collection(db, "chats", chatId, "messages");

    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "desc"),
        startAfter(oldestMessage),
        limit(100)
    );

    try {
        const snapshot = await getDocs(messagesQuery);

        const olderMessages = [];
        snapshot.forEach((doc) => {
            olderMessages.push({
                id: doc.id,
                ...doc.data()
            });
        });

        olderMessages.reverse();

        messages = [...olderMessages, ...messages];

        if (snapshot.size < 100) {
            hasMoreMessages = false;
        }

        if (snapshot.docs.length > 0) {
            oldestMessage = snapshot.docs[snapshot.docs.length - 1];
        }

        renderMessages(messages, chatId, otherUserName);
        renderedIds = new Set(messages.map(m => m.id));

        requestAnimationFrame(() => {
            const newHeight = messagesList.scrollHeight;
            messagesList.scrollTop = oldTop + (newHeight - oldHeight);
        });

    } catch (error) {
        console.error("Erro ao carregar mais mensagens:", error);
    }

    loadingMore = false;
}

function setupScroll(chatId, otherUserName) {
    const messagesList = document.getElementById("dmMessages");
    if (!messagesList) return;

    messagesList.onscroll = function () {
        if (messagesList.scrollTop <= 140) {
            loadMoreMessages(chatId, otherUserName);
        }
    };
}