import { db } from "../../../../config/config.js";

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
            name: "Usuário",
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
                    name: "Usuário",
                    username: "",
                    photo: "/src/public/img/default.jpg"
                };
            }

            const userData = userSnapshot.data();

            const name = userData.name || "";
            const surname = userData.surname || "";

            const fullName =
                `${name} ${surname}`.trim() || "Usuário";

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
                name: "Usuário",
                username: "",
                photo: "/src/public/img/default.jpg"
            };
        }
    })();

    userCache.set(uid, promise);

    return promise;
}

export async function openLikes(postId) {
    if (!likesMenuArea || !likesList || !postId) {
        return;
    }

    likesMenuArea.classList.add("active");
    likesMenuOverlay.classList.add("active");
    likesMenu.classList.add("active");

    likesList.innerHTML = `
        <div class="likes-loading">
            <img src="/public/img/loading.gif">
        </div>
    `;

    try {
        const likesRef = collection(
            db,
            "posts",
            postId,
            "likers"
        );

        const likesSnapshot = await getDocs(likesRef);

        if (likesSnapshot.empty) {
            likesList.innerHTML = `
                <div class="likes-empty">
                    Ninguém curtiu ainda.
                </div>
            `;

            return;
        }

        const users = await Promise.all(
            likesSnapshot.docs.map(async likeDoc => {

                const uid = likeDoc.id;

                const user = await getUser(uid);

                return {
                    uid,
                    ...user
                };
            })
        );

        likesList.innerHTML = users.map(user => `
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
        `).join("");

    } catch (error) {
        console.error(
            "Erro ao carregar curtidas:",
            error
        );

        likesList.innerHTML = `
            <div class="likes-empty">
                Não foi possível carregar as curtidas.
            </div>
        `;
    }
}

export function closeLikes() {
    likesMenu.classList.remove("active");
    likesMenuOverlay.classList.remove("active");

    setTimeout(() => {
        likesMenuArea.classList.remove("active");
    }, 300);
}

likesMenuOverlay.addEventListener("click", closeLikes);