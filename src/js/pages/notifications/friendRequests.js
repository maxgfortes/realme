import { db } from "../../../config/config.js";

import {
    collection,
    query,
    where,
    getDocs,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { getUser } from "./getUser.js";


const requestsList = document.querySelector("#requestsList");
const requestsSub = document.querySelector(".see-requests-sub");
const requestsDot = document.querySelector(".new-request-dot");


export async function acceptFriendRequest(fromUid, meUid) {

    const requestReference =
        doc(db, "friendRequests", fromUid + "_" + meUid);

    await updateDoc(requestReference, {
        status: "accepted"
    });
}


export async function declineFriendRequest(fromUid, meUid) {

    const requestReferenceOne =
        doc(db, "friendRequests", fromUid + "_" + meUid);

    const requestReferenceTwo =
        doc(db, "friendRequests", meUid + "_" + fromUid);

    await deleteDoc(requestReferenceOne);
    await deleteDoc(requestReferenceTwo);
}


function createRequestItem(request, meUid) {

    const item = document.createElement("div");

    item.classList.add("request-item");

    item.innerHTML = `
        <div class="request-item-left">
            <div class="request-item-pfp">
                <img src="${request.userphoto}" >
            </div>
            <div class="request-item-info">
                <div class="request-item-name">${request.username}</div>
                <div class="request-item-username">${request.handle ? "" + request.handle : ""}</div>
            </div>
        </div>
        <div class="request-item-right">
            <button class="accept-request-btn" type="button">Aceitar</button>
            <button class="decline-request-btn" type="button">Excluir</button>
        </div>
    `;

    const acceptButton = item.querySelector(".accept-request-btn");
    const declineButton = item.querySelector(".decline-request-btn");

    acceptButton.addEventListener("click", async function() {
        acceptButton.disabled = true;
        declineButton.disabled = true;
        await acceptFriendRequest(request.fromUid, meUid);
        item.remove();
        updateFriendRequestsBadge(meUid);
    });

    declineButton.addEventListener("click", async function() {
        acceptButton.disabled = true;
        declineButton.disabled = true;
        await declineFriendRequest(request.fromUid, meUid);
        item.remove();
        updateFriendRequestsBadge(meUid);
    });

    return item;
}


export async function loadFriendRequests(meUid) {

    requestsList.innerHTML = "";

    const requestsReference = collection(db, "friendRequests");

    const requestsQuery = query(
        requestsReference,
        where("to", "==", meUid),
        where("status", "==", "pending")
    );

    const result = await getDocs(requestsQuery);

    if (result.empty) {
        requestsList.innerHTML =
            `<div class="fr-empty"><p>Nenhum pedido pendente</p></div>`;
        return;
    }

    for (const requestDocument of result.docs) {

        const requestData = requestDocument.data();

        const user = await getUser(requestData.from);

        const request = {
            fromUid: requestData.from,
            username: user.username,
            handle: user.handle,
            userphoto: user.userphoto
        };

        const requestItem = createRequestItem(request, meUid);

        requestsList.appendChild(requestItem);
    }
}


export async function updateFriendRequestsBadge(meUid) {

    const requestsReference = collection(db, "friendRequests");

    const requestsQuery = query(
        requestsReference,
        where("to", "==", meUid),
        where("status", "==", "pending")
    );

    const result = await getDocs(requestsQuery);

    const count = result.size;

    if (count > 0) {
        requestsDot.style.display = "block";
    } else {
        requestsDot.style.display = "none";
    }

    if (count === 0) {
        requestsSub.textContent = "Nenhum pedido pendente";
        return;
    }

    if (count === 1) {
        requestsSub.textContent = "1 pedido de amizade";
        return;
    }

    requestsSub.textContent = count + " pedidos de amizade";
}