import { setCommentPost } from "./sendComment.js";
import {
    loadComments,
    stopCommentsListener
} from "./loadComments.js";

const feed =
    document.getElementById("feed");

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

function openComments(postId) {
    if (!commentsArea || !postId) {
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

if (feed) {
    feed.addEventListener(
        "click",
        event => {
            const commentButton =
                event.target.closest(
                    ".comment-btn"
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
}

if (commentsOverlay) {
    commentsOverlay.addEventListener(
        "click",
        closeComments
    );
}