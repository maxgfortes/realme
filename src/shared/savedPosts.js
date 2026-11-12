import { auth, db } from "/src/config/config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    collection,
    doc,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const STORE_KEY = "realme.savedPosts.v1";

let ownerUid = null;
let savedIds = new Set();
let savedOrder = [];
let unsubscribe = null;

const listeners = new Set();

function readStore() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
        return raw && typeof raw === "object" ? raw : null;
    } catch {
        return null;
    }
}

function writeStore() {
    try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ uid: ownerUid, ids: savedOrder }));
    } catch {}
}

function applyToDom() {
    document.querySelectorAll(".post-card-new[data-post-id]").forEach(card => {
        card.querySelector(".save-btn")?.classList.toggle("saved", savedIds.has(card.dataset.postId));
    });
}

function emit() {
    applyToDom();
    listeners.forEach(listener => listener(savedOrder.slice()));
}

function setOrder(ids) {
    savedOrder = ids;
    savedIds = new Set(ids);
    writeStore();
    emit();
}

function hydrate(uid) {
    const stored = readStore();

    if (stored?.uid === uid && Array.isArray(stored.ids)) {
        savedOrder = stored.ids.filter(id => typeof id === "string");
        savedIds = new Set(savedOrder);
    } else {
        savedOrder = [];
        savedIds = new Set();
    }
}

function watch(uid) {
    unsubscribe?.();
    unsubscribe = null;
    ownerUid = uid;

    if (!uid) {
        savedOrder = [];
        savedIds = new Set();
        emit();
        return;
    }

    hydrate(uid);
    emit();

    unsubscribe = onSnapshot(
        collection(db, "users", uid, "saves"),
        snapshot => {
            const ids = snapshot.docs
                .map(savedDoc => ({
                    id: savedDoc.id,
                    at: savedDoc.data({ serverTimestamps: "estimate" }).savedAt?.toMillis?.() || 0
                }))
                .sort((a, b) => b.at - a.at)
                .map(entry => entry.id);

            setOrder(ids);
        },
        error => console.error("Erro ao carregar posts salvos:", error)
    );
}

export function isSaved(postId) {
    return savedIds.has(postId);
}

export function getSavedIds() {
    return savedOrder.slice();
}

export function onSavedChange(listener) {
    listeners.add(listener);
    listener(savedOrder.slice());
    return () => listeners.delete(listener);
}

export async function toggleSaved(postId) {
    const uid = auth.currentUser?.uid;

    if (!uid || !postId) return false;

    const ref = doc(db, "users", uid, "saves", postId);
    const willSave = !savedIds.has(postId);
    const previous = savedOrder.slice();

    setOrder(willSave ? [postId, ...previous] : previous.filter(id => id !== postId));

    try {
        if (willSave) await setDoc(ref, { postId, savedAt: serverTimestamp() });
        else await deleteDoc(ref);
    } catch (error) {
        console.error("Erro ao salvar post:", error);
        setOrder(previous);
        throw error;
    }

    return willSave;
}

onAuthStateChanged(auth, user => {
    if ((user?.uid || null) === ownerUid && unsubscribe) return;
    watch(user?.uid || null);
});
