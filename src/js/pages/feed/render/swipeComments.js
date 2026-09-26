import { db, auth } from "../../../../config/config.js";
import {
    doc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const swipeWidth = 90;
let openedItem = null;

function closeItem(item) {
    if (!item) return;

    const content =
        item.querySelector(
            ".comment-item-content"
        );

    const options =
        item.querySelector(
            ".comment-item-options"
        );

    if (!content || !options) return;

    item.classList.remove("open");

    content.style.transition =
        "transform .25s ease";

    content.style.transform =
        "translateX(0)";

    setTimeout(() => {
        if (!item.classList.contains("open")) {
            options.classList.remove(
                "active"
            );
        }
    }, 250);

    if (openedItem === item) {
        openedItem = null;
    }
}

function closeOtherItems(current) {
    document
        .querySelectorAll(".comment-item")
        .forEach(item => {
            if (item !== current) {
                closeItem(item);
            }
        });
}

export function enableCommentSwipe(
    item,
    postId,
    postOwnerId
) {
    const content =
        item.querySelector(
            ".comment-item-content"
        );

    const deleteButton =
        item.querySelector(
            ".item-btn.delete"
        );

    const options =
        item.querySelector(
            ".comment-item-options"
        );

    if (
        !content ||
        !deleteButton ||
        !options ||
        !postId
    ) {
        return;
    }

    const currentUser =
        auth.currentUser;

    const commentOwnerId =
        item.dataset.commentOwnerId;

    if (!currentUser) {
        return;
    }

    const canDelete =
        currentUser.uid === commentOwnerId ||
        currentUser.uid === postOwnerId;

    if (!canDelete) {
        options.remove();
        return;
    }

    let startX = 0;
    let currentX = 0;
    let startPosition = 0;
    let dragging = false;
    let moved = false;

    content.addEventListener(
        "pointerdown",
        event => {
            if (
                event.pointerType === "mouse" &&
                event.button !== 0
            ) {
                return;
            }

            closeOtherItems(item);

            startX = event.clientX;
            currentX = startX;

            startPosition =
                item.classList.contains("open")
                    ? -swipeWidth
                    : 0;

            dragging = true;
            moved = false;

            options.classList.add(
                "active"
            );

            content.style.transition =
                "none";

            content.setPointerCapture(
                event.pointerId
            );
        }
    );

    content.addEventListener(
        "pointermove",
        event => {
            if (!dragging) return;

            currentX = event.clientX;

            const difference =
                currentX - startX;

            let position =
                startPosition +
                difference;

            if (position > 0) {
                position = 0;
            }

            if (position < -swipeWidth) {
                position = -swipeWidth;
            }

            if (
                Math.abs(difference) > 5
            ) {
                moved = true;
            }

            content.style.transform =
                `translateX(${position}px)`;
        }
    );

    content.addEventListener(
        "pointerup",
        event => {
            if (!dragging) return;

            dragging = false;

            if (
                content.hasPointerCapture(
                    event.pointerId
                )
            ) {
                content.releasePointerCapture(
                    event.pointerId
                );
            }

            content.style.transition =
                "transform .25s ease";

            const difference =
                currentX - startX;

            if (startPosition === 0) {
                if (difference < -40) {
                    item.classList.add(
                        "open"
                    );

                    options.classList.add(
                        "active"
                    );

                    content.style.transform =
                        `translateX(-${swipeWidth}px)`;

                    openedItem = item;
                } else {
                    closeItem(item);
                }
            } else {
                if (difference > 40) {
                    closeItem(item);
                } else {
                    item.classList.add(
                        "open"
                    );

                    options.classList.add(
                        "active"
                    );

                    content.style.transform =
                        `translateX(-${swipeWidth}px)`;

                    openedItem = item;
                }
            }
        }
    );

    content.addEventListener(
        "pointercancel",
        () => {
            if (!dragging) return;

            dragging = false;

            content.style.transition =
                "transform .25s ease";

            if (
                item.classList.contains(
                    "open"
                )
            ) {
                content.style.transform =
                    `translateX(-${swipeWidth}px)`;

                options.classList.add(
                    "active"
                );
            } else {
                content.style.transform =
                    "translateX(0)";

                setTimeout(() => {
                    if (
                        !item.classList.contains(
                            "open"
                        )
                    ) {
                        options.classList.remove(
                            "active"
                        );
                    }
                }, 250);
            }
        }
    );

    content.addEventListener(
        "click",
        event => {
            if (!moved) return;

            event.preventDefault();
            event.stopPropagation();

            moved = false;
        }
    );

    deleteButton.addEventListener(
        "click",
        async event => {
            event.preventDefault();
            event.stopPropagation();

            const commentId =
                item.dataset.commentId;

            if (!commentId) return;

            try {
                deleteButton.disabled = true;

                const commentRef = doc(
                    db,
                    "posts",
                    postId,
                    "coments",
                    commentId
                );

                await deleteDoc(
                    commentRef
                );

                const height =
                    item.offsetHeight;

                item.style.height =
                    `${height}px`;

                item.style.transition =
                    "height .25s ease, opacity .25s ease, transform .25s ease";

                item.style.overflow =
                    "hidden";

                requestAnimationFrame(
                    () => {
                        item.style.height =
                            "0";

                        item.style.opacity =
                            "0";

                        item.style.transform =
                            "translateX(-30px)";
                    }
                );

                setTimeout(() => {
                    item.remove();

                    if (
                        openedItem === item
                    ) {
                        openedItem = null;
                    }
                }, 250);
            } catch (error) {
                console.error(
                    "Erro ao deletar comentário:",
                    error
                );

                deleteButton.disabled =
                    false;
            }
        }
    );
}

document.addEventListener(
    "pointerdown",
    event => {
        if (
            openedItem &&
            !openedItem.contains(
                event.target
            )
        ) {
            closeItem(openedItem);
        }
    }
);