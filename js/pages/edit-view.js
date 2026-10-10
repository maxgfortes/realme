// edit-mode.js

document.addEventListener('DOMContentLoaded', () => {

  const btnEdit   = document.getElementById('open-edit');
  const btnCancel = document.getElementById('cancel-edit');
  const viewMode  = document.querySelector('.view-mode');
  const editMode  = document.querySelector('.edit-mode');

  // começa com edit-mode escondido
  editMode.classList.add('hidden');

  // clicou no lápis → mostra edição
  btnEdit.addEventListener('click', () => {
    viewMode.classList.add('hidden');
    editMode.classList.remove('hidden');
  });

  // clicou no X → volta pro view
  btnCancel.addEventListener('click', () => {
    editMode.classList.add('hidden');
    viewMode.classList.remove('hidden');
  });

});