
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
// modalPost.js

// ===================
// ENVIAR POST VIA MODAL
// ===================
async function sendPostViaModal(texto) {
  const usuarioLogado = verificarLogin();
  if (!usuarioLogado) return;

  const trimmedText = texto.trim();
  if (!trimmedText) {
    criarPopup('Campo Vazio', 'Digite algo para postar!', 'warning');
    return;
  }

  tocarSomEnvio();

  const loadingInfo = mostrarLoading('Enviando post...');

  try {
    const postId = gerarIdUnicoPost();

    atualizarTextoLoading('Buscando dados do usuário...');
    const userData = await buscarDadosUsuario(usuarioLogado.username);
    if (!userData) {
      clearInterval(loadingInfo.interval);
      esconderLoading();
      criarPopup('Erro', 'Erro ao buscar dados do usuário', 'error');
      return;
    }

    atualizarTextoLoading('Salvando post...');

    const postData = {
      conteudo: trimmedText,
      curtidas: 0,
      postadoem: serverTimestamp(),
      uid: userData.uid || Date.now(),
      username: usuarioLogado.username
    };

    const postRef = doc(db, 'users', usuarioLogado.username, 'posts', postId);
    await setDoc(postRef, postData);

    atualizarTextoLoading('Atualizando feed...');

    // Limpar campos do modal
    document.getElementById('postText').value = '';
    document.getElementById('postImageInput').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('removeImageBtn').style.display = 'none';

    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Sucesso!', 'Post enviado com sucesso!', 'success');

    closePostOverlay(); // Fecha o modal

    // Se estiver na página do feed, atualiza
    if (typeof loadPosts === 'function') {
      feed.innerHTML = '';
      allPosts = [];
      await loadPosts();
    }

  } catch (error) {
    console.error("Erro ao enviar post:", error);
    clearInterval(loadingInfo.interval);
    esconderLoading();
    criarPopup('Erro', 'Erro ao enviar post, tente novamente.', 'error');
  }
}

function submitPost() {
  const textoDoModal = document.getElementById('postText').value;
  sendPostViaModal(textoDoModal);
}
