
function openPostOverlay() {
  document.getElementById('postModal').style.display = 'flex';
}

function closePostOverlay() {
  document.getElementById('postModal').style.display = 'none';
  document.getElementById('postText').value = '';
  document.getElementById('imagePreview').innerHTML = '';
  document.getElementById('postImageInput').value = '';
}

document.getElementById('postImageInput').addEventListener('change', function (e) {
  const preview = document.getElementById('imagePreview');
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function (event) {
      preview.innerHTML = `<img src="${event.target.result}" alt="Preview da imagem">`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.innerHTML = '';
  }
});

function submitPost() {
  const text = document.getElementById('postText').value;
  const image = document.getElementById('postImageInput').files[0];

  console.log("Texto:", text);
  console.log("Imagem:", image);

  alert("Post enviado! (mas só no console por enquanto 😘)");
  closePostOverlay();
}

const postImageInput = document.getElementById('postImageInput');
const imagePreview = document.getElementById('imagePreview');
const removeImageBtn = document.getElementById('removeImageBtn');

postImageInput.addEventListener('change', function () {
  const file = this.files[0];

  if (file) {
    // Opcional: limitar tamanho, ex: 2MB

    const reader = new FileReader();
    reader.onload = function (e) {
      imagePreview.innerHTML = `<img src="${e.target.result}" alt="Preview da imagem" style="max-width: 100%; max-height: 300px; border-radius: 12px;">`;
      removeImageBtn.style.display = 'inline-block';
    }
    reader.readAsDataURL(file);
  } else {
    imagePreview.innerHTML = '';
    removeImageBtn.style.display = 'none';
  }
});

function removeImage() {
  postImageInput.value = '';
  imagePreview.innerHTML = '';
  removeImageBtn.style.display = 'none';
}
