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

import { renderMessages } from "./renderMessages.js";


let messages = [];
let oldestMessage = null;
let loadingMore = false;
let hasMoreMessages = true;


export function loadMessages(chatId, otherUserName) {

    if (!chatId) {
        return;
    }

    messages = [];
    oldestMessage = null;
    loadingMore = false;
    hasMoreMessages = true;


    const messagesRef = collection(
        db,
        "chats",
        chatId,
        "messages"
    );


    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "desc"),
        limit(100)
    );


    onSnapshot(
        messagesQuery,
        function(snapshot) {

            messages = [];


            snapshot.forEach(function(messageDoc) {

                messages.push({
                    id: messageDoc.id,
                    ...messageDoc.data()
                });

            });


            messages.reverse();


            if (snapshot.docs.length > 0) {

                oldestMessage =
                    snapshot.docs[snapshot.docs.length - 1];

            }


            hasMoreMessages = snapshot.size === 100;

            renderMessages(messages, chatId, otherUserName);

            setupScroll(chatId, otherUserName);

        }
    );
}


async function loadMoreMessages(chatId, otherUserName) {

    if (
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


    const oldHeight =
        messagesList.scrollHeight;

    const oldTop =
        messagesList.scrollTop;


    const messagesRef = collection(
        db,
        "chats",
        chatId,
        "messages"
    );


    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "desc"),
        startAfter(oldestMessage),
        limit(100)
    );


    try {

        const snapshot =
            await getDocs(messagesQuery);


        const olderMessages = [];


        snapshot.forEach(function(messageDoc) {

            olderMessages.push({
                id: messageDoc.id,
                ...messageDoc.data()
            });

        });


        olderMessages.reverse();


        messages = [
            ...olderMessages,
            ...messages
        ];


        if (snapshot.size < 100) {

            hasMoreMessages = false;

        }


        if (snapshot.docs.length > 0) {

            oldestMessage =
                snapshot.docs[snapshot.docs.length - 1];

        }


        renderMessages(messages, chatId, otherUserName);


        requestAnimationFrame(function() {

            const newHeight =
                messagesList.scrollHeight;


            messagesList.scrollTop =
                oldTop + (newHeight - oldHeight);

        });


    } catch (error) {

        console.error(
            "Erro ao carregar mais mensagens:",
            error
        );

    }


    loadingMore = false;
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