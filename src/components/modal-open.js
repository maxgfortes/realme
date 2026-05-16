/* const btnMencionar = document.getElementById('btnMention');
const btnMusica = document.getElementById('btnMusic');
const btnLocal = document.getElementById('btnLocal');

const overlayMencionar = document.getElementById('overlayMention');
const overlayMusica = document.getElementById('overlayMusic');
const overlayLocal = document.getElementById('overlayLocal');

function fecharTodos() {
  overlayMencionar.classList.remove('visible');
  overlayMusica.classList.remove('visible');
  overlayLocal.classList.remove('visible');
}



btnMencionar.addEventListener('click', function() {
  fecharTodos();
  overlayMencionar.classList.add('visible');
});

btnMusica.addEventListener('click', function() {
  fecharTodos();
  overlayMusica.classList.add('visible');
});

btnLocal.addEventListener('click', function() {
  fecharTodos();
  overlayLocal.classList.add('visible');
});




document.getElementById('cancel-mention').addEventListener('click', fecharTodos);
document.getElementById('cancel-music').addEventListener('click', function () {
  closeModal();
  fecharTodos();
});
document.getElementById('cancel-local').addEventListener('click', fecharTodos);

document.getElementById('confirm-mention').addEventListener('click', fecharTodos);
document.getElementById('confirm-music').addEventListener('click', function () {
  if (selectedMusic) {
    saveRecent(selectedMusic);
  }
  closeModal();
  fecharTodos();
});
document.getElementById('confirm-local').addEventListener('click', fecharTodos);



overlayMencionar.addEventListener('click', function(e) {
  if (e.target === overlayMencionar) fecharTodos();
});
overlayMusica.addEventListener('click', function(e) {
  if (e.target === overlayMusica) fecharTodos();
});
overlayLocal.addEventListener('click', function(e) {
  if (e.target === overlayLocal) fecharTodos();
});

*/