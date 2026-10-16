import { loadEvent } from "./loadEvent.js";

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