
import { likePost, updateLikeIcon } from "./likePost.js";

const clickTimers = new Map();

function likeAnimation(content) {
    const postElement = content.closest("[data-post-id]");
    if (!postElement) return;

    updateLikeIcon(postElement, true);

    const heart = document.createElement("div");
    heart.className = "post-like-burst";

    heart.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
                d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"
                fill="#ff3040"
            />
        </svg>
    `;

    const rect = content.getBoundingClientRect();

    heart.style.left = `${content._clickX - rect.left}px`;
    heart.style.top = `${content._clickY - rect.top}px`;

    content.appendChild(heart);

    heart.addEventListener("animationend", () => {
        heart.remove();
    }, { once: true });
}

function doubleClick(postId, content, event) {
    const existingTimer = clickTimers.get(postId);

    if (existingTimer) {
        clearTimeout(existingTimer);
        clickTimers.delete(postId);

        content._clickX = event.clientX;
        content._clickY = event.clientY;

        likeAnimation(content);
        likePost(postId);
        return;
    }

    content._clickX = event.clientX;
    content._clickY = event.clientY;

    const timer = setTimeout(() => {
        clickTimers.delete(postId);
    }, 300);

    clickTimers.set(postId, timer);
}

document.addEventListener("click", (event) => {
    const content = event.target.closest(".post-content-new");
    if (!content) return;

    const post = content.closest("[data-post-id]");
    if (!post) return;

    doubleClick(post.dataset.postId, content, event);
});
