const btnOpenOptions = document.getElementById('openPostMore');

const openConfirm = document.getElementById('openAlert');
const overlayAlert = document.getElementById('overlayAlert');
    
const deleteBtn = document.getElementById('deleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

function lockScroll() {
    document.body.classList.add('scroll-locked');
}

function unlockScroll() {
    document.body.classList.remove('scroll-locked');
}

function openAlert() {
    overlayAlert.classList.add('active');
    lockScroll();
}

function closeAlert() {
    overlayAlert.classList.remove('active');
    unlockScroll();
}

btnOpenOptions.addEventListener('click', openAlert);

cancelDeleteBtn.addEventListener('click', () => {
    closeAlert();
});

deleteBtn.addEventListener('click', () => {
    closeAlert();
});