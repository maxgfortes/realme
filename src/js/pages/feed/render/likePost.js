import { db, auth } from "../../../../config/config.js";

import {
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


export function likePost(postId) {

    const user = auth.currentUser;

    if (!user) return;

    const userId = user.uid;

    const likeRef = doc(
        db,
        "posts",
        postId,
        "likers",
        userId
    );

    return setDoc(likeRef, {
        timestamp: serverTimestamp()
    });
}


export function unlikePost(postId) {

    const user = auth.currentUser;

    if (!user) return;

    const userId = user.uid;

    const likeRef = doc(
        db,
        "posts",
        postId,
        "likers",
        userId
    );

    return deleteDoc(likeRef);
}


export async function hasLikedPost(postId) {

    const user = auth.currentUser;

    if (!user) return false;

    const userId = user.uid;

    const likeRef = doc(
        db,
        "posts",
        postId,
        "likers",
        userId
    );

    const likeSnapshot = await getDoc(likeRef);

    return likeSnapshot.exists();
}

export function updateLikeIcon(postElement, liked) {

    const outline = postElement.querySelector(".heart-outline");
    const filled = postElement.querySelector(".heart-fill");

    if (liked) {
        outline.classList.add("active");
        filled.classList.add("active");
    } else {
        outline.classList.remove("active");
        filled.classList.remove("active");
    }
}