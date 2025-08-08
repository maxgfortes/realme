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
