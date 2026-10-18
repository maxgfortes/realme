import { t } from "/src/i18n/i18n.js";
import { db } from "../../../config/config.js";

import {
    collection,
    query,
    where,
    onSnapshot,
    getDocs,
    updateDoc,
    deleteDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { getUser } from "./getUser.js";

const requestsList = document.querySelector("#requestsList");
const requestsSub = document.querySelector(".see-requests-sub");
const requestsDot = document.querySelector(".new-request-dot");

let unsubscribeFriendRequests = null;

async function findRequests(fromUid, toUid) {

    const result = await getDocs(query(
        collection(db, "friendRequests"),
        where("from", "==", fromUid),
        where("to", "==", toUid)
    ));

    return result.docs;
}

export async function acceptFriendRequest(fromUid, meUid) {

    const requests = (await findRequests(fromUid, meUid))
        .filter(request => request.data().status === "pending");

    if (!requests.length) throw new Error("friend request not found");

    await Promise.all(requests.map(request => updateDoc(request.ref, {
        status: "accepted",
        acceptedAt: serverTimestamp()
    })));
}

export async function declineFriendRequest(fromUid, meUid) {

    const requests = [
        ...await findRequests(fromUid, meUid),
        ...await findRequests(meUid, fromUid)
    ];

    await Promise.all(requests.map(request => deleteDoc(request.ref)));
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
            <button class="accept-request-btn" type="button">${t("common.accept")}</button>
            <button class="decline-request-btn" type="button">${t("notif.decline")}</button>
        </div>
    `;

    const acceptButton = item.querySelector(".accept-request-btn");
    const declineButton = item.querySelector(".decline-request-btn");

    async function respond(action) {
        acceptButton.disabled = true;
        declineButton.disabled = true;

        try {
            await action(request.fromUid, meUid);
        } catch (error) {
            console.error(error);
            acceptButton.disabled = false;
            declineButton.disabled = false;
        }
    }

    acceptButton.addEventListener("click", () => respond(acceptFriendRequest));
    declineButton.addEventListener("click", () => respond(declineFriendRequest));

    return item;
}

async function renderFriendRequests(result, meUid) {

    const count = result.size;

    if (count > 0) {
        requestsDot.classList.add("active");
    } else {
        requestsDot.classList.remove("active");
    }

    requestsSub.textContent = count === 0
        ? t("notif.noPendingRequests")
        : t("notif.requestsCount", { count });

    requestsList.innerHTML = "";

    if (result.empty) {
        requestsList.innerHTML =
            `<div class="fr-empty"><p>${t("notif.noPendingRequests")}</p></div>`;
        return;
    }

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
    requestsSub.textContent = t("notif.noPendingRequests");
}