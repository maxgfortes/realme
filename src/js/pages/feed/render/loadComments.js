import { db } from "../../../../config/config.js";
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    enableCommentSwipe
} from "./swipeComments.js";

const commentsRow =
    document.getElementById("commentsRow");

let unsubscribeComments = null;

const userCache = new Map();

export async function loadComments(postId) {
    if (!commentsRow || !postId) return;

    if (unsubscribeComments) {
        unsubscribeComments();
        unsubscribeComments = null;
    }

    commentsRow.innerHTML = "";

    const postRef = doc(
        db,
        "posts",
        postId
    );

    const postSnapshot = await getDoc(
        postRef
    );

    if (!postSnapshot.exists()) {
        commentsRow.innerHTML = `
            <div class="no-comments">
                Post não encontrado.
            </div>
        `;
        return;
    }

    const postData = postSnapshot.data();

    const postOwnerId =
        postData.creatorid ||
        postData.uid ||
        postData.ownerid;

    const commentsRef = collection(
        db,
        "posts",
        postId,
        "coments"
    );

    const commentsQuery = query(
        commentsRef,
        orderBy("create", "asc")
    );

    unsubscribeComments = onSnapshot(
        commentsQuery,
        async snapshot => {
            commentsRow.innerHTML = "";

            if (snapshot.empty) {
                commentsRow.innerHTML = `
                    <div class="no-comments">
                        Nenhum comentário ainda.
                    </div>
                `;
                return;
            }

            for (const commentDoc of snapshot.docs) {
                const comment =
                    commentDoc.data();

                const user =
                    await getUserData(
                        comment.senderid
                    );

                renderComment(
                    postId,
                    postOwnerId,
                    commentDoc.id,
                    comment,
                    user
                );
            }
        },
        error => {
            console.error(
                "Erro no onSnapshot dos comentários:",
                error
            );
        }
    );
}

export function stopCommentsListener() {
    if (unsubscribeComments) {
        unsubscribeComments();
        unsubscribeComments = null;
    }
}

async function getUserData(uid) {
    if (!uid) {
        return {
            name: "Usuário",
            surname: "",
            userphoto: "/public/img/default.jpg"
        };
    }

    if (userCache.has(uid)) {
        return userCache.get(uid);
    }

    try {
        const userRef = doc(
            db,
            "users",
            uid
        );

        const userSnapshot = await getDoc(
            userRef
        );

        if (!userSnapshot.exists()) {
            const defaultUser = {
                name: "Usuário",
                surname: "",
                userphoto: "/public/img/default.jpg"
            };

            userCache.set(
                uid,
                defaultUser
            );

            return defaultUser;
        }

        const data = userSnapshot.data();

        const userMediaRef = doc(
            db,
            "users",
            uid,
            "user-infos",
            "user-media"
        );

        const userMediaSnapshot =
            await getDoc(userMediaRef);

        const userMediaData =
            userMediaSnapshot.exists()
                ? userMediaSnapshot.data()
                : {};

        const user = {
            name: data.name || "Usuário",
            surname: data.surname || "",
            userphoto:
                userMediaData.userphoto ||
                "/public/img/default.jpg"
        };

        userCache.set(
            uid,
            user
        );

        return user;
    } catch (error) {
        console.error(
            "Erro ao buscar usuário:",
            uid,
            error
        );

        return {
            name: "Usuário",
            surname: "",
            userphoto: "/public/img/default.jpg"
        };
    }
}

function renderComment(
    postId,
    postOwnerId,
    commentId,
    comment,
    user
) {
    const commentElement =
        document.createElement("div");

    commentElement.className =
        "comment-item";

    commentElement.dataset.commentId =
        commentId;

    commentElement.dataset.commentOwnerId =
        comment.senderid || "";

    const fullName = [
        user.name,
        user.surname
    ]
        .filter(Boolean)
        .join(" ");

    const date =
        formatCommentDate(
            comment.create
        );

    commentElement.innerHTML = `
        <div class="comment-item-content">

            <div class="comment-left">

                <div class="comment-pfp">

                    <img
                        src="${escapeHTML(user.userphoto)}"
                        alt=""
                    >

                </div>

            </div>

            <div class="comment-right">

                <div class="comment-header">

                    <div class="comment-displayname">
                        ${escapeHTML(fullName)}
                    </div>

                    <div class="comment-date">
                        ${date}
                    </div>

                </div>

                <div class="comment-body">

                    <div class="comment-text"></div>

                </div>

                <button
                    class="comment-reply"
                    type="button"
                >
                    Responder
                </button>

            </div>

        </div>

        <div class="comment-item-options">

            <button
                class="item-btn delete"
                type="button"
            >

                <svg
                    viewBox="0 0 512 512"
                    xmlns="http://www.w3.org/2000/svg"
                >
                    <g
                        id="SVGRepo_bgCarrier"
                        stroke-width="0"
                    ></g>

                    <g
                        id="SVGRepo_tracerCarrier"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    ></g>

                    <g
                        id="SVGRepo_iconCarrier"
                    >

                        <path
                            d="M432,144,403.33,419.74A32,32,0,0,1,371.55,448H140.46a32,32,0,0,1-31.78-28.26L80,144"
                            style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"
                        ></path>

                        <rect
                            x="32"
                            y="64"
                            width="448"
                            height="80"
                            rx="16"
                            ry="16"
                            style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"
                        ></rect>

                        <line
                            x1="312"
                            y1="240"
                            x2="200"
                            y2="352"
                            style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"
                        ></line>

                        <line
                            x1="312"
                            y1="352"
                            x2="200"
                            y2="240"
                            style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"
                        ></line>

                    </g>
                </svg>

            </button>

        </div>
    `;

    const commentText =
        commentElement.querySelector(
            ".comment-text"
        );

    commentText.textContent =
        String(comment.content ?? "");

    commentsRow.appendChild(
        commentElement
    );

    enableCommentSwipe(
        commentElement,
        postId,
        postOwnerId
    );
}

function formatCommentDate(timestamp) {
    if (!timestamp) {
        return "agora mesmo";
    }

    const date = timestamp.toDate();
    const now = new Date();

    const diff =
        now.getTime() -
        date.getTime();

    const seconds =
        Math.floor(diff / 1000);

    const minutes =
        Math.floor(seconds / 60);

    const hours =
        Math.floor(minutes / 60);

    const days =
        Math.floor(hours / 24);

    const weeks =
        Math.floor(days / 7);

    if (seconds < 60) {
        return "agora mesmo";
    }

    if (minutes < 60) {
        return `há ${minutes} ${
            minutes === 1
                ? "minuto"
                : "minutos"
        }`;
    }

    if (hours < 24) {
        return `há ${hours} ${
            hours === 1
                ? "hora"
                : "horas"
        }`;
    }

    if (days < 7) {
        return `há ${days} ${
            days === 1
                ? "dia"
                : "dias"
        }`;
    }

    return `há ${weeks} ${
        weeks === 1
            ? "semana"
            : "semanas"
    }`;
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}