/* IDs dos botões e seus overlays correspondentes
const btnMencionar = document.getElementById('btnMention');
const btnMusica = document.getElementById('btnMusic');
const btnLocal = document.getElementById('btnLocal');

const overlayMencionar = document.getElementById('overlayMention');
const overlayMusica = document.getElementById('overlayMusic');
const overlayLocal = document.getElementById('overlayLocal');

// Fecha todos os overlays
function fecharTodos() {
  overlayMencionar.classList.remove('visible');
  overlayMusica.classList.remove('visible');
  overlayLocal.classList.remove('visible');
}

// Abre o de mencionar
btnMencionar.addEventListener('click', function() {
  fecharTodos();
  overlayMencionar.classList.add('visible');
});

// Abre o de música
btnMusica.addEventListener('click', function() {
  fecharTodos();
  overlayMusica.classList.add('visible');
});

// Abre o de localização
btnLocal.addEventListener('click', function() {
  fecharTodos();
  overlayLocal.classList.add('visible');
});

// Botões de cancelar fecham tudo
document.getElementById('cancel-mention').addEventListener('click', fecharTodos);
document.getElementById('cancel-music').addEventListener('click', fecharTodos);
document.getElementById('cancel-local').addEventListener('click', fecharTodos);

// Botões de concluir fecham tudo
document.getElementById('confirm-mention').addEventListener('click', fecharTodos);
document.getElementById('confirm-music').addEventListener('click', fecharTodos);
document.getElementById('confirm-local').addEventListener('click', fecharTodos);

// Clicou fora do modal (no fundo escuro) fecha tudo
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