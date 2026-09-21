import {
    doc, collection, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, db } from "../config/config.js";

const NOTE_PLACEHOLDER = "O que você está fazendo agora?";
const DEFAULT_PFP = "../public/img/default.jpg";
const LONG_PRESS_MS = 500;
const CACHE_KEY = "notesCache";

const notesRow = document.getElementById("notesRow");
const createNoteBtn = document.getElementById("createNoteBtn");
const createNoteArea = document.getElementById("createNoteArea");
const createNoteOverlay = document.getElementById("createNoteOverlay");
const createNoteModal = document.getElementById("createNoteModal");
const sendNote = document.getElementById("sendNote");
const cancelNote = document.getElementById("cancelNote");
const noteName = document.getElementById("notenName");
const notePfp = document.getElementById("notePfp");
const noteInput = document.getElementById("noteInput");
const createNoteModalPfp = document.getElementById("createNoteModalPfp");
const createNoteModalName = document.getElementById("createNoteModalName");

let unsubscribeNote = null;
let unsubscribeFriends = null;
let hasActiveNote = false;
let longPressTimer = null;
let suppressNextClick = false;

const friendNoteUnsubs = new Map();
const friendNodes = new Map();
const friendProfileCache = new Map();

function readCache() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY)) || { own: null, friends: {}, profiles: {} };
    } catch {
        return { own: null, friends: {}, profiles: {} };
    }
}

function writeCache() {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.error("Erro ao salvar cache de notas:", error);
    }
}

const cache = readCache();

const NOTE_PREFIX = "Está: ";

function setNoteText(el, content) {
    if (el.dataset.rawContent === content) return;

    el.dataset.rawContent = content;
    el.innerHTML = "";

    const prefix = document.createElement("span");
    prefix.className = "note-prefix";
    prefix.textContent = NOTE_PREFIX;

    el.appendChild(prefix);
    el.appendChild(document.createTextNode(content));
}

function clearNoteText(el, placeholderText) {
    delete el.dataset.rawContent;

    if (el.textContent !== placeholderText) {
        el.textContent = placeholderText;
    }
}

function openNoteOverlay() {
    createNoteArea.classList.add("active");
    createNoteOverlay.classList.add("active");
    createNoteModal.classList.add("active");
}

function closeNoteOverlay() {
    createNoteOverlay.classList.remove("active");
    createNoteModal.classList.remove("active");
    setTimeout(() => createNoteArea.classList.remove("active"), 300);
}

function handleNoteClick() {
    if (suppressNextClick) {
        suppressNextClick = false;
        return;
    }
    openNoteOverlay();
}

function startLongPress() {
    if (!hasActiveNote) return;

    clearLongPress();
    longPressTimer = setTimeout(() => {
        longPressTimer = null;
        suppressNextClick = true;
        deleteNote();
    }, LONG_PRESS_MS);
}

function clearLongPress() {
    clearTimeout(longPressTimer);
    longPressTimer = null;
}

async function postNote() {
    const content = noteInput.value.trim().slice(0, 60);
    const user = auth.currentUser;

    if (!content || !user) return;

    sendNote.disabled = true;

    try {
        await setDoc(doc(db, "notes", user.uid), {
            content,
            createdAt: serverTimestamp()
        });

        noteInput.value = "";
        closeNoteOverlay();
    } catch (error) {
        console.error("Erro ao postar nota:", error);
    } finally {
        sendNote.disabled = false;
    }
}

async function deleteNote() {
    const user = auth.currentUser;

    if (!user) return;

    try {
        await deleteDoc(doc(db, "notes", user.uid));
    } catch (error) {
        console.error("Erro ao apagar nota:", error);
    }
}

function renderNotes(note) {
    hasActiveNote = !!note?.content;

    if (hasActiveNote) {
        setNoteText(createNoteBtn, note.content);
    } else {
        clearNoteText(createNoteBtn, NOTE_PLACEHOLDER);
    }

    createNoteBtn.classList.toggle("placeholder", !hasActiveNote);
    createNoteBtn.classList.toggle("has-note", hasActiveNote);

    cache.own = hasActiveNote ? { content: note.content } : null;
    writeCache();
}

function loadNotes(user) {
    unsubscribeNote?.();
    unsubscribeNote = null;

    if (!user) {
        renderNotes(null);
        return;
    }

    unsubscribeNote = onSnapshot(
        doc(db, "notes", user.uid),
        (snap) => renderNotes(snap.exists() ? snap.data() : null),
        (error) => console.error("Erro ao carregar nota:", error)
    );
}

function loadUserInfo() {
    const greeting = localStorage.getItem("greeting");

    if (!greeting) return;

    const dados = JSON.parse(greeting);

    if (dados.displayName) {
        noteName.textContent = dados.displayName;
        createNoteModalName.textContent = `${dados.displayName} está:`;
    }

    if (dados.userphoto) {
        notePfp.src = dados.userphoto;
        createNoteModalPfp.src = dados.userphoto;
    }
}

