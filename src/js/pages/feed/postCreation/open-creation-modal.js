import { clearInputs } from './postCreation.js';

const openBtn = document.getElementById('openPostLayerNav');
const openBtnSec = document.getElementById('openPostLayer');
const closeBtn = document.getElementById('closeLayerBtn');
const creationModal = document.getElementById('postLayer');
const feedPage = document.getElementById('feedPage');

export function openCreationModal() {
    creationModal.classList.add('active');
    feedPage.classList.add('closed');
    document.body.style.overflow = 'hidden';
}

export function closeCreationModal() {
    creationModal.classList.remove('active');
    feedPage.classList.remove('closed');
    document.body.style.overflow = '';
    setTimeout(clearInputs, 390);
}

openBtn.addEventListener('click', openCreationModal);
openBtnSec.addEventListener('click', openCreationModal);
closeBtn.addEventListener('click', closeCreationModal);