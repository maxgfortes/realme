import { t, formatDate as formatIntlDate } from "/src/i18n/i18n.js";
import { db } from "/src/config/config.js";
import { doc, updateDoc, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { uploadBanner } from "/src/js/pages/feed/postCreation/imageUpload.js";
import { getActiveEvent } from "./loadEvent.js";

const LIMITS = { title: 50, description: 500, location: 80 };

const layer = document.getElementById("eventLayer");
const closeButton = document.getElementById("closeEventBtn");
const cancelButton = document.getElementById("cancelEventEditBtn");
const editButton = document.getElementById("editEventBtn");
const saveButton = document.getElementById("saveEventEditBtn");
const bannerButton = document.getElementById("eventBannerEditBtn");
const bannerInput = document.getElementById("eventBannerEditInput");
const banner = document.getElementById("eventLayerBanner");

const fields = {
    title: document.getElementById("eventLayerTitle"),
    description: document.getElementById("eventLayerSub"),
    date: document.getElementById("eventLayerDate"),
    location: document.getElementById("eventLayerLocation")
};

let editing = null;
let saving = false;
let isOwner = false;

function pad(value) {
    return String(value).padStart(2, "0");
}

function toLocalInput(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setButtons() {
    const active = Boolean(editing);

    editButton?.classList.toggle("active", isOwner && !active);
    saveButton?.classList.toggle("active", active);
    cancelButton?.classList.toggle("active", active);
    closeButton?.classList.toggle("hidden-by-edit", active);

    if (saveButton) saveButton.disabled = saving;
}

function makeInput(container, { type = "text", value = "", max = 0, multiline = false }) {
    const input = document.createElement(multiline ? "textarea" : "input");

    input.className = "event-edit-input";
    input.value = value;

    if (!multiline) input.type = type;
    if (max) input.maxLength = max;
    if (multiline) input.rows = 3;

    container.replaceChildren(input);

    return input;
}

function showError(message) {
    let error = layer.querySelector(".event-edit-error");

    if (!error) {
        error = document.createElement("div");
        error.className = "event-edit-error";
        layer.querySelector(".event-infos")?.prepend(error);
    }

    error.textContent = message;
    error.hidden = !message;
}

function enterEdit() {
    const active = getActiveEvent();

    if (!active || !isOwner || editing) return;

    const data = active.data;
    const date = data.eventDate?.toDate?.() || new Date(Date.now() + 86400000);

    editing = {
        eventId: active.id,
        original: data,
        bannerFile: null,
        bannerPreview: "",
        inputs: {
            title: makeInput(fields.title, { value: data.eventTitle || "", max: LIMITS.title }),
            description: makeInput(fields.description, { value: data.eventDescription || "", max: LIMITS.description, multiline: true }),
            date: makeInput(fields.date, { type: "datetime-local", value: toLocalInput(date) }),
            location: makeInput(fields.location, { value: data.eventLocation || "", max: LIMITS.location })
        }
    };

    editing.inputs.date.min = toLocalInput(new Date());

    layer.classList.add("editing");
    showError("");
    setButtons();
    editing.inputs.title.focus();
}

function restoreView() {
    const original = editing?.original;

    if (editing?.bannerPreview) URL.revokeObjectURL(editing.bannerPreview);

    editing = null;
    layer.classList.remove("editing");
    showError("");
    setButtons();

    if (!original) return;

    fields.title.textContent = original.eventTitle || t("events.untitled");
    fields.description.textContent = original.eventDescription || t("events.noDescription");
    fields.location.textContent = original.eventLocation || t("events.noLocation");
    fields.date.textContent = original.eventDate?.toDate
        ? formatIntlDate(original.eventDate.toDate(), { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : t("events.noDate");

    if (banner && original.eventBanner) banner.src = original.eventBanner;
}

function readForm() {
    const { inputs, original } = editing;

    const title = inputs.title.value.trim();
    const description = inputs.description.value.trim();
    const location = inputs.location.value.trim();
    const dateValue = inputs.date.value ? new Date(inputs.date.value) : null;

    if (!title || title.length > LIMITS.title) return { error: t("events.editor.errorTitle") };
    if (description.length > LIMITS.description) return { error: t("events.editor.errorDescription") };
    if (!location || location.length > LIMITS.location) return { error: t("events.editor.errorLocation") };
    if (!dateValue || Number.isNaN(dateValue.getTime())) return { error: t("events.editor.errorDate") };

    const originalMs = original.eventDate?.toMillis?.() || 0;
    const sameDate = Math.abs(dateValue.getTime() - originalMs) < 60000;

    if (!sameDate && dateValue.getTime() <= Date.now()) return { error: t("events.editor.errorDate") };

    return {
        update: {
            eventTitle: title,
            eventDescription: description,
            eventLocation: location,
            eventDate: sameDate ? original.eventDate : Timestamp.fromDate(dateValue)
        }
    };
}

async function save() {
    if (!editing || saving) return;

    const { error, update } = readForm();

    if (error) {
        showError(error);
        return;
    }

    saving = true;
    setButtons();
    showError("");
    layer.classList.add("saving");

    try {
        if (editing.bannerFile) {
            const uploaded = await uploadBanner(editing.bannerFile);
            update.eventBanner = uploaded.url;
        }

        await updateDoc(doc(db, "events", editing.eventId), update);

        editing.original = { ...editing.original, ...update };
        restoreView();
    } catch (saveError) {
        console.error("Erro ao salvar evento:", saveError);
        showError(t("events.editor.errorSave"));
    } finally {
        saving = false;
        layer.classList.remove("saving");
        setButtons();
    }
}

function pickBanner() {
    if (!editing) return;
    bannerInput?.click();
}

function onBannerChosen() {
    const file = bannerInput.files?.[0];
    bannerInput.value = "";

    if (!file || !editing) return;

    if (editing.bannerPreview) URL.revokeObjectURL(editing.bannerPreview);

    editing.bannerFile = file;
    editing.bannerPreview = URL.createObjectURL(file);
    banner.src = editing.bannerPreview;
}

if (layer && editButton && saveButton && cancelButton) {
    editButton.addEventListener("click", enterEdit);
    saveButton.addEventListener("click", save);
    cancelButton.addEventListener("click", restoreView);
    bannerButton?.addEventListener("click", pickBanner);
    bannerInput?.addEventListener("change", onBannerChosen);

    closeButton?.addEventListener("click", () => {
        if (editing) restoreView();
    });

    document.addEventListener("realme:event-ownership", event => {
        isOwner = Boolean(event.detail?.isOwner);
        if (!isOwner && editing) restoreView();
        setButtons();
    });

    setButtons();
}
