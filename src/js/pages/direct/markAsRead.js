import {
    collection,
    query,
    where,
    getDocs,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db, auth } from "../../../config/config.js";

export async function markMessagesAsRead(chatId, otherUserId) {
    try {
        const messagesRef = collection(db, "chats", chatId, "messages");

        const q = query(
            messagesRef,
            where("sender", "==", otherUserId)
        );

        const snapshot = await getDocs(q);

        const updates = [];

        snapshot.forEach((message) => {
            if (message.data().read !== true) {
                updates.push(
                    updateDoc(message.ref, {
                        read: true,
                        readAt: serverTimestamp()
                    })
                );
            }
        });

        await Promise.all(updates);

    } catch (error) {
    }
}