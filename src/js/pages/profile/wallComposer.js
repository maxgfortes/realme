import { t } from "/src/i18n/i18n.js";
import { db } from "./firebase.js";
import { doc, collection, setDoc, serverTimestamp } from "./firestore.js";
import { $ } from "./dom.js";
import { state } from "./state.js";
import { getUserSummary } from "./userData.js";
import { getDisplayName } from "./format.js";
import { uploadMedia } from "/src/js/pages/feed/postCreation/imageUpload.js";
import {
  MAX_MEDIA,
  isVideoFile,
  selectMediaFiles,
  createMediaPreview,
  revokeMediaPreview,
  showMediaNotice
} from "/src/js/pages/feed/postCreation/videoUpload.js";

const MAX_TEXT = 500;
const CLOSE_MS = 300;

const area = $("wallCreationArea");
const overlay = $("wallCreationOverlay");
const panel = $("wallCreation");
const textInput = $("wallTextInput");
const previewArea = $("wallImagePreview");
const mediaButton = $("wallMediaInput");
const sendButton = $("sendWall");
const avatar = $("wallCreationModalPfp");
const nameElement = $("wallCreationName");

let selectedFiles = [];
let sending = false;
let closeTimer = null;
let targetUid = null;

function hasContent() {
  return textInput.value.trim().length > 0 || selectedFiles.length > 0;
}

function updateSendState() {
  sendButton.classList.toggle("disable", sending || !hasContent());
}

function resizeInput() {
  textInput.style.height = "auto";
  textInput.style.height = `${textInput.scrollHeight}px`;
}

function renderPreviews() {
  previewArea.querySelectorAll("img, video").forEach(revokeMediaPreview);

  previewArea.replaceChildren(
    ...selectedFiles.map((file, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = isVideoFile(file) ? "wall-img-preview video-preview" : "wall-img-preview";
      wrapper.dataset.index = index;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "wall-remove-image";
      remove.textContent = "×";

      wrapper.append(createMediaPreview(file), remove);

      return wrapper;
    })
  );

  mediaButton.disabled = selectedFiles.length >= MAX_MEDIA;
  updateSendState();
}

function resetComposer() {
  textInput.value = "";
  selectedFiles = [];
  renderPreviews();
  resizeInput();
}

async function fillAuthor() {
  if (!state.currentUserId) return;

  const summary = await getUserSummary(state.currentUserId);

  avatar.src = summary.photo;
  nameElement.textContent = summary.name;
}

export function openWallComposer(uid) {
  if (!area || !uid) return;

  clearTimeout(closeTimer);

  if (targetUid !== uid) resetComposer();

  targetUid = uid;

  const ownerName = getDisplayName(state.profileData?.user || {});

  textInput.placeholder = state.isOwnProfile
    ? t("wall.writeMessage")
    : t("profile.writeTo", { name: ownerName });

  fillAuthor().catch(error => console.error("Erro ao carregar autor do mural:", error));

  area.classList.add("active");
  overlay.classList.add("active");
  panel.classList.add("active");
  document.body.classList.add("scroll-locked");
  updateSendState();

  setTimeout(() => textInput.focus({ preventScroll: true }), CLOSE_MS);
}

export function closeWallComposer() {
  if (!area) return;

  textInput.blur();
  overlay.classList.remove("active");
  panel.classList.remove("active");
  document.body.classList.remove("scroll-locked");

  closeTimer = setTimeout(() => area.classList.remove("active"), CLOSE_MS);
}

async function pickImages() {
  const files = await selectMediaFiles(selectedFiles.length);

  if (!files.length) return;

  selectedFiles.push(...files.slice(0, MAX_MEDIA - selectedFiles.length));
  renderPreviews();
}

async function publish() {
  const authorId = state.currentUserId;
  const wallOwner = targetUid;
  const content = textInput.value.trim().slice(0, MAX_TEXT);

  if (sending || !authorId || !wallOwner || !hasContent()) return;

  sending = true;
  updateSendState();
  sendButton.textContent = t("wall.posting");

  try {
    const imgs = [];
    const files = selectedFiles.slice(0, MAX_MEDIA);

    for (const [index, file] of files.entries()) {
      imgs.push(await uploadMedia(file, fraction => {
        sendButton.textContent = t("wall.postingProgress", { percent: Math.round(((index + fraction) / files.length) * 100) });
      }));
    }

    await setDoc(doc(collection(db, "users", wallOwner, "wall")), {
      authorId,
      content,
      imgs,
      createdAt: serverTimestamp()
    });

    resetComposer();
    closeWallComposer();
  } catch (error) {
    console.error("Erro ao postar no mural:", error);
    showMediaNotice(error?.message || t("wall.postError"));
  } finally {
    sending = false;
    sendButton.textContent = t("wall.post");
    updateSendState();
  }
}

if (area) {
  overlay.addEventListener("click", closeWallComposer);
  mediaButton.addEventListener("click", pickImages);

  textInput.addEventListener("input", () => {
    resizeInput();
    updateSendState();
  });

  previewArea.addEventListener("click", event => {
    const remove = event.target.closest(".wall-remove-image");

    if (!remove) return;

    const index = Number(remove.closest(".wall-img-preview").dataset.index);

    selectedFiles.splice(index, 1);
    renderPreviews();
  });

  sendButton.addEventListener("click", publish);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && area.classList.contains("active")) closeWallComposer();
  });
}
