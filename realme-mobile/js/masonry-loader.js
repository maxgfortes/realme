/**
 * Aguarda todas as imagens de um container carregarem
 * antes de aplicar ajustes visuais no layout estilo masonry.
 *
 * @param {HTMLElement} container - Elemento que contém as imagens
 * @param {Function} callback - Função executada quando todas as imagens carregarem
 */
function esperarImagensCarregarem(container, callback) {
  if (!container) {
    console.error("❌ Container do mural não encontrado");
    return;
  }

  const imagens = container.querySelectorAll("img");
  let carregadas = 0;

  if (imagens.length === 0) {
    callback();
    return;
  }

  imagens.forEach((img) => {
    if (img.complete) {
      carregadas++;
      if (carregadas === imagens.length) callback();
    } else {
      img.addEventListener("load", () => {
        carregadas++;
        if (carregadas === imagens.length) callback();
      });
      img.addEventListener("error", () => {
        carregadas++;
        if (carregadas === imagens.length) callback();
      });
    }
  });
}
/**
 * Inicializa o layout masonry no container especificado
 * após todas as imagens terem carregado.
 *
 * @param {string} seletor - Seletor CSS do container do mural
 */
function inicializarMasonry(seletor) {
  const mural = document.querySelector(seletor);

  esperarImagensCarregarem(mural, () => {
    mural.style.opacity = "1"; // opcional: fade-in suave
    console.log("✅ Layout Masonry pronto!");
  });
}

// Exemplo de uso automático assim que a página carregar
document.addEventListener("DOMContentLoaded", () => {
  inicializarMasonry("#muralPosts");
});
