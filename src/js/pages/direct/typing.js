import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { db, auth } from "../../../config/config.js";

let typingTimeout = null;
let typingListener = null;

export function setupTyping(chatId) {
    const textarea = document.getElementById("dmMsgInput");

    if (!textarea || !chatId) {
        return;
    }

    if (typingListener) {
        textarea.removeEventListener(
            "input",
            typingListener
        );
    }

    clearTimeout(typingTimeout);

    typingListener = async function () {
        const uid = auth.currentUser?.uid;

        if (!uid) {
            return;
        }

        clearTimeout(typingTimeout);

        const chatRef =
            doc(db, "chats", chatId);

        const isTyping =
            textarea.value.trim().length > 0;

        try {
            await updateDoc(chatRef, {
                [`typing.${uid}`]: isTyping
            });
        } catch (error) {
            return;
        }

        if (!isTyping) {
            return;
        }

        typingTimeout = setTimeout(
            async function () {
                try {
                    await updateDoc(chatRef, {
                        [`typing.${uid}`]: false
                    });
                } catch (error) {
                    console.error(
                        "Erro ao parar typing:",
                        error
                    );
                }
            },
            1500
        );
    };

    textarea.addEventListener(
        "input",
        typingListener
    );
}

export function stopTyping() {
    const textarea = document.getElementById("dmMsgInput");

    if (typingListener && textarea) {
        textarea.removeEventListener(
            "input",
            typingListener
        );
    }

    typingListener = null;

    clearTimeout(typingTimeout);
    typingTimeout = null;

    const uid = auth.currentUser?.uid;

    const chatArea = document.getElementById("dmChatArea");

    const chatId = chatArea?.dataset.chatId;

    if (!uid || !chatId) {
        return;
    }

    const chatRef =
        doc(db, "chats", chatId);

    updateDoc(chatRef, {
        [`typing.${uid}`]: false
    }).catch(function (error) {
        console.error(
            "Erro ao limpar typing:",
            error
        );
    });
}