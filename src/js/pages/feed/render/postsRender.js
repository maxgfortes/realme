import { db, auth } from "../../../../config/config.js";

import {
    collection,
    getDocs,
    getDoc,
    doc,
    query,
    orderBy,
    limit,
    startAfter
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import "./deletePost.js";
import "./openComments.js";
import { listenPostCount } from "./postCounters.js";
import {
    likePost,
    unlikePost,
    hasLikedPost,
    updateLikeIcon
} from "./likePost.js";
import { updatePostFooter } from "./postFooter.js";

let lastPost = null;
let isLoading = false;
let hasMorePosts = true;

const feed = document.getElementById("feed");
const feedRow = document.getElementById("scroll_page");

async function loadFeed() {
    if (!feed) return;
    if (isLoading || !hasMorePosts) return;

    isLoading = true;

    try {
        const postsQuery = lastPost
            ? query(
                collection(db, "posts"),
                orderBy("create", "desc"),
                startAfter(lastPost),
                limit(12)
            )
            : query(
                collection(db, "posts"),
                orderBy("create", "desc"),
                limit(12)
            );

        const postsSnapshot = await getDocs(postsQuery);

        if (postsSnapshot.empty) {
            hasMorePosts = false;
            return;
        }

        if (!lastPost) {
            feed.innerHTML = "";
        }

        lastPost = postsSnapshot.docs[postsSnapshot.docs.length - 1];

        const posts = postsSnapshot.docs.map(postDoc => {
            const post = postDoc.data();

            return {
                postDoc,
                post,
                postId: postDoc.id,
                creatorid: post.creatorid || "",
                imgs: normalizeImgs(post),
                dateText: post.create
                    ? formatPostDate(post.create.toDate())
                    : ""
            };
        });

        const creators = await Promise.all(
            posts.map(post => getCreator(post.creatorid))
        );

        posts.forEach(async (post, index) => {
            renderPost({
                feed,
                postId: post.postId,
                content: post.post.content || "",
                imgs: post.imgs,
                creator: creators[index],
                dateText: post.dateText,
                creatorid: post.creatorid
            });

            const postElement = feed.querySelector(
                `.post-card-new[data-post-id="${post.postId}"]`
            );

            if (!postElement) return;

            const liked = await hasLikedPost(post.postId);

            updateLikeIcon(postElement, liked);
            listenPostCount(post.postId);
            updatePostFooter(post.postId);
        });
    } catch (error) {
        console.error("Erro ao carregar feed:", error);
    } finally {
        isLoading = false;
    }
}

function normalizeImgs(post) {
    if (Array.isArray(post.imgs) && post.imgs.length) {
        return post.imgs;
    }

    if (typeof post.imgs === "string" && post.imgs) {
        return [{ url: post.imgs }];
    }

    if (typeof post.img === "string" && post.img) {
        return [{ url: post.img }];
    }

    return [];
}

if (feedRow) {
    feedRow.addEventListener("scroll", () => {
        const distanceFromBottom =
            feedRow.scrollHeight - feedRow.scrollTop - feedRow.clientHeight;

        const scrollableHeight =
            feedRow.scrollHeight - feedRow.clientHeight;

        const threshold = scrollableHeight * 0.3;

        if (distanceFromBottom <= threshold) {
            loadFeed();
        }
    });
}

async function getCreator(creatorid) {
    const defaultCreator = {
        name: "Name Surname",
        photo: "/src/public/img/default.jpg"
    };

    if (!creatorid) {
        return defaultCreator;
    }

    try {
        const userRef = doc(db, "users", creatorid);
        const userSnapshot = await getDoc(userRef);

        if (!userSnapshot.exists()) {
            return defaultCreator;
        }

        const userData = userSnapshot.data();
        const name = userData.name || "";
        const surname = userData.surname || "";
        const alias = `${name} ${surname}`.trim();

        const mediaRef = doc(
            db,
            "users",
            creatorid,
            "user-infos",
            "user-media"
        );

        const mediaSnapshot = await getDoc(mediaRef);

        let photo = defaultCreator.photo;

        if (mediaSnapshot.exists()) {
            const mediaData = mediaSnapshot.data();

            photo = mediaData.userphoto || defaultCreator.photo;
        }

        return {
            name: alias || "Usuário",
            photo
        };
    } catch (error) {
        return defaultCreator;
    }
}

// RENDER IMAGE
function renderImage(img) {
    const url = img.url || "";

    const aspectRatio =
        img.aspectRatio ||
        (
            img.width && img.height
                ? `${img.width} / ${img.height}`
                : "28 / 29"
        );

    return `
        <div class="img-card" style="aspect-ratio: ${aspectRatio};">
            <img
                src="${escapeHTML(String(url))}"
                alt=""
                loading="lazy"
            >
        </div>
    `;
}

// RENDER POST
function renderPost({
    feed,
    postId,
    content,
    imgs,
    creator,
    dateText,
    creatorid
}) {
    const contentHTML = content
        ? `
            <div class="post-content-text">
                ${escapeHTML(content)}
            </div>
        `
        : "";

    const mediaHTML =
        imgs.length === 1
            ? `
                <div class="post-content-media">
                    ${renderImage(imgs[0])}
                </div>
            `
            : imgs.length > 1
                ? `
                    <div class="post-content-media carousel">
                        <div class="carousel-track">
                            ${imgs
                                .map(img => renderImage(img))
                                .join("")
                            }
                        </div>
                    </div>
                `
                : "";

    const postHTML = `
        <div
            class="post-card-new"
            data-post-id="${escapeHTML(postId)}"
        >
            <div class="post-header-new">
                <div class="post-pfp-area post-owner-link">
                    <div class="post-pfp">
                        <img
                            src="${escapeHTML(creator.photo)}"
                            alt=""
                        >
                    </div>
                </div>

                <div class="post-header-infos post-owner-link">
                    <div class="post-author-name-area">
                        <a class="post-author-name">
                            ${escapeHTML(creator.name)}
                        </a>
                    </div>

                    <div class="post-date-new">
                        ${dateText}
                    </div>
                </div>

                <div class="post-more-actions">
                    <button
                        class="post-more"
                        data-post-id="${escapeHTML(postId)}"
                        data-creator-id="${escapeHTML(creatorid)}"
                    >
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <rect
                                x="2"
                                y="7"
                                width="20"
                                height="2.5"
                                rx="1.25"
                            />
                            <rect
                                x="2"
                                y="15"
                                width="15"
                                height="2.5"
                                rx="1.25"
                            />
                        </svg>
                    </button>
                </div>
            </div>

            <div class="post-content-new">
                ${contentHTML}
                ${mediaHTML}
            </div>

            <div class="post-bottom">
                <div class="post-actions-area">
                    <div class="post-actions-left">
                        <button
                            class="post-action-btn like-btn"
                            type="button"
                        >
                            <svg
                                class="heart-outline"
                                aria-label="Curtir"
                                fill="currentColor"
                                height="24"
                                viewBox="0 0 24 24"
                                width="24"
                            >
                                <title>Curtir</title>
                                <path
                                    d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"
                                />
                            </svg>

                            <svg
                                aria-label="Descurtir"
                                class="heart-fill"
                                fill="currentColor"
                                height="24"
                                role="img"
                                viewBox="0 0 48 48"
                                width="24"
                            >
                                <title>Descurtir</title>
                                <path
                                    d="M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6-2.7-3.7-6.1-5.5-10.6-5.5C6 3.1 0 9.6 0 17.6c0 7.3 5.4 12 10.6 16.5.6.5 1.3 1.1 1.9 1.7l2.3 2c4.4 3.9 6.6 5.9 7.6 6.5.5.3 1.1.5 1.6.5s1.1-.2 1.6-.5c1-.6 2.8-2.2 7.8-6.8l2-1.8c.7-.6 1.3-1.2 2-1.7C42.7 29.6 48 25 48 17.6c0-8-6-14.5-13.4-14.5z"
                                />
                            </svg>

                            <span class="like-count">0</span>
                        </button>

                        <button
                            class="post-action-btn comment-btn"
                            type="button"
                        >
                            <svg
                                viewBox="0 0 122.97 122.88"
                                class="comment-outline"
                                fill="currentColor"
                            >
                                <path
                                    d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"
                                />
                            </svg>

                            <span class="comment-count">0</span>
                        </button>
                    </div>
                </div>

                <div class="post-graph-box">
                    <div class="post-graph-item likers-preview">
                        <div class="post-graph-text"></div>
                    </div>

                    <!--<div class="post-graph-item comment-preview">
                        <div class="post-graph-comment"></div>
                    </div>-->
                </div>
            </div>
        </div>
    `;

    feed.insertAdjacentHTML("beforeend", postHTML);
}

// DATE
function formatPostDate(date) {
    const now = new Date();
    const difference = Math.floor((now - date) / 1000);

    if (difference < 60) {
        return "Agora mesmo";
    }

    const minutes = Math.floor(difference / 60);

    if (minutes < 60) {
        return `Há ${minutes} ${
            minutes === 1 ? "minuto" : "minutos"
        }`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `Há ${hours} ${
            hours === 1 ? "hora" : "horas"
        }`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
        return `Há ${days} ${
            days === 1 ? "dia" : "dias"
        }`;
    }

    const weeks = Math.floor(days / 7);

    if (weeks < 4) {
        return `Há ${weeks} ${
            weeks === 1 ? "semana" : "semanas"
        }`;
    }

    const months = Math.floor(days / 30);

    if (months < 12) {
        return `Há ${months} ${
            months === 1 ? "mês" : "meses"
        }`;
    }

    const years = Math.floor(days / 365);

    return `Há ${years} ${
        years === 1 ? "ano" : "anos"
    }`;
}

// ESCAPE HTML
function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// AUTH
onAuthStateChanged(auth, user => {
    if (!user) return;
    loadFeed();
});

// LIKE
if (feed) {
    feed.addEventListener("click", async event => {
        const likeButton = event.target.closest(".like-btn");

        if (!likeButton) return;

        const postElement = likeButton.closest(".post-card-new");

        if (!postElement) return;

        const postId = postElement.dataset.postId;
        const liked = await hasLikedPost(postId);

        if (liked) {
            updateLikeIcon(postElement, false);

            try {
                await unlikePost(postId);
                updatePostFooter(postId);
            } catch {
                updateLikeIcon(postElement, true);
            }
        } else {
            updateLikeIcon(postElement, true);

            try {
                await likePost(postId);
                updatePostFooter(postId);
            } catch {
                updateLikeIcon(postElement, false);
            }
        }
    });
}
