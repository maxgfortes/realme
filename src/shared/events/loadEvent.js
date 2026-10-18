import { t, formatDate as formatIntlDate } from "/src/i18n/i18n.js";
import { db, auth } from "../../config/config.js";
import "./actionsEvent.js";
import "./deleteEvent.js";

import {
    collection,
    getDoc,
    doc,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const eventLayerBanner = document.getElementById("eventLayerBanner");
const eventLayerTitle = document.getElementById("eventLayerTitle");
const eventLayerSub = document.getElementById("eventLayerSub");
const eventLayerDate = document.getElementById("eventLayerDate");
const eventLayerLocation = document.getElementById("eventLayerLocation");

const eventRowGoing = document.getElementById("eventRowGoing");
const eventRowMaybe = document.getElementById("eventRowMaybe");

const DEFAULT_PFP = "./public/img/default.jpg";
const DEFAULT_BANNER = "./public/img/event.png";

let activeEventId = null;
let currentLoadId = 0;
let eventUnsubscribe = null;
let goingUnsubscribe = null;
let maybeUnsubscribe = null;

const userUnsubscribers = new Map();
const participantData = new Map();
const participantCache = new Map();

const participantLists = {
    going: new Set(),
    maybe: new Set()
};

const listReady = {
    going: false,
    maybe: false
};

function stopUserListeners() {
    for (const unsubscribe of userUnsubscribers.values()) {
        unsubscribe();
    }

    userUnsubscribers.clear();
    participantData.clear();
    participantCache.clear();

    participantLists.going.clear();
    participantLists.maybe.clear();

    listReady.going = false;
    listReady.maybe = false;
}

function stopEventListeners() {
    eventUnsubscribe?.();
    goingUnsubscribe?.();
    maybeUnsubscribe?.();

    eventUnsubscribe = null;
    goingUnsubscribe = null;
    maybeUnsubscribe = null;

    stopUserListeners();
}

export function loadEvent(eventId) {
    if (!eventId) return;

    if (activeEventId === eventId && eventUnsubscribe) {
        return;
    }

    stopEventListeners();

    activeEventId = eventId;
    const loadId = ++currentLoadId;

    clearEventFields();

    eventUnsubscribe = onSnapshot(
        doc(db, "events", eventId),
        snapshot => {
            if (loadId !== currentLoadId) return;

            if (!snapshot.exists()) {
                console.error("Evento não encontrado:", eventId);
                clearEventFields();
                return;
            }

            const data = snapshot.data();

            if (eventLayerTitle) {
                eventLayerTitle.textContent = data.eventTitle || t("events.untitled");
            }

            if (eventLayerSub) {
                eventLayerSub.textContent = data.eventDescription || t("events.noDescription");
            }

            if (eventLayerLocation) {
                eventLayerLocation.textContent = data.eventLocation || t("events.noLocation");
            }

            if (eventLayerDate) {
                eventLayerDate.textContent = data.eventDate?.toDate
                    ? formatIntlDate(data.eventDate.toDate(), {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit"
                    })
                    : t("events.noDate");
            }

            if (eventLayerBanner) {
                eventLayerBanner.src =
                    data.eventBanner || DEFAULT_BANNER;

                eventLayerBanner.alt =
                    data.eventTitle || t("events.bannerAlt");
            }
        },
        error => console.error(error)
    );

    goingUnsubscribe = onSnapshot(
        collection(db, "events", eventId, "going"),
        snapshot => {
            if (loadId !== currentLoadId) return;

            updateParticipantList("going", snapshot, loadId);
        },
        error => console.error("Erro ao ouvir going:", error)
    );

    maybeUnsubscribe = onSnapshot(
        collection(db, "events", eventId, "maybe"),
        snapshot => {
            if (loadId !== currentLoadId) return;

            updateParticipantList("maybe", snapshot, loadId);
        },
        error => console.error("Erro ao ouvir maybe:", error)
    );
}

async function updateParticipantList(status, snapshot, loadId) {
    if (loadId !== currentLoadId) return;

    participantLists[status] = new Set(
        snapshot.docs.map(item => item.id)
    );

    listReady[status] = true;

    const allUids = new Set([
        ...participantLists.going,
        ...participantLists.maybe
    ]);

    for (const uid of allUids) {
        if (!userUnsubscribers.has(uid)) {
            listenToParticipant(uid, loadId);
        }
    }

    for (const uid of [...userUnsubscribers.keys()]) {
        if (!allUids.has(uid)) {
            userUnsubscribers.get(uid)?.();
            userUnsubscribers.delete(uid);
            participantData.delete(uid);
            participantCache.delete(uid);
        }
    }

    renderAllLists(loadId);
}

function listenToParticipant(uid, loadId) {
    const currentUid = auth.currentUser?.uid;

    const userState = {
        profile: null,
        photo: DEFAULT_PFP,
        friend: false,
        profileReady: false,
        photoReady: false,
        friendReady: !currentUid || currentUid === uid
    };

    if (userState.friendReady) {
        userState.friend = false;
    }

    participantData.set(uid, userState);

    const unsubscribers = [];

    unsubscribers.push(
        onSnapshot(
            doc(db, "users", uid),
            snapshot => {
                if (loadId !== currentLoadId) return;

                userState.profileReady = true;
                userState.profile = snapshot.exists()
                    ? snapshot.data()
                    : null;

                renderAllLists(loadId);
            },
            error => {
                console.error("Erro ao ouvir perfil:", uid, error);
                userState.profileReady = true;
                renderAllLists(loadId);
            }
        )
    );

    unsubscribers.push(
        onSnapshot(
            doc(db, "users", uid, "user-infos", "user-media"),
            snapshot => {
                if (loadId !== currentLoadId) return;

                const media = snapshot.exists()
                    ? snapshot.data()
                    : {};

                userState.photo = media.userphoto || DEFAULT_PFP;
                userState.photoReady = true;

                renderAllLists(loadId);
            },
            error => {
                console.error("Erro ao ouvir foto:", uid, error);
                userState.photo = DEFAULT_PFP;
                userState.photoReady = true;
                renderAllLists(loadId);
            }
        )
    );

    if (currentUid && currentUid !== uid) {
        unsubscribers.push(
            onSnapshot(
                doc(db, "users", currentUid, "friends", uid),
                snapshot => {
                    if (loadId !== currentLoadId) return;

                    userState.friend = snapshot.exists();
                    userState.friendReady = true;

                    renderAllLists(loadId);
                },
                error => {
                    console.error("Erro ao ouvir amizade:", uid, error);
                    userState.friend = false;
                    userState.friendReady = true;
                    renderAllLists(loadId);
                }
            )
        );
    }

    userUnsubscribers.set(uid, () => {
        unsubscribers.forEach(unsubscribe => unsubscribe());
    });
}

function getParticipantFromState(uid) {
    const state = participantData.get(uid);

    if (!state || !state.profileReady || !state.photoReady) {
        return null;
    }

    if (!state.profile) return null;

    const user = state.profile;

    const firstName = user.Name ?? user.name ?? "";
    const surname = user.Surname ?? user.surname ?? "";

    return {
        uid,
        name: `${firstName} ${surname}`.trim() || t("common.user"),
        photo: state.photo || DEFAULT_PFP,
        friend: state.friend
    };
}

function renderAllLists(loadId) {
    if (loadId !== currentLoadId) return;

    renderList("going", eventRowGoing);
    renderList("maybe", eventRowMaybe);
}

function renderList(status, container) {
    if (!container || !listReady[status]) return;

    const users = [...participantLists[status]]
        .map(uid => getParticipantFromState(uid))
        .filter(Boolean);

    users.sort((a, b) =>
        Number(b.friend) - Number(a.friend) ||
        a.name.localeCompare(b.name, "pt-BR")
    );

    const fragment = document.createDocumentFragment();

    for (const user of users) {
        fragment.appendChild(createParticipantElement(user));
    }

    container.replaceChildren(fragment);
}

function createParticipantElement(user) {
    const link = document.createElement("a");

    link.href = `/profile.html?uid=${encodeURIComponent(user.uid)}`;
    link.className = "user-event-box";

    const photoArea = document.createElement("div");
    photoArea.className = "user-pfp-area";

    const img = document.createElement("img");
    img.src = user.photo;
    img.alt = user.name;
    img.loading = "lazy";

    img.onerror = () => {
        img.onerror = null;
        img.src = DEFAULT_PFP;
    };

    photoArea.appendChild(img);

    const infos = document.createElement("div");
    infos.className = "user-event-infos";

    const name = document.createElement("div");
    name.className = "user-event-name";
    name.textContent = user.name;

    infos.appendChild(name);
    link.append(photoArea, infos);

    if (user.friend) {
        const social = document.createElement("div");
        social.className = "user-event-social";

        const badge = document.createElement("div");
        badge.className = "is-friend-badge";
        badge.textContent = t("events.badgeFriend");

        const arrow = document.createElement("div");
        arrow.className = "user-event-arrow";

        arrow.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg"
                 viewBox="0 0 298 511.93">
                <path d="M285.77 441c16.24 16.17 16.32 42.46.15 58.7-16.16 16.24-42.45 16.32-58.69.16l-215-214.47c-16.24-16.16-16.32-42.45-.15-58.69L227.23 12.08c16.24-16.17 42.53-16.09 58.69.15 16.17 16.24 16.09 42.54-.15 58.7l-185.5 185.04L285.77 441z"/>
            </svg>
        `;

        social.append(badge, arrow);
        link.appendChild(social);
    }

    return link;
}

export function loadEventParticipants(eventId) {
    if (eventId) loadEvent(eventId);
}

function clearEventFields() {
    if (eventLayerTitle) eventLayerTitle.textContent = "";
    if (eventLayerSub) eventLayerSub.textContent = "";
    if (eventLayerDate) eventLayerDate.textContent = "";
    if (eventLayerLocation) eventLayerLocation.textContent = "";

    if (eventLayerBanner) {
        eventLayerBanner.removeAttribute("src");
        eventLayerBanner.alt = "";
    }

    if (eventRowGoing) eventRowGoing.replaceChildren();
    if (eventRowMaybe) eventRowMaybe.replaceChildren();
}

export function clearEventLayer() {
    currentLoadId++;
    activeEventId = null;

    stopEventListeners();
    clearEventFields();
}