import { db } from "../../../../config/config.js";

import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


export function listenPostCount(postId) {

    const postElement = document.querySelector(
        `.post-card-new[data-post-id="${postId}"]`
    );

    if (!postElement) return;

    const likesRef = collection(db, "posts", postId, "likers");

    onSnapshot(likesRef, (snapshot) => {

        const count = snapshot.size;

        const counter = postElement.querySelector(".like-count");

        if (counter) {
            counter.textContent = count;
        }

    });

    const commentsRef = collection(
        db,
        "posts",
        postId,
        "coments"
    );

    onSnapshot(commentsRef, (snapshot) => {

        const count = snapshot.size;

        const counter = postElement.querySelector(".comment-count");

        if (counter) {
            counter.textContent = count;
        }

    });

}