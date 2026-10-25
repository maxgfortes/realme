import { t } from "/src/i18n/i18n.js";
import { db, auth } from "../../../../config/config.js";
import { postSegments } from "./postPath.js";
import { submitReport } from "/src/shared/report.js";

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
                    <button class="alert-btn" id="cancelAlertBtn">${t("common.cancel")}</button>
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
        title.textContent = t("post.deleteTitle");
        text.textContent = t("post.deleteText");
        confirmBtn.textContent = t("common.delete");
    } else {
        title.textContent = t("post.reportTitle");
        text.textContent = t("post.reportText");
        confirmBtn.textContent = t("post.report");
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
            const postId = selectedPostId;

            confirmBtn.disabled = true;

            try {
                await submitReport("post", postSegments(postId).join("/"));
                text.textContent = t("report.sent");
            } catch (error) {
                console.error("Erro ao denunciar post:", error);
                text.textContent = t("report.error");
            }

            setTimeout(() => {
                confirmBtn.disabled = false;
                closeAlert();
            }, 1400);
            return;
        }

        try {
            confirmBtn.disabled = true;

            await deleteDoc(doc(db, ...postSegments(selectedPostId)));

            const postCard = document.querySelector(
                `.post-card-new[data-post-id="${CSS.escape(selectedPostId)}"]`
            );

            if (postCard) {
                postCard.classList.add("hidden");

                setTimeout(() => {
                    postCard.remove();
                }, 1000);
            }

            closeAlert();
        } catch (error) {

        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = t("common.delete");
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