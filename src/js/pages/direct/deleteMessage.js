import { db } from "../../../config/config.js";

import {
    doc,
    deleteDoc,
    updateDoc,
    collection,
    query,
    orderBy,
    limit,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function deleteMessage(chatId, messageId) {
    if (!chatId || !messageId) {
        return;
    }

    try {
        const messagesRef = collection(
            db,
            "chats",
            chatId,
            "messages"
        );

        const lastMessageQuery = query(
            messagesRef,
            orderBy("timestamp", "desc"),
            limit(1)
        );

        const lastSnap = await getDocs(lastMessageQuery);

        const isLastMessage =
            !lastSnap.empty &&
            lastSnap.docs[0].id === messageId;

        const messageRef = doc(
            db,
            "chats",
            chatId,
            "messages",
            messageId
        );

        await deleteDoc(messageRef);

        if (isLastMessage) {
            const chatRef = doc(db, "chats", chatId);

            await updateDoc(chatRef, {
                lastMessage: "Mensagem apagada"
            });
        }
    } catch (error) {
        console.error("Erro ao apagar mensagem:", error);
    }
}