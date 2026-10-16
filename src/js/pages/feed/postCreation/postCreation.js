import { auth, db } from "../../../../config/config.js";
import {
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { closeCreationModal } from './open-creation-modal.js';
import { showProgress, hideProgress } from './progressBar.js';
import {
  uploadSelectedImages,
  hasSelectedImages,
  clearSelectedImages,
  onImagesChanged
} from './imageUpload.js';
import { getSelectedMentions, clearMentions } from './mentionPicker.js';
import { getSelectedMusicUrl, clearMusic, onMusicChanged } from './musicPicker.js';
import { getLocationText, clearLocation } from './locationPicker.js';

const textInput = document.getElementById('npTextInput');
const sendPost = document.getElementById('sendPost');

function updateSendButtonState() {
  const hasContent =
    textInput.value.trim().length > 0 ||
    hasSelectedImages() ||
    Boolean(getSelectedMusicUrl());
  sendPost.classList.toggle('disable', !hasContent);
}

export function clearInputs() {
  textInput.value = '';
  clearSelectedImages();
  clearMentions();
  clearMusic();
  clearLocation();
  updateSendButtonState();
}

export async function createPost() {
  const user = auth.currentUser;
  const content = textInput.value.trim();

  const mentions = getSelectedMentions();
  const music = getSelectedMusicUrl();
  const location = getLocationText();

  if (!content && !hasSelectedImages() && !music) {
    return;
  }

  closeCreationModal();
  showProgress(20);

  try {
    const imgs = hasSelectedImages() ? await uploadSelectedImages() : [];

    showProgress(80);

    const postData = {
      creatorid: user.uid,
      create: serverTimestamp(),
      content: content,
      imgs: imgs
    };

    if (mentions.length) postData.mentions = mentions;
    if (music) postData.music = music;
    if (location) postData.location = location;

    await addDoc(collection(db, 'posts'), postData);

    showProgress(100);
    setTimeout(hideProgress, 1000);
    clearInputs();
  } catch (error) {
    hideProgress();
  }
}

textInput.addEventListener('input', updateSendButtonState);
onImagesChanged(updateSendButtonState);
onMusicChanged(updateSendButtonState);
updateSendButtonState();

sendPost.addEventListener('click', () => {
  if (sendPost.classList.contains('disable')) return;
  createPost();
});