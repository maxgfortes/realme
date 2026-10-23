import { t } from "/src/i18n/i18n.js";
import {
    doc,
    collection,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { auth, db } from "../../../config/config.js";
import { formatTimeAgo } from "./formatRelativeTime.js";

const CLOSE_MS = 300;

const area = document.getElementById("viewNoteArea");
const overlay = document.getElementById("viewNoteOverlay");
const modal = document.getElementById("viewNoteModal");
const pfp = document.getElementById("noteModalPfp");
const nameElement = document.getElementById("noteContentName");
const textElement = document.getElementById("noteContentText");
const timeElement = document.getElementById("noteContentTime");
const form = document.getElementById("replyNoteForm");
const input = document.getElementById("replyNoteInput");
const sendButton = document.getElementById("replyNoteBtn");

let currentNote = null;
let closeTimer = null;
let sending = false;

function firstName(fullName) {
    return String(fullName || "").trim().split(/\s+/)[0] || "";
}

function toDate(value) {
    if (!value) return null;
    if (value.toDate) return value.toDate();

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function updateSendState() {
    if (!sendButton || !input) return;

    sendButton.disabled = sending || !input.value.trim();
}

export function openNoteView(note) {
    if (!area || !note?.uid) return;

    clearTimeout(closeTimer);

    currentNote = note;

    pfp.src = note.photo || "../public/img/default.jpg";
    nameElement.textContent = note.name || t("common.user");
    textElement.textContent = note.content || "";

    const createdAt = toDate(note.createdAt);

    timeElement.textContent = createdAt ? formatTimeAgo(createdAt) : "";

    input.value = "";
    input.placeholder = t("dm.replyTo", { name: firstName(note.name) || t("dm.noteFallback") });
    updateSendState();

    area.classList.add("active");
    overlay?.classList.add("active");
    modal?.classList.add("active");
}

export function closeNoteView() {
    if (!area) return;

    input?.blur();
    overlay?.classList.remove("active");
    modal?.classList.remove("active");

    closeTimer = setTimeout(() => {
        area.classList.remove("active");
        currentNote = null;
    }, CLOSE_MS);
}

async function ensureChat(myUid, otherUid) {
    const participants = [myUid, otherUid].sort();
    const chatId = `chat-${participants.join("-")}`;
    const chatRef = doc(db, "chats", chatId);
    const chat = await getDoc(chatRef);

    if (!chat.exists()) {
        await setDoc(chatRef, {
            participants,
            createdAt: new Date(),
            lastMessage: "",
            lastMessageTime: null
        });
    }

    return { chatId, chatRef };
}

async function openReplyChat(chatId) {
    if (!document.getElementById("dmChatArea")) {
        location.href = `/direct.html?chatid=${encodeURIComponent(chatId)}`;
        return;
    }

    const { openChatById } = await import("./openChat.js");
    openChatById(chatId);
}

async function replyToNote() {
    const user = auth.currentUser;
    const note = currentNote;
    const content = input.value.trim();

    if (!user || !note || !content || sending || note.uid === user.uid) return;

    sending = true;
    updateSendState();

    try {
        const { chatId, chatRef } = await ensureChat(user.uid, note.uid);

        await addDoc(collection(db, "chats", chatId, "messages"), {
            content,
            sender: user.uid,
            read: false,
            timestamp: serverTimestamp(),
            replyTo: {
                id: `note-${note.uid}`,
                content: note.content || "",
                sender: note.uid,
                type: "note"
            }
        });

        await updateDoc(chatRef, {
            lastMessage: content,
            lastMessageTime: serverTimestamp()
        });

        input.value = "";
        closeNoteView();
        await openReplyChat(chatId);
    } catch (error) {
        console.error("Erro ao responder nota:", error);
    } finally {
        sending = false;
        updateSendState();
    }
}

overlay?.addEventListener("click", closeNoteView);
input?.addEventListener("input", updateSendState);

form?.addEventListener("submit", event => {
    event.preventDefault();
    replyToNote();
});