function buildFriendNode(friendId) {
    const item = document.createElement("div");
    item.className = "feeling-item";
    item.innerHTML = `
        <div class="note-user-infos">
            <div class="note-pfp">
                <div class="note-pfp-border">
                    <img src="${DEFAULT_PFP}">
                </div>
            </div>
            <div class="note-username">...</div>
        </div>
        <div class="humor-note-border">
            <div class="humor-note"></div>
        </div>
    `;

    notesRow.appendChild(item);

    const node = {
        item,
        pfpImg: item.querySelector("img"),
        nameEl: item.querySelector(".note-username"),
        contentEl: item.querySelector(".humor-note")
    };

    friendNodes.set(friendId, node);

    return node;
}

function applyProfile(node, profile) {
    if (!profile) return;

    const same = node.appliedProfile
        && node.appliedProfile.name === profile.name
        && node.appliedProfile.photo === profile.photo;

    node.appliedProfile = profile;

    if (same) return;

    node.nameEl.textContent = profile.name;
    node.pfpImg.src = profile.photo;
}

function removeFriendNode(friendId) {
    friendNodes.get(friendId)?.item.remove();
    friendNodes.delete(friendId);
}

async function loadFriendProfile(friendId, node) {
    try {
        let profile = friendProfileCache.get(friendId);

        if (!profile) {
            const [userSnap, mediaSnap] = await Promise.all([
                getDoc(doc(db, "users", friendId)),
                getDoc(doc(db, "users", friendId, "user-infos", "user-media"))
            ]);

            const userData = userSnap.exists() ? userSnap.data() : {};
            const mediaData = mediaSnap.exists() ? mediaSnap.data() : {};

            profile = {
                name: [userData.name, userData.surname].filter(Boolean).join(" ") || "Usuário",
                photo: mediaData.userphoto || DEFAULT_PFP
            };

            friendProfileCache.set(friendId, profile);
            cache.profiles[friendId] = profile;
            writeCache();
        }

        if (friendNodes.get(friendId) !== node) return;

        applyProfile(node, profile);
    } catch (error) {
        console.error(`Erro ao carregar perfil de ${friendId}:`, error);
    }
}

function updateFriendNote(friendId, note) {
    if (!note?.content) {
        removeFriendNode(friendId);
        delete cache.friends[friendId];
        writeCache();
        return;
    }

    let node = friendNodes.get(friendId);

    if (!node) {
        node = buildFriendNode(friendId);
        applyProfile(node, cache.profiles[friendId]);
    }

    setNoteText(node.contentEl, note.content);

    cache.friends[friendId] = { content: note.content };
    writeCache();

    loadFriendProfile(friendId, node);
}

function attachFriendNoteListener(friendId) {
    if (friendNoteUnsubs.has(friendId)) return;

    friendNoteUnsubs.set(friendId, onSnapshot(
        doc(db, "notes", friendId),
        (snap) => updateFriendNote(friendId, snap.exists() ? snap.data() : null),
        (error) => console.error(`Erro ao observar nota de ${friendId}:`, error)
    ));
}

function detachFriendNoteListener(friendId) {
    friendNoteUnsubs.get(friendId)?.();
    friendNoteUnsubs.delete(friendId);
}

function stopFriendNotes() {
    unsubscribeFriends?.();
    unsubscribeFriends = null;

    friendNoteUnsubs.forEach((unsub) => unsub());
    friendNoteUnsubs.clear();

    friendNodes.forEach((node) => node.item.remove());
    friendNodes.clear();
}

function loadFriendNotes(user) {
    stopFriendNotes();

    if (!user) return;

    unsubscribeFriends = onSnapshot(
        collection(db, "users", user.uid, "friends"),
        (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                const friendId = change.doc.id;

                if (change.type === "added") {
                    attachFriendNoteListener(friendId);
                } else if (change.type === "removed") {
                    detachFriendNoteListener(friendId);
                    removeFriendNode(friendId);
                }
            });
        },
        (error) => console.error("Erro ao carregar lista de amigos:", error)
    );
}

function hydrateFromCache() {
    if (cache.own?.content) {
        renderNotes({ content: cache.own.content });
    }

    Object.entries(cache.friends).forEach(([friendId, data]) => {
        if (!data?.content) return;

        const node = buildFriendNode(friendId);
        applyProfile(node, cache.profiles[friendId]);
        setNoteText(node.contentEl, data.content);
    });
}

createNoteBtn.addEventListener("click", handleNoteClick);
createNoteBtn.addEventListener("pointerdown", startLongPress);
createNoteBtn.addEventListener("pointerup", clearLongPress);
createNoteBtn.addEventListener("pointerleave", clearLongPress);
createNoteBtn.addEventListener("pointercancel", clearLongPress);
cancelNote.addEventListener("click", closeNoteOverlay);
sendNote.addEventListener("click", postNote);

loadUserInfo();
hydrateFromCache();

onAuthStateChanged(auth, (user) => {
    loadNotes(user);
    loadFriendNotes(user);
});