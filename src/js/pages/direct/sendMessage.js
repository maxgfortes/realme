import {
    collection,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "../../../config/config.js";
import { consumeReplyingTo } from "./replyState.js";

const input = document.getElementById("dmMsgInput");
const sendBtn = document.getElementById("dmSendBtn");
const chatArea = document.getElementById("dmChatArea");

export async function sendMessage() {
    const chatId = chatArea.dataset.chatId;

    if (!chatId) {
        return;
    }

    const content = input.value.trim();

    if (!content) return;

    const user = auth.currentUser;

    if (!user) {
        return;
    }

    try {
        const messagesRef = collection(
            db,
            "chats",
            chatId,
            "messages"
        );

        const replyTo = consumeReplyingTo();

        const messageData = {
            content: content,
            sender: user.uid,
            read: false,
            timestamp: serverTimestamp()
        };

        if (replyTo) {
            messageData.replyTo = {
                id: replyTo.id,
                content: replyTo.content,
                sender: replyTo.sender,
                senderName: replyTo.senderName,
                type: replyTo.type
            };
        }

        await addDoc(messagesRef, messageData);

        await updateDoc(
            doc(db, "chats", chatId),
            {
                lastMessage: content,
                lastMessageTime: serverTimestamp()
            }
        );

        input.value = "";
        input.dispatchEvent(new Event("input"));

    } catch (error) {
    }
}

sendBtn.addEventListener("click", sendMessage);