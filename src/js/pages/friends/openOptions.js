const mainPage = document.getElementById('mainPage');
const optionsOverlay = document.getElementById('optionsOverlay');

const btnOpenOptions = document.getElementById('btnOpenOptions');
const btnOpenOptions2 = document.getElementById('btnOpenOptions2');
const btnCloseOptions = document.getElementById('btnCloseOptions');

function openSearch() {
  optionsOverlay.classList.add('active');
  mainPage.classList.add('hidden');
}

export function closeSearch() {
  optionsOverlay.classList.remove('active');
  mainPage.classList.remove('hidden');
}

btnOpenOptions.addEventListener('click', openSearch);
btnOpenOptions2.addEventListener('click', openSearch);
btnCloseOptions.addEventListener('click', closeSearch);