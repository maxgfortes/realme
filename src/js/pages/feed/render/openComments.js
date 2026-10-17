import { setCommentPost } from "./sendComment.js";
import {
    loadComments,
    stopCommentsListener
} from "./loadComments.js";

const commentsArea =
    document.getElementById(
        "commentsArea"
    );

const commentsOverlay =
    document.getElementById(
        "commentsOverlay"
    );

const commentsContainer =
    document.getElementById(
        "commentsContainer"
    );

export function openComments(postId) {
    if (!commentsArea) {
        console.warn("openComments: #commentsArea não existe nesta página.");
        return;
    }

    if (!postId) {
        return;
    }

    setCommentPost(postId);

    commentsArea.classList.add(
        "active"
    );

    commentsOverlay?.classList.add(
        "active"
    );

    commentsContainer?.classList.add(
        "active"
    );

    document.body.classList.add("scroll-locked");

    loadComments(postId);
}

function closeComments() {
    if (!commentsArea) return;

    stopCommentsListener();

    commentsArea.classList.remove(
        "active"
    );

    commentsOverlay?.classList.remove(
        "active"
    );

    commentsContainer?.classList.remove(
        "active"
    );

    document.body.classList.remove("scroll-locked");
}

document.addEventListener(
    "click",
    event => {
        const commentButton =
            event.target.closest(
                ".comment-btn, .comments-preview"
            );

        if (!commentButton) return;

        const postCard =
            commentButton.closest(
                ".post-card-new"
            );

        if (!postCard) return;

        const postId =
            postCard.dataset.postId;

        if (!postId) return;

        openComments(postId);
    }
);

if (commentsOverlay) {
    commentsOverlay.addEventListener(
        "click",
        closeComments
    );
}