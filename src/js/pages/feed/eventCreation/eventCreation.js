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

function isFormValid() {
  return (
    titleInput.value.trim() &&
    locationInput.value.trim() &&
    dateInput.value &&
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

sendEvent.addEventListener('click', createEvent);