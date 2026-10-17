import { loadEvent } from "./loadEvent.js";
import { auth } from "/src/config/config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const feedPage = document.getElementById("feedPage");
const eventLayer = document.getElementById("eventLayer");
const closeEventBtn = document.getElementById("closeEventBtn");

function openEvent(eventId) {
    if (!eventLayer) return;

    if (!eventId) return;

    eventLayer.dataset.eventId = eventId;
    eventLayer.classList.add("active");
    feedPage.classList.add("go-left");
    loadEvent(eventId);
}

export function closeEvent() {
    if (!eventLayer) return;
    
    eventLayer.classList.remove("active");
    feedPage.classList.remove("go-left");
}

document.addEventListener("click", event => {
    const eventCard = event.target.closest(".event-card");

    if (!eventCard) return;

    const postCard = eventCard.closest(".post-card-new");

    if (!postCard) return;

    const eventId = postCard.dataset.eventId;

    if (!eventId) return;

    openEvent(eventId);
});

if (closeEventBtn) {
    closeEventBtn.addEventListener("click", closeEvent);
}

const eventFromUrl = new URLSearchParams(location.search).get("event");

if (eventFromUrl) {
    const stopWaiting = onAuthStateChanged(auth, user => {
        if (!user) return;

        stopWaiting();
        openEvent(eventFromUrl);
    });
}