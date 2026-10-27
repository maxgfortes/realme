import { t } from "/src/i18n/i18n.js";
import {
    doc, collection, getDoc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth, db } from "../../../config/config.js";
import { openNoteView } from "./noteView.js";
import { onCurrentUser } from "/src/shared/currentUser.js";

const NOTE_PLACEHOLDER = t("dm.notePlaceholder");
const DEFAULT_PFP = "../public/img/default.jpg";
const LONG_PRESS_MS = 500;
const CACHE_KEY = "notesCache";
const NOTE_MAX_AGE = 24 * 60 * 60 * 1000;
const NOTE_EXPIRY_CHECK_MS = 60 * 1000;

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

const NOTE_PREFIX = t("dm.notePrefix");

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
    const validNote = isNoteWithin24Hours(note);

    hasActiveNote = !!note?.content && validNote;

    if (hasActiveNote) {
        setNoteText(createNoteBtn, note.content);
    } else {
        clearNoteText(createNoteBtn, NOTE_PLACEHOLDER);
    }

    createNoteBtn.classList.toggle("placeholder", !hasActiveNote);
    createNoteBtn.classList.toggle("has-note", hasActiveNote);

    cache.own = hasActiveNote
        ? {
            content: note.content,
            createdAt: note.createdAt?.toDate
                ? note.createdAt.toDate().toISOString()
                : note.createdAt
        }
        : null;

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
    onCurrentUser(user => {
        if (!user) return;

        if (user.name) {
            noteName.textContent = user.name;
            createNoteModalName.textContent = t("dm.noteModalName", { name: user.name });
        }

        if (user.photo) {
            if (notePfp.getAttribute("src") !== user.photo) notePfp.src = user.photo;
            if (createNoteModalPfp.getAttribute("src") !== user.photo) createNoteModalPfp.src = user.photo;
        }
    });
}

function buildFriendNode(friendId) {
    const item = document.createElement("div");
    item.className = "feeling-item";
    item.dataset.uid = friendId;
    item.innerHTML = `
        <div class="note-user-infos">
            <div class="note-pfp">
                <div class="note-pfp-border">
                    <img src="${DEFAULT_PFP}">
                </div>
            </div>
            <div class="note-username"></div>
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
                name: [userData.name, userData.surname].filter(Boolean).join(" ") || t("common.user"),
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
    if (!note?.content || !isNoteWithin24Hours(note)) {
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
    node.note = { content: note.content, createdAt: note.createdAt || null };

    cache.friends[friendId] = {
    content: note.content,
    createdAt: note.createdAt?.toDate
        ? note.createdAt.toDate().toISOString()
        : note.createdAt
};

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
    unsubscribeFriends?.();
    unsubscribeFriends = null;

    friendNoteUnsubs.forEach((unsub) => unsub());
    friendNoteUnsubs.clear();

    if (!user) {
        stopFriendNotes();
        return;
    }

    let firstSnapshot = true;

    unsubscribeFriends = onSnapshot(
        collection(db, "users", user.uid, "friends"),
        (snapshot) => {
            if (firstSnapshot) {
                firstSnapshot = false;

                const friendIds = new Set(snapshot.docs.map((friendDoc) => friendDoc.id));

                [...friendNodes.keys()].forEach((friendId) => {
                    if (!friendIds.has(friendId)) {
                        removeFriendNode(friendId);
                        delete cache.friends[friendId];
                    }
                });

                writeCache();
            }

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

function isNoteWithin24Hours(note) {
    if (!note?.createdAt) return false;

    const createdAt = note.createdAt?.toDate
        ? note.createdAt.toDate()
        : new Date(note.createdAt);

    if (Number.isNaN(createdAt.getTime())) return false;

    return Date.now() - createdAt.getTime() < NOTE_MAX_AGE;
}

function hydrateFromCache() {
    if (cache.own?.content && isNoteWithin24Hours(cache.own)) {
        renderNotes({ content: cache.own.content, createdAt: cache.own.createdAt });
    }

    Object.entries(cache.friends).forEach(([friendId, data]) => {
        if (!data?.content || !isNoteWithin24Hours(data)) {
            delete cache.friends[friendId];
            return;
        }

        const node = buildFriendNode(friendId);
        applyProfile(node, cache.profiles[friendId]);
        setNoteText(node.contentEl, data.content);
        node.note = { content: data.content, createdAt: data.createdAt || null };
    });
}

function handleFriendNoteClick(event) {
    const item = event.target.closest(".feeling-item");

    if (!item || item.classList.contains("my-feeling")) return;

    const friendId = item.dataset.uid;
    const node = friendNodes.get(friendId);

    if (!node?.note?.content) return;

    openNoteView({
        uid: friendId,
        name: node.appliedProfile?.name || node.nameEl.textContent || t("common.user"),
        photo: node.appliedProfile?.photo || node.pfpImg.src || DEFAULT_PFP,
        content: node.note.content,
        createdAt: node.note.createdAt
    });
}

createNoteBtn.addEventListener("click", handleNoteClick);
createNoteBtn.addEventListener("pointerdown", startLongPress);
createNoteBtn.addEventListener("pointerup", clearLongPress);
createNoteBtn.addEventListener("pointerleave", clearLongPress);
createNoteBtn.addEventListener("pointercancel", clearLongPress);
cancelNote.addEventListener("click", closeNoteOverlay);
sendNote.addEventListener("click", postNote);
notesRow.addEventListener("click", handleFriendNoteClick);

setInterval(() => {
    friendNodes.forEach((node, friendId) => {
        if (node.note?.createdAt && !isNoteWithin24Hours(node.note)) {
            removeFriendNode(friendId);
            delete cache.friends[friendId];
            writeCache();
        }
    });

    if (hasActiveNote && cache.own?.createdAt && !isNoteWithin24Hours(cache.own)) {
        renderNotes(null);
    }
}, NOTE_EXPIRY_CHECK_MS);

loadUserInfo();
hydrateFromCache();

onAuthStateChanged(auth, (user) => {
    loadNotes(user);
    loadFriendNotes(user);
});