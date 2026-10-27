import { t } from "/src/i18n/i18n.js";
import { db, auth } from "../../../../config/config.js";
import { postSegments } from "./postPath.js";
import { pickImage, uploadImage } from "/src/shared/uploadImage.js";

import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const MAX_COMMENT_DEPTH = 3;

const commentInput = document.getElementById("commentInput");
const sendCommentBtn = document.getElementById("sendCommentBtn");
const sendImgBtn = document.getElementById("sendImgBtn");
const inputArea = document.getElementById("commentInputArea");

let currentCommentPostId = null;
let replyTarget = null;
let pendingImage = null;
let sending = false;

const extras = document.createElement("div");
extras.className = "comment-compose-extras";
inputArea?.parentElement?.insertBefore(extras, inputArea);

function renderExtras() {
    extras.innerHTML = "";

    if (replyTarget) {
        const chip = document.createElement("div");
        chip.className = "comment-compose-chip";

        const label = document.createElement("span");
        label.textContent = t("comments.replyingTo", { name: replyTarget.name });

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.className = "comment-compose-cancel";
        cancel.setAttribute("aria-label", t("dm.cancelReply"));
        cancel.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
        cancel.addEventListener("click", clearReplyTarget);

        chip.append(label, cancel);
        extras.appendChild(chip);
    }

    if (pendingImage) {
        const preview = document.createElement("div");
        preview.className = "comment-compose-image";

        const image = document.createElement("img");
        image.src = pendingImage.previewUrl;
        image.alt = "";

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "comment-compose-cancel";
        remove.setAttribute("aria-label", t("common.delete"));
        remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
        remove.addEventListener("click", clearPendingImage);

        preview.append(image, remove);
        extras.appendChild(preview);
    }

    extras.classList.toggle("active", Boolean(replyTarget || pendingImage));
    updateSendState();
}

function updateSendState() {
    if (!sendCommentBtn) return;
    const hasText = Boolean(commentInput?.value.trim());
    sendCommentBtn.classList.toggle("ready", hasText || Boolean(pendingImage));
}

function clearPendingImage() {
    if (pendingImage?.previewUrl) URL.revokeObjectURL(pendingImage.previewUrl);
    pendingImage = null;
    renderExtras();
}

export function setCommentPost(postId) {
    if (currentCommentPostId !== postId) {
        replyTarget = null;
        clearPendingImage();
    }
    currentCommentPostId = postId;
}

export function setReplyTarget(target) {
    replyTarget = target;
    renderExtras();

    if (commentInput) {
        commentInput.placeholder = t("comments.replyPlaceholder", { name: target.name });
        commentInput.focus();
    }
}

export function clearReplyTarget() {
    replyTarget = null;
    if (commentInput) commentInput.placeholder = t("common.comentar");
    renderExtras();
}

function threadFields(target) {
    if (!target) {
        return { parentId: null, rootId: null, depth: 0 };
    }

    const nextDepth = (target.depth || 0) + 1;

    if (nextDepth > MAX_COMMENT_DEPTH) {
        return {
            parentId: target.parentId,
            rootId: target.rootId || target.commentId,
            depth: MAX_COMMENT_DEPTH
        };
    }

    return {
        parentId: target.commentId,
        rootId: target.rootId || target.commentId,
        depth: nextDepth
    };
}

async function sendComment(postId, content) {
    const user = auth.currentUser;

    if (!user) return;

    const text = String(content ?? "").trim();

    if (!text && !pendingImage) return;

    const data = {
        content: text,
        senderid: user.uid,
        create: serverTimestamp(),
        likes: 0
    };

    if (replyTarget) {
        Object.assign(data, threadFields(replyTarget));
        data.replyToUid = replyTarget.uid;
        data.replyToName = replyTarget.name;
    }

    if (pendingImage) {
        data.image = await uploadImage(pendingImage.file, { maxWidth: 1280, maxHeight: 1280 });
    }

    await addDoc(collection(db, ...postSegments(postId), "coments"), data);
}

sendImgBtn?.addEventListener("click", async event => {
    event.preventDefault();

    const file = await pickImage();
    if (!file) return;

    clearPendingImage();
    pendingImage = { file, previewUrl: URL.createObjectURL(file) };
    renderExtras();
});

commentInput?.addEventListener("input", updateSendState);

sendCommentBtn?.addEventListener("click", async () => {
    if (!currentCommentPostId || sending) return;

    const content = String(commentInput?.value ?? "").trim();

    if (!content && !pendingImage) return;

    sending = true;
    sendCommentBtn.disabled = true;
    sendCommentBtn.classList.add("sending");

    try {
        await sendComment(currentCommentPostId, content);

        commentInput.value = "";
        commentInput.dispatchEvent(new Event("input"));
        clearPendingImage();
        clearReplyTarget();
    } catch (error) {
        console.error("Erro ao comentar:", error);
    } finally {
        sending = false;
        sendCommentBtn.disabled = false;
        sendCommentBtn.classList.remove("sending");
    }
});
