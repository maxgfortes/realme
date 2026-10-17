import { db, auth } from "../../../../config/config.js";
import { postSegments } from "./postPath.js";
import { updateLikeIcon } from "./likePost.js";

import {
    collection,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { renderLikersFooter, getLikersName } from "./postFooter.js";
import { renderCommentsPreview } from "./commentsPreview.js";

const COMMENTS_PREVIEW_SIZE = 2;

function timeOf(value) {
    return value?.toMillis ? value.toMillis() : Number.MAX_SAFE_INTEGER;
}

export function listenPostCount(postId, postElement = document.querySelector(
    `.post-card-new[data-post-id="${postId}"]`
)) {
    if (!postElement) return () => {};

    let likersVersion = 0;

    const stopLikes = onSnapshot(
        collection(db, ...postSegments(postId), "likers"),
        async snapshot => {
            const counter = postElement.querySelector(".like-count");

            if (counter) counter.textContent = snapshot.size;

            const myUid = auth.currentUser?.uid;

            if (myUid && !snapshot.metadata.hasPendingWrites) {
                updateLikeIcon(postElement, snapshot.docs.some(likerDoc => likerDoc.id === myUid));
            }

            const version = ++likersVersion;

            const firstLikers = [...snapshot.docs]
                .sort((a, b) =>
                    timeOf(a.data({ serverTimestamps: "estimate" }).timestamp) -
                    timeOf(b.data({ serverTimestamps: "estimate" }).timestamp)
                )
                .slice(0, 2);

            const names = await Promise.all(firstLikers.map(likerDoc => getLikersName(likerDoc.id)));

            if (version !== likersVersion) return;

            renderLikersFooter(postElement, names, snapshot.size);
        },
        error => console.error("Erro ao observar curtidas:", error)
    );

    let commentsVersion = 0;

    const stopComments = onSnapshot(
        collection(db, ...postSegments(postId), "coments"),
        async snapshot => {
            const counter = postElement.querySelector(".comment-count");

            if (counter) counter.textContent = snapshot.size;

            const version = ++commentsVersion;

            const latest = snapshot.docs
                .map(commentDoc => ({
                    id: commentDoc.id,
                    ...commentDoc.data({ serverTimestamps: "estimate" })
                }))
                .sort((a, b) => timeOf(b.create) - timeOf(a.create))
                .slice(0, COMMENTS_PREVIEW_SIZE)
                .reverse();

            await renderCommentsPreview(postElement, latest, () => version === commentsVersion);
        },
        error => console.error("Erro ao observar comentários:", error)
    );

    return () => {
        stopLikes();
        stopComments();
    };
}
