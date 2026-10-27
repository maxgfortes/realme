import { t } from "/src/i18n/i18n.js";
import { db } from "../../../../config/config.js";
import { postSegments } from "./postPath.js";

import {
    collection,
    getDocs,
    getDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const likesMenuArea = document.getElementById("likesMenuArea");
const likesMenuOverlay = document.getElementById("likesMenuOverlay");
const likesMenu = document.getElementById("likesMenu");
const likesList = document.getElementById("likesList");

const userCache = new Map();

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function getUser(uid) {
    if (!uid) {
        return {
            name: t("common.user"),
            username: "",
            photo: "/src/public/img/default.jpg"
        };
    }

    if (userCache.has(uid)) {
        return userCache.get(uid);
    }

    const promise = (async () => {
        try {
            const userSnapshot = await getDoc(
                doc(db, "users", uid)
            );

            if (!userSnapshot.exists()) {
                return {
                    name: t("common.user"),
                    username: "",
                    photo: "/src/public/img/default.jpg"
                };
            }

            const userData = userSnapshot.data();

            const name = userData.name || "";
            const surname = userData.surname || "";

            const fullName =
                `${name} ${surname}`.trim() || t("common.user");

            const username =
                userData.username || "";

            const mediaSnapshot = await getDoc(
                doc(
                    db,
                    "users",
                    uid,
                    "user-infos",
                    "user-media"
                )
            );

            let photo = "/src/public/img/default.jpg";

            if (mediaSnapshot.exists()) {
                photo =
                    mediaSnapshot.data().userphoto ||
                    photo;
            }

            return {
                name: fullName,
                username,
                photo
            };

        } catch (error) {
            console.error(
                "Erro ao carregar usuário:",
                uid,
                error
            );

            return {
                name: t("common.user"),
                username: "",
                photo: "/src/public/img/default.jpg"
            };
        }
    })();

    userCache.set(uid, promise);

    return promise;
}

const likesTitle = likesMenu?.querySelector(".bottom-menu-title");

function userItemHTML(user) {
    return `
        <a
            href="profile.html?uid=${encodeURIComponent(user.uid)}"
            class="user-item">

            <div class="user-item-pfp-area">
                <img
                    src="${escapeHTML(user.photo)}"
                    alt=""
                    loading="lazy"
                >
            </div>

            <div class="user-item-infos">
                <div class="user-item-name">
                    ${escapeHTML(user.name)}
                </div>
                <div class="user-item-username">
                    ${escapeHTML(user.username)}
                </div>
            </div>
        </a>
    `;
}

async function openUserSheet(title, loadUids, emptyText, errorText) {
    if (!likesMenuArea || !likesList) {
        return;
    }

    if (likesTitle) likesTitle.textContent = title;

    likesMenuArea.classList.add("active");
    likesMenuOverlay.classList.add("active");
    likesMenu.classList.add("active");

    likesList.innerHTML = `
        <div class="likes-loading">
            <img src="/public/img/loading.gif">
        </div>
    `;

    try {
        const uids = await loadUids();

        if (!uids.length) {
            likesList.innerHTML = `<div class="likes-empty">${emptyText}</div>`;
            return;
        }

        const users = await Promise.all(
            uids.map(async uid => ({ uid, ...(await getUser(uid)) }))
        );

        likesList.innerHTML = users.map(userItemHTML).join("");
    } catch (error) {
        console.error("Erro ao carregar lista:", error);
        likesList.innerHTML = `<div class="likes-empty">${errorText}</div>`;
    }
}

export function openLikes(postId) {
    if (!postId) return;

    return openUserSheet(
        t("common.curtido_por"),
        async () => {
            const likesSnapshot = await getDocs(collection(db, ...postSegments(postId), "likers"));
            return likesSnapshot.docs.map(likeDoc => likeDoc.id);
        },
        t("likes.empty"),
        t("likes.error")
    );
}

export function openMentions(postId) {
    if (!postId) return;

    return openUserSheet(
        t("post.mentionedTitle"),
        async () => {
            const snapshot = await getDoc(doc(db, ...postSegments(postId)));
            if (!snapshot.exists()) return [];

            const data = snapshot.data();
            const raw = Array.isArray(data.mentions) ? data.mentions : [];

            return [...new Set(raw.filter(uid => typeof uid === "string" && uid && uid !== data.creatorid))];
        },
        t("post.mentionedEmpty"),
        t("likes.error")
    );
}

export function openUsersList(title, uids) {
    return openUserSheet(title, async () => uids, t("likes.empty"), t("likes.error"));
}

export function closeLikes() {
    likesMenu.classList.remove("active");
    likesMenuOverlay.classList.remove("active");

    setTimeout(() => {
        likesMenuArea.classList.remove("active");
    }, 300);
}

likesMenuOverlay.addEventListener("click", closeLikes);

document.addEventListener("click", event => {
    const others = event.target.closest(".post-mentions-others");
    if (!others) return;

    const card = others.closest("[data-post-id]");
    if (!card) return;

    event.preventDefault();
    event.stopPropagation();
    openMentions(card.dataset.postId);
});
