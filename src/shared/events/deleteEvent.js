import { db, auth } from "../../config/config.js";

import {
    doc,
    collection,
    getDocs,
    writeBatch,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const ATTENDANCE_LISTS = ["going", "maybe"];

const BATCH_SIZE = 10;

let selectedEventId = null;
let actionType = null;
let busy = false;
let overlay = null;
let title = null;
let text = null;
let confirmBtn = null;
let cancelBtn = null;

function createAlert() {
    if (overlay) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="overlay-alert" id="overlayEventAlert">
            <div class="alert-box">
                <div class="alert-area">
                    <div class="alert-title"></div>
                    <div class="alert-text"></div>
                </div>
                <div class="alert-actions">
                    <button class="alert-btn" id="cancelEventAlertBtn">Cancelar</button>
                    <button class="alert-btn critic-btn" id="confirmEventAlertBtn"></button>
                </div>
            </div>
        </div>
    `);

    overlay = document.getElementById("overlayEventAlert");
    title = overlay.querySelector(".alert-title");
    text = overlay.querySelector(".alert-text");
    confirmBtn = overlay.querySelector("#confirmEventAlertBtn");
    cancelBtn = overlay.querySelector("#cancelEventAlertBtn");

    setupAlert();
}

function showAlert(type, eventId) {
    createAlert();

    selectedEventId = eventId;
    actionType = type;

    confirmBtn.disabled = false;
    cancelBtn.disabled = false;

    if (type === "delete") {
        title.textContent = "Apagar Evento";
        text.textContent = "Deseja mesmo apagar esse evento? Quem confirmou presença deixará de vê-lo.";
        confirmBtn.textContent = "Apagar";
    } else {
        title.textContent = "Denunciar Evento";
        text.textContent = "Deseja mesmo denunciar esse evento?";
        confirmBtn.textContent = "Denunciar";
    }

    overlay.classList.add("active");
}

function closeAlert() {
    overlay.classList.remove("active");
    selectedEventId = null;
    actionType = null;
}

async function deleteAttendance(eventId) {
    for (const listName of ATTENDANCE_LISTS) {
        const snapshot = await getDocs(collection(db, "events", eventId, listName));

        const chunks = [];

        for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
            chunks.push(snapshot.docs.slice(i, i + BATCH_SIZE));
        }

        await Promise.all(chunks.map(async chunk => {
            const batch = writeBatch(db);

            chunk.forEach(item => batch.delete(item.ref));

            await batch.commit();
        }));
    }
}

async function deleteEvent(eventId) {
    await deleteAttendance(eventId);
    await deleteDoc(doc(db, "events", eventId));
}

function removeEventCard(eventId) {
    const card = document.querySelector(
        `.post-card-new[data-event-id="${CSS.escape(eventId)}"]`
    );

    if (!card) return;

    card.classList.add("hidden");

    setTimeout(() => card.remove(), 1000);
}

function setupAlert() {
    cancelBtn.addEventListener("click", closeAlert);

    confirmBtn.addEventListener("click", async () => {
        if (!selectedEventId || busy) return;

        if (actionType === "report") {
            closeAlert();
            return;
        }

        const eventId = selectedEventId;

        busy = true;
        confirmBtn.disabled = true;
        cancelBtn.disabled = true;

        try {
            await deleteEvent(eventId);

            removeEventCard(eventId);
            closeAlert();
        } catch (error) {
            console.error("Erro ao apagar evento:", error);

            text.textContent = "Não foi possível apagar o evento. Tente novamente.";
            confirmBtn.textContent = "Tentar de novo";
        } finally {
            busy = false;
            confirmBtn.disabled = false;
            cancelBtn.disabled = false;
        }
    });
}

document.addEventListener("click", event => {
    const button = event.target.closest(".post-more");

    if (!button) return;

    const eventId = button.dataset.eventId;

    if (!eventId) return;

    const user = auth.currentUser;

    if (!user) return;

    showAlert(
        user.uid === button.dataset.creatorId ? "delete" : "report",
        eventId
    );
});