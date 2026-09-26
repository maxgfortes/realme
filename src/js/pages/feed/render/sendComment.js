import { db, auth } from "../../../../config/config.js";

import {
    collection,
    addDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const commentInput = document.getElementById("commentInput");
const sendCommentBtn = document.getElementById("sendCommentBtn");

let currentCommentPostId = null;

export function setCommentPost(postId) {
    currentCommentPostId = postId;
}

async function sendComment(postId, content) {
    const user = auth.currentUser;

    if (!user) return;

    const text = String(content ?? "").trim();

    if (!text) return;

    const commentsRef = collection(
        db,
        "posts",
        postId,
        "coments"
    );

    await addDoc(commentsRef, {
        content: text,
        senderid: user.uid,
        create: serverTimestamp()
    });
}

if (sendCommentBtn) {
    sendCommentBtn.addEventListener("click", async () => {
        if (!currentCommentPostId) return;

        const content = String(
            commentInput?.value ?? ""
        ).trim();

        if (!content) return;

        try {
            sendCommentBtn.disabled = true;

            await sendComment(
                currentCommentPostId,
                content
            );

            commentInput.value = "";
        } catch (error) {

        } finally {
            sendCommentBtn.disabled = false;
        }
    });
}