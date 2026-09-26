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

const textInput = document.getElementById('npTextInput');
const sendPost = document.getElementById('sendPost');

function updateSendButtonState() {
  const hasContent = textInput.value.trim().length > 0 || hasSelectedImages();
  sendPost.classList.toggle('disable', !hasContent);
}

export function clearInputs() {
  textInput.value = '';
  clearSelectedImages();
  updateSendButtonState();
}

export async function createPost() {
  const user = auth.currentUser;
  const content = textInput.value.trim();

  if (!content && !hasSelectedImages()) {
    return;
  }

  closeCreationModal();
  showProgress(20);

  try {
    const imgs = hasSelectedImages() ? await uploadSelectedImages() : [];

    showProgress(80);

    await addDoc(collection(db, 'posts'), {
      creatorid: user.uid,
      create: serverTimestamp(),
      content: content,
      imgs: imgs
    });

    showProgress(100);
    setTimeout(hideProgress, 1000);
    clearInputs();
  } catch (error) {
    hideProgress();
  }
}

textInput.addEventListener('input', updateSendButtonState);
onImagesChanged(updateSendButtonState);
updateSendButtonState();

sendPost.addEventListener('click', () => {
  if (sendPost.classList.contains('disable')) return;
  createPost();
});