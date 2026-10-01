import { db } from "./firebase.js";
import { doc, getDoc, setDoc } from "./firestore.js";
import { state } from "./state.js";

export async function startChat(targetId) {
  const participants = [state.currentUserId, targetId].sort();
  const chatId = `chat-${participants.join("-")}`;
  const chatRef = doc(db, "chats", chatId);
  const chat = await getDoc(chatRef);

  if (!chat.exists()) {
    await setDoc(chatRef, {
      participants,
      createdAt: new Date(),
      lastMessage: "",
      lastMessageTime: null,
    });
  }

  location.href = `direct.html?chatid=${chatId}`;
}
