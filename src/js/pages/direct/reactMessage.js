import { db, auth } from "../../../config/config.js";

import {
    doc,
    updateDoc,
    deleteField
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function toggleHeartReaction(chatId, message) {
    if (!chatId || !message?.id || !auth.currentUser) {
        return;
    }

    const uid = auth.currentUser.uid;

    const messageRef = doc(
        db,
        "chats",
        chatId,
        "messages",
        message.id
    );

    const alreadyReacted =
        message.reactions?.[uid] === "❤️";

    try {
        if (alreadyReacted) {
            await updateDoc(messageRef, {
                [`reactions.${uid}`]: deleteField()
            });
        } else {
            await updateDoc(messageRef, {
                [`reactions.${uid}`]: "❤️"
            });
        }
    } catch (error) {
        console.error("Erro ao reagir na mensagem:", error);
    }
}