import { clearInputs } from './postCreation.js';
import { clearEventInputs } from '../eventCreation/eventCreation.js';


const openBtn = document.getElementById('openPostLayerNav');
const openBtnSec = document.getElementById('openPostLayer');
const closeBtn = document.getElementById('closeLayerBtn');
const creationModal = document.getElementById('postLayer');
const feedPage = document.getElementById('feedPage');

const createPost = document.getElementById('createPost');
const createEvent = document.getElementById('createEvent');

const createPostArea = document.getElementById("createPostArea");
const createEventArea = document.getElementById("createEventArea");

export function openCreationModal() {
    creationModal.classList.add('active');
    feedPage.classList.add('closed');
    document.body.style.overflow = 'hidden';
}

export function closeCreationModal() {
    creationModal.classList.remove('active');
    feedPage.classList.remove('closed');
    document.body.style.overflow = '';
    setTimeout(() => {
        clearInputs();
        clearEventInputs();
    }, 390);
}

openBtn.addEventListener('click', openCreationModal);
openBtnSec.addEventListener('click', openCreationModal);
closeBtn.addEventListener('click', closeCreationModal);

function activeCreatePost() {
    createPost.classList.add("active");
    createEvent.classList.remove("active");
    createPostArea.classList.add("active");
    createEventArea.classList.remove("active");
}

function activeCreateEvent() {
    createPost.classList.remove("active");
    createEvent.classList.add("active");
    createPostArea.classList.remove("active");
    createEventArea.classList.add("active");
}

createPost.addEventListener('click', activeCreatePost);
createEvent.addEventListener('click', activeCreateEvent);