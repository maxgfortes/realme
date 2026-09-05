import { db } from "../../../config/config.js";

import {
    collection,
    query,
    where,
    onSnapshot,
    doc,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { getUser } from "./getUser.js";


const requestsList = document.querySelector("#requestsList");
const requestsSub = document.querySelector(".see-requests-sub");
const requestsDot = document.querySelector(".new-request-dot");


let unsubscribeFriendRequests = null;


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

    // Não precisa mais remover o item nem atualizar o badge na mão:
    // a escrita no Firestore já dispara o onSnapshot abaixo, que
    // re-renderiza a lista e o badge sozinho.
    acceptButton.addEventListener("click", async function() {
        acceptButton.disabled = true;
        declineButton.disabled = true;
        await acceptFriendRequest(request.fromUid, meUid);
    });

    declineButton.addEventListener("click", async function() {
        acceptButton.disabled = true;
        declineButton.disabled = true;
        await declineFriendRequest(request.fromUid, meUid);
    });

    return item;
}


async function renderFriendRequests(result, meUid) {

    const count = result.size;

    if (count > 0) {
        requestsDot.classList.add("active");
    } else {
        requestsDot.classList.remove("active");
    }

    if (count === 0) {
        requestsSub.textContent = "Nenhum pedido pendente";
    } else if (count === 1) {
        requestsSub.textContent = "1 pedido de amizade";
    } else {
        requestsSub.textContent = count + " pedidos de amizade";
    }

    requestsList.innerHTML = "";

    if (result.empty) {
        requestsList.innerHTML =
            `<div class="fr-empty"><p>Nenhum pedido pendente</p></div>`;
        return;
    }

    // Resolve todos os usuários dos pedidos em paralelo.
    const requests = await Promise.all(
        result.docs.map(async function(requestDocument) {

            const requestData = requestDocument.data();

            const user = await getUser(requestData.from);

            return {
                fromUid: requestData.from,
                username: user.username,
                handle: user.handle,
                userphoto: user.userphoto
            };
        })
    );

    for (const request of requests) {

        const requestItem = createRequestItem(request, meUid);

        requestsList.appendChild(requestItem);
    }
}


export function subscribeFriendRequests(meUid) {

    if (unsubscribeFriendRequests) {
        unsubscribeFriendRequests();
        unsubscribeFriendRequests = null;
    }

    const requestsReference = collection(db, "friendRequests");

    const requestsQuery = query(
        requestsReference,
        where("to", "==", meUid),
        where("status", "==", "pending")
    );

    unsubscribeFriendRequests = onSnapshot(
        requestsQuery,
        function(result) {
            renderFriendRequests(result, meUid);
        }
    );
}


export function unsubscribeFriendRequestsListener() {

    if (unsubscribeFriendRequests) {
        unsubscribeFriendRequests();
        unsubscribeFriendRequests = null;
    }

    requestsList.innerHTML = "";
    requestsDot.classList.remove("active");
    requestsSub.textContent = "Nenhum pedido pendente";
}