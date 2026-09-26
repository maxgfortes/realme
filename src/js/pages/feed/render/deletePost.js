import { db, auth } from "../../../../config/config.js";

import {
    doc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

let selectedPostId = null;
let actionType = null;
let overlay = null;
let title = null;
let text = null;
let confirmBtn = null;
let cancelBtn = null;

function createAlert() {
    if (overlay) return;

    document.body.insertAdjacentHTML("beforeend", `
        <div class="overlay-alert" id="overlayAlert">
            <div class="alert-box">
                <div class="alert-area">
                    <div class="alert-title"></div>
                    <div class="alert-text"></div>
                </div>
                <div class="alert-actions">
                    <button class="alert-btn" id="cancelAlertBtn">Cancelar</button>
                    <button class="alert-btn critic-btn" id="confirmAlertBtn"></button>
                </div>
            </div>
        </div>
    `);

    overlay = document.querySelector(".overlay-alert");
    title = overlay.querySelector(".alert-title");
    text = overlay.querySelector(".alert-text");
    confirmBtn = overlay.querySelector("#confirmAlertBtn");
    cancelBtn = overlay.querySelector("#cancelAlertBtn");

    setupAlert();
}

function showAlert(type, postId) {
    createAlert();

    selectedPostId = postId;
    actionType = type;

    if (type === "delete") {
        title.textContent = "Apagar Post";
        text.textContent = "Deseja mesmo apagar esse post?";
        confirmBtn.textContent = "Apagar";
    } else {
        title.textContent = "Denunciar Post";
        text.textContent = "Deseja mesmo denunciar esse post?";
        confirmBtn.textContent = "Denunciar";
    }

    overlay.classList.add("active");
}

function closeAlert() {
    overlay.classList.remove("active");
    selectedPostId = null;
    actionType = null;
}

function setupAlert() {
    cancelBtn.addEventListener("click", closeAlert);

    confirmBtn.addEventListener("click", async () => {
        if (!selectedPostId) return;

        if (actionType === "report") {
            closeAlert();
            return;
        }

        try {
            confirmBtn.disabled = true;

            await deleteDoc(doc(db, "posts", selectedPostId));

            const postCard = document.querySelector(
                `.post-card-new[data-post-id="${CSS.escape(selectedPostId)}"]`
            );

            if (postCard) postCard.remove();

            closeAlert();
        } catch (error) {

        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Apagar";
        }
    });
}

document.addEventListener("click", event => {
    const button = event.target.closest(".post-more");

    if (!button) return;

    const postId = button.dataset.postId;
    const creatorId = button.dataset.creatorId;
    const user = auth.currentUser;

    if (!user) return;

    showAlert(
        user.uid === creatorId ? "delete" : "report",
        postId
    );
});