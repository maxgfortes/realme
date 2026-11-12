import { db, auth } from "../../config/config.js";

import {
    doc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const eventLayer = document.getElementById("eventLayer");

const ACTIONS = {
    noEvent: null,
    maybeEvent: "maybe",
    confirmEvent: "going"
};

const BUTTON_FOR_STATUS = {
    going: "confirmEvent",
    maybe: "maybeEvent"
};

export function markStatus(status) {
    const activeId = BUTTON_FOR_STATUS[status] || "noEvent";

    eventLayer
        ?.querySelectorAll(".event-act-btn")
        .forEach(button => {
            button.classList.toggle("active", button.id === activeId);
        });
}

let busy = false;

function setButtonsDisabled(disabled) {
    eventLayer
        ?.querySelectorAll(".event-act-btn")
        .forEach(button => {
            button.disabled = disabled;
        });
}

async function setAttendance(eventId, uid, status) {
    const goingRef = doc(db, "events", eventId, "going", uid);
    const maybeRef = doc(db, "events", eventId, "maybe", uid);

    const batch = writeBatch(db);

    if (status === "going") {
        batch.set(goingRef, { uid, createdAt: serverTimestamp() });
        batch.delete(maybeRef);
    } else if (status === "maybe") {
        batch.set(maybeRef, { uid, createdAt: serverTimestamp() });
        batch.delete(goingRef);
    } else {
        batch.delete(goingRef);
        batch.delete(maybeRef);
    }

    await batch.commit();
}

eventLayer?.addEventListener("click", async event => {
    const button = event.target.closest(".event-act-btn");

    if (!button || busy) return;

    const action = button.id;

    if (!(action in ACTIONS)) return;

    const eventId = eventLayer.dataset.eventId;
    const uid = auth.currentUser?.uid;

    if (!eventId || !uid) return;

    const previous = eventLayer.querySelector(".event-act-btn.active")?.id || "noEvent";

    busy = true;
    setButtonsDisabled(true);
    markStatus(ACTIONS[action]);

    try {
        await setAttendance(eventId, uid, ACTIONS[action]);
    } catch (error) {
        console.error("Erro ao atualizar presença no evento:", error);
        markStatus(ACTIONS[previous]);
    } finally {
        busy = false;
        setButtonsDisabled(false);
    }
});