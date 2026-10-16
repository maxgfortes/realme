import { auth, db } from "/src/config/config.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function startChat(targetId) {
  const myId = auth.currentUser?.uid;
  if (!myId || !targetId || myId === targetId) return;

  const participants = [myId, targetId].sort();
  const chatId = `chat-${participants.join("-")}`;
  const chatRef = doc(db, "chats", chatId);

try {
  console.log("1) lendo chat", chatId, "uid:", myId);
  const chat = await getDoc(chatRef);
  console.log("2) leitura ok, existe?", chat.exists());

  if (!chat.exists()) {
    await setDoc(chatRef, {
      participants,
      createdAt: new Date(),
      lastMessage: "",
      lastMessageTime: null,
    });
    console.log("3) chat criado");
  }
  location.href = `direct.html?chatid=${chatId}`;
} catch (err) {
  console.error("startChat error:", err);
}
}