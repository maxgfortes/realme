import { db, auth } from "../../../config/config.js";

import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    getDocs,
    startAfter,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { renderMessages } from "./renderMessages.js";

const PAGE_SIZE = 100;

let latestMessages = [];
let olderMessages = [];
let oldestMessage = null;
let loadingMore = false;
let hasMoreMessages = true;
let activeChatId = null;
let unsubscribeMessages = null;
let latestDocs = [];

const pendingReads = new Set();

function isActive(chatId) {
    return chatId === activeChatId;
}

function allMessages() {
    return [...olderMessages, ...latestMessages];
}

function chatIsVisible(chatId) {
    const chatArea = document.getElementById("dmChatArea");

    return (
        isActive(chatId) &&
        document.visibilityState === "visible" &&
        chatArea?.classList.contains("active") &&
        chatArea.dataset.chatId === chatId
    );
}

function markIncomingAsRead(chatId) {
    const myUid = auth.currentUser?.uid;

    if (!myUid || !chatIsVisible(chatId)) return;

    latestDocs.forEach(function(messageDoc) {
        const data = messageDoc.data();

        if (data.sender === myUid || data.read === true) return;
        if (pendingReads.has(messageDoc.id)) return;

        pendingReads.add(messageDoc.id);

        updateDoc(messageDoc.ref, {
            read: true,
            readAt: serverTimestamp()
        })
            .catch(function(error) {
                console.error("Erro ao marcar mensagem como lida:", error);
            })
            .finally(function() {
                pendingReads.delete(messageDoc.id);
            });
    });
}

export function stopMessages() {
    unsubscribeMessages?.();
    unsubscribeMessages = null;
    activeChatId = null;
    latestDocs = [];
    latestMessages = [];
    olderMessages = [];
    oldestMessage = null;
    loadingMore = false;
    hasMoreMessages = true;

    const messagesList = document.getElementById("dmMessages");

    if (messagesList) {
        messagesList.onscroll = null;
    }
}

export function loadMessages(chatId, otherUserName) {

    if (!chatId) {
        return;
    }

    stopMessages();

    activeChatId = chatId;

    const messagesQuery = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "desc"),
        limit(PAGE_SIZE)
    );

    unsubscribeMessages = onSnapshot(
        messagesQuery,
        function(snapshot) {

            if (!isActive(chatId)) {
                return;
            }

            latestDocs = snapshot.docs;

            const nextLatest = snapshot.docs.map(function(messageDoc) {
                return {
                    id: messageDoc.id,
                    ...messageDoc.data()
                };
            }).reverse();

            if (snapshot.size === PAGE_SIZE && nextLatest.length) {
                const nextIds = new Set(nextLatest.map(function(message) { return message.id; }));
                const windowStart = nextLatest[0].timestamp?.toMillis?.() ?? 0;

                const dropped = latestMessages.filter(function(message) {
                    return !nextIds.has(message.id) &&
                        (message.timestamp?.toMillis?.() ?? Infinity) <= windowStart;
                });

                olderMessages = [...olderMessages, ...dropped];
            }

            latestMessages = nextLatest;

            if (!olderMessages.length && snapshot.docs.length > 0) {
                oldestMessage = snapshot.docs[snapshot.docs.length - 1];
                hasMoreMessages = snapshot.size === PAGE_SIZE;
            }

            renderMessages(allMessages(), chatId, otherUserName);

            setupScroll(chatId, otherUserName);

            markIncomingAsRead(chatId);

        },
        function(error) {
            console.error("Erro ao carregar mensagens:", error);
        }
    );
}

async function loadMoreMessages(chatId, otherUserName) {

    if (
        !isActive(chatId) ||
        loadingMore ||
        !hasMoreMessages ||
        !oldestMessage
    ) {
        return;
    }

    const messagesList =
        document.getElementById("dmMessages");

    if (!messagesList) {
        return;
    }

    loadingMore = true;

    const oldHeight = messagesList.scrollHeight;
    const oldTop = messagesList.scrollTop;

    const messagesQuery = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "desc"),
        startAfter(oldestMessage),
        limit(PAGE_SIZE)
    );

    try {

        const snapshot = await getDocs(messagesQuery);

        if (!isActive(chatId)) {
            return;
        }

        const page = snapshot.docs.map(function(messageDoc) {
            return {
                id: messageDoc.id,
                ...messageDoc.data()
            };
        }).reverse();

        olderMessages = [...page, ...olderMessages];

        if (snapshot.size < PAGE_SIZE) {
            hasMoreMessages = false;
        }

        if (snapshot.docs.length > 0) {
            oldestMessage = snapshot.docs[snapshot.docs.length - 1];
        }

        renderMessages(allMessages(), chatId, otherUserName);

        requestAnimationFrame(function() {
            messagesList.scrollTop =
                oldTop + (messagesList.scrollHeight - oldHeight);
        });

    } catch (error) {

        console.error("Erro ao carregar mais mensagens:", error);

    } finally {

        loadingMore = false;

    }
}

function setupScroll(chatId, otherUserName) {

    const messagesList =
        document.getElementById("dmMessages");

    if (!messagesList) {
        return;
    }

    messagesList.onscroll = function() {

        if (messagesList.scrollTop <= 140) {
            loadMoreMessages(chatId, otherUserName);
        }

    };
}

document.addEventListener("visibilitychange", function() {
    if (activeChatId) markIncomingAsRead(activeChatId);
});
