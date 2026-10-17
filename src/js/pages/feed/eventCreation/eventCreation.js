import { auth, db } from "../../../../config/config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { closeCreationModal } from '../postCreation/open-creation-modal.js';
import { showProgress, hideProgress } from '../postCreation/progressBar.js';
import { uploadBanner } from '../postCreation/imageUpload.js';
import { getSelectedBannerFile, resetEventBanner } from './loadBannerPreview.js';

const titleInput = document.getElementById('eventTitleInput');
const descriptionInput = document.getElementById('eventDescriptionInput');
const locationInput = document.getElementById('eventLocationInput');
const dateInput = document.getElementById('eventDateInput');
const sendEvent = document.getElementById('sendEvent');

const MIN_DATE_REFRESH_MS = 30 * 1000;

function toLocalInputValue(date) {
  const pad = value => String(value).padStart(2, '0');

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function refreshMinDate() {
  const now = new Date();

  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + 1);

  dateInput.min = toLocalInputValue(now);
}

function isFutureDate(value) {
  if (!value) return false;

  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function isFormValid() {
  return Boolean(
    titleInput.value.trim() &&
    locationInput.value.trim() &&
    isFutureDate(dateInput.value) &&
    getSelectedBannerFile()
  );
}

export function clearEventInputs() {
  titleInput.value = '';
  descriptionInput.value = '';
  locationInput.value = '';
  dateInput.value = '';
  resetEventBanner();
}

export async function createEvent() {
  const user = auth.currentUser;
  if (!user || !isFormValid()) return;

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const location = locationInput.value.trim();
  const eventDate = Timestamp.fromDate(new Date(dateInput.value));
  const bannerFile = getSelectedBannerFile();

  closeCreationModal();
  showProgress(20);

  try {
    const banner = await uploadBanner(bannerFile);

    showProgress(80);

    await addDoc(collection(db, 'events'), {
      createAt: serverTimestamp(),
      creatorId: user.uid,
      eventBanner: banner.url,
      eventDate: eventDate,
      eventDescription: description,
      eventLocation: location,
      eventTitle: title
    });

    showProgress(100);
    setTimeout(hideProgress, 1000);
  } catch (error) {
    console.error('Erro ao criar evento:', error);
    hideProgress();
  }
}

export function updateSendButtonState() {
  const hasDate = dateInput.value.length > 0;

  dateInput.classList.toggle('invalid', hasDate && !isFutureDate(dateInput.value));
  sendEvent.classList.toggle('disable', !isFormValid());
}

function enforceFutureDate() {
  refreshMinDate();

  if (dateInput.value && !isFutureDate(dateInput.value)) {
    dateInput.value = dateInput.min;
  }

  updateSendButtonState();
}

refreshMinDate();
updateSendButtonState();

setInterval(() => {
  refreshMinDate();
  updateSendButtonState();
}, MIN_DATE_REFRESH_MS);

sendEvent.addEventListener('click', () => {
  if (sendEvent.classList.contains('disable')) return;
  createEvent();
});

titleInput.addEventListener('input', updateSendButtonState);
descriptionInput.addEventListener('input', updateSendButtonState);
locationInput.addEventListener('input', updateSendButtonState);
dateInput.addEventListener('focus', refreshMinDate);
dateInput.addEventListener('input', updateSendButtonState);
dateInput.addEventListener('change', enforceFutureDate);
document.getElementById('eventBannerInput')?.addEventListener('change', updateSendButtonState);