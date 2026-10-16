import { db, auth } from "../../config/config.js";

import {
    doc,
    writeBatch,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { closeEvent } from "./openEvent.js";

const eventLayer = document.getElementById("eventLayer");

const ACTIONS = {
    confirm: "going",
    maybe: "maybe",
    no: null
};

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

    const action = Object.keys(ACTIONS).find(name =>
        button.classList.contains(name)
    );

    if (!action) return;

    const eventId = eventLayer.dataset.eventId;
    const uid = auth.currentUser?.uid;

    if (!eventId || !uid) return;

    busy = true;
    setButtonsDisabled(true);

    try {
        await setAttendance(eventId, uid, ACTIONS[action]);

        if (action === "no") closeEvent();
    } catch (error) {
        console.error("Erro ao atualizar presença no evento:", error);
    } finally {
        busy = false;
        setButtonsDisabled(false);
    }
});