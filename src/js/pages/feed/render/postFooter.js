import { db } from "../../../../config/config.js";

import {
    collection,
    query,
    orderBy,
    limit,
    getDocs,
    getCountFromServer,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";


async function getLikersName(uid) {

    const userRef = doc(db, "users", uid);

    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
        return "Usuário";
    }

    const userData = userSnapshot.data();

    const name = userData.name || "";
    const surname = userData.surname || "";

    return `${name} ${surname}`.trim();
}


async function getPostLikers(postId) {

    const likersRef = collection(
        db,
        "posts",
        postId,
        "likers"
    );

    const likersQuery = query(
        likersRef,
        orderBy("timestamp", "asc"),
        limit(2)
    );

    const likersSnapshot = await getDocs(likersQuery);

    const names = await Promise.all(
        likersSnapshot.docs.map(likerDoc =>
            getLikersName(likerDoc.id)
        )
    );

    const totalSnapshot = await getCountFromServer(likersRef);

    const total = totalSnapshot.data().count;

    return {
        names,
        total
    };
}


function renderLikersFooter(postElement, names, total) {

    const footerText = postElement.querySelector(
        ".post-graph-text"
    );

    if (!footerText) return;

    footerText.replaceChildren();

    if (total === 0) {
        return;
    }

    footerText.append(
        document.createTextNode("Curtido por ")
    );

    const firstUser = document.createElement("span");

    firstUser.textContent = names[0];

    footerText.append(firstUser);


    if (total === 1) {
        return;
    }


    if (total === 2) {

        footerText.append(
            document.createTextNode(" e ")
        );

        const secondUser = document.createElement("span");

        secondUser.textContent = names[1];

        footerText.append(secondUser);

        return;
    }


    footerText.append(
        document.createTextNode(", ")
    );

    const secondUser = document.createElement("span");

    secondUser.textContent = names[1];

    footerText.append(secondUser);


    const others = document.createTextNode(
        ` e outras ${total - 2} pessoas`
    );

    footerText.append(others);
}


export async function updatePostFooter(postId) {

    const postElement = document.querySelector(
        `.post-card-new[data-post-id="${postId}"]`
    );

    if (!postElement) return;

    const { names, total } = await getPostLikers(postId);

    renderLikersFooter(
        postElement,
        names,
        total
    );
}