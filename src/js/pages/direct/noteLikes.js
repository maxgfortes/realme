import { t } from "/src/i18n/i18n.js";
import { auth, db } from "../../../config/config.js";
import {
    collection,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getUserSummary } from "/src/shared/userSummary.js";

const likeButton = document.getElementById("likeNoteBtn");
const likesArea = document.getElementById("noteLikes");
const likesList = document.getElementById("noteLikesList");
const likesTitle = document.getElementById("noteLikesTitle");
const ownBadge = document.getElementById("myNoteLikes");

let viewedOwner = null;
let liked = false;
let busy = false;
let checkToken = 0;
let ownerUnsubscribe = null;
let ownerUid = null;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function paintButton() {
    if (!likeButton) return;

    likeButton.classList.toggle("liked", liked);
    likeButton.setAttribute("aria-pressed", String(liked));
    likeButton.setAttribute("aria-label", liked ? t("notes.unlike") : t("notes.like"));
}

export async function prepareNoteLike(ownerId) {
    viewedOwner = ownerId;
    liked = false;
    paintButton();

    const me = auth.currentUser?.uid;

    if (!likeButton) return;

    likeButton.hidden = !me || !ownerId || ownerId === me;

    if (likeButton.hidden) return;

    const token = ++checkToken;

    try {
        const snap = await getDoc(doc(db, "notes", ownerId, "likes", me));
        if (token !== checkToken) return;
        liked = snap.exists();
        paintButton();
    } catch {}
}

async function toggleLike() {
    const me = auth.currentUser?.uid;
    const owner = viewedOwner;

    if (!me || !owner || owner === me || busy) return;

    busy = true;
    liked = !liked;
    paintButton();

    likeButton.classList.remove("pop");
    void likeButton.offsetWidth;
    if (liked) likeButton.classList.add("pop");

    const ref = doc(db, "notes", owner, "likes", me);

    try {
        if (liked) await setDoc(ref, { uid: me, createdAt: serverTimestamp() });
        else await deleteDoc(ref);
    } catch (error) {
        console.error("Erro ao curtir nota:", error);
        liked = !liked;
        paintButton();
    } finally {
        busy = false;
    }
}

function renderOwnerLikes(docs) {
    const count = docs.length;

    if (ownBadge) {
        ownBadge.hidden = count === 0;
        ownBadge.querySelector("span").textContent = String(count);
    }

    if (!likesArea || !likesList) return;

    likesArea.hidden = count === 0;
    likesTitle.textContent = t("notes.likedBy", { count });

    const uids = docs
        .map(likeDoc => ({ uid: likeDoc.id, at: likeDoc.data({ serverTimestamps: "estimate" }).createdAt?.toMillis?.() || 0 }))
        .sort((a, b) => b.at - a.at)
        .map(entry => entry.uid);

    likesList.innerHTML = uids.map(uid => `
        <a class="note-liker" href="/profile.html?uid=${encodeURIComponent(uid)}" data-uid="${escapeHTML(uid)}">
            <span class="note-liker-pfp" data-presence-uid="${escapeHTML(uid)}"><img src="/public/img/default.jpg" alt=""></span>
            <span class="note-liker-name"></span>
        </a>
    `).join("");

    uids.forEach(uid => {
        getUserSummary(uid).then(summary => {
            const item = likesList.querySelector(`[data-uid="${CSS.escape(uid)}"]`);
            if (!item) return;
            item.querySelector("img").src = summary.photo;
            item.querySelector(".note-liker-name").textContent = summary.name || t("common.user");
        });
    });
}

export function watchOwnNoteLikes(uid, active) {
    if (!active || !uid) {
        ownerUnsubscribe?.();
        ownerUnsubscribe = null;
        ownerUid = null;
        renderOwnerLikes([]);
        return;
    }

    if (ownerUid === uid && ownerUnsubscribe) return;

    ownerUnsubscribe?.();
    ownerUid = uid;
    ownerUnsubscribe = onSnapshot(
        collection(db, "notes", uid, "likes"),
        snap => renderOwnerLikes(snap.docs),
        () => renderOwnerLikes([])
    );
}

likeButton?.addEventListener("click", toggleLike);
