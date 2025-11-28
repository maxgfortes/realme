const moreMenu = document.getElementById('moreMenu');
const moreToggle = document.getElementById('moreToggle');
const floatingMenu = document.getElementById('floatingMenu');
let overlay = document.getElementById('overlay');

// Cria overlay se não existir
if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.4)';
    overlay.style.zIndex = 9999;
    overlay.style.display = 'none';
    document.body.appendChild(overlay);
}

// Toggle do menu flutuante
moreToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();

    if (moreMenu.classList.contains('active')) {
        closeFloatingMenu();
    } else {
        openFloatingMenu();
    }
});

// Fechar menu ao clicar em qualquer lugar fora dele
document.addEventListener('click', function(e) {
    // Verifica se o clique não foi no botão de toggle, no menu ou dentro dele.
    if (!moreToggle.contains(e.target) && !moreMenu.contains(e.target) && moreMenu.classList.contains('active')) {
        closeFloatingMenu();
    }
});

// Função para abrir o menu principal
function openFloatingMenu() {
    moreMenu.classList.add('active');
    overlay.style.display = 'block';
}

// Função para fechar o menu principal
function closeFloatingMenu() {
    moreMenu.classList.remove('active');
    overlay.style.display = 'none';
}

// Fechar menu ao clicar em qualquer link dentro do menu flutuante
floatingMenu.addEventListener('click', function(e) {
    // Verifica se o elemento clicado é um link (A)
    if (e.target.tagName === 'A') {
        closeFloatingMenu();
    }
});

// Fechar menu ao pressionar ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && moreMenu.classList.contains('active')) {
        closeFloatingMenu();
    }
});

// Fechar o menu ao clicar no overlay
overlay.addEventListener('click', closeFloatingMenu);

// Exemplo de função para abrir overlay de post
function openPostOverlay() {
    alert('Abrir overlay para criar post');
}

// Exemplo de função para sair
const btnSair = document.getElementById('btnSair');
if (btnSair) { // Verifica se o elemento existe antes de adicionar o listener
    btnSair.addEventListener('click', function(e) {
        e.preventDefault();
        if (confirm('Tem certeza que deseja sair?')) {
            alert('Saindo...');
        }
    });
}




// --- MENU FLUTUANTE DE AMIGOS ---
const moreFriendMenu = document.getElementById('moreFriendMenu');
const moreFriendToggle = document.getElementById('moreFriendToggle');
const floatingFriendMenu = document.getElementById('floatingFriendMenu');
let friendOverlay = document.getElementById('friendOverlay');

// Cria overlay de amigos se não existir
if (!friendOverlay) {
    friendOverlay = document.createElement('div');
    friendOverlay.id = 'friendOverlay';
    friendOverlay.style.position = 'fixed';
    friendOverlay.style.top = 0;
    friendOverlay.style.left = 0;
    friendOverlay.style.width = '100vw';
    friendOverlay.style.height = '100vh';
    friendOverlay.style.background = 'rgba(0,0,0,0.4)';
    friendOverlay.style.zIndex = 9998;
    friendOverlay.style.display = 'none';
    document.body.appendChild(friendOverlay);
}

function openFriendMenu() {
    moreFriendMenu.classList.add('active');
    friendOverlay.style.display = 'block';
}

function closeFriendMenu() {
    moreFriendMenu.classList.remove('active');
    friendOverlay.style.display = 'none';
}

if (moreFriendToggle) {
    moreFriendToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (moreFriendMenu.classList.contains('active')) {
            closeFriendMenu();
        } else {
            openFriendMenu();
        }
    });
}

// Fechar menu de amigos ao clicar fora
document.addEventListener('click', function(e) {
    if (
        moreFriendMenu.classList.contains('active') &&
        !moreFriendMenu.contains(e.target) &&
        !moreFriendToggle.contains(e.target)
    ) {
        closeFriendMenu();
    }
});

// Fechar menu de amigos ao clicar em qualquer link dentro do menu
if (floatingFriendMenu) {
    floatingFriendMenu.addEventListener('click', function(e) {
        if (e.target.tagName === 'A') {
            closeFriendMenu();
        }
    });
}

// Fechar menu de amigos ao pressionar ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && moreFriendMenu.classList.contains('active')) {
        closeFriendMenu();
    }
});

// Fechar menu de amigos ao clicar no overlay
friendOverlay.addEventListener('click', closeFriendMenu);


























































































// ============================================
// SISTEMA COMPLETO DE UPLOAD DE IMAGENS
// Aceita até 1GB, comprime automaticamente, input direto no ícone
// ============================================

// Comprime imagem grande (até 1GB) de forma progressiva
/* async function comprimirImagem(file, maxWidth = 1920, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    // Mostra progresso de leitura
    reader.onprogress = (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        atualizarTextoLoading(`Lendo imagem... ${Math.round(percentComplete)}%`);
      }
    };
    
    reader.readAsDataURL(file);
    
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calcula redimensionamento baseado no tamanho
        if (file.size > 100 * 1024 * 1024) { // > 100MB
          maxWidth = 1280;
          quality = 0.6;
        } else if (file.size > 50 * 1024 * 1024) { // > 50MB
          maxWidth = 1600;
          quality = 0.7;
        }
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        atualizarTextoLoading('Comprimindo imagem...');
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            
            const reducao = ((1 - compressedFile.size / file.size) * 100).toFixed(1);
            console.log(`✅ Comprimida: ${(file.size / 1024 / 1024).toFixed(2)}MB → ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB (-${reducao}%)`);
            
            resolve(compressedFile);
          },
          'image/jpeg',
          quality
        );
      };
      
      img.onerror = () => reject(new Error('Erro ao carregar imagem'));
    };
    
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
  });
}

// Converte arquivo para base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Faz upload para ImgBB (aceita até 1GB)
async function uploadImagemPost(file, userId) {
  try {
    if (!file || !file.type.startsWith('image/')) {
      throw new Error('Arquivo inválido. Apenas imagens são permitidas.');
    }

    // LIMITE: 1GB
    const maxSize = 1024 * 1024 * 1024; // 1GB
    const minSizeToCompress = 5 * 1024 * 1024; // 5MB
    
    if (file.size > maxSize) {
      throw new Error('Imagem muito grande! Máximo: 1GB');
    }
    
    let fileToUpload = file;
    
    // Comprime se for maior que 5MB
    if (file.size > minSizeToCompress) {
      const tamanhoMB = (file.size / 1024 / 1024).toFixed(2);
      console.log(`📦 Imagem grande (${tamanhoMB}MB). Comprimindo...`);
      
      atualizarTextoLoading(`Comprimindo ${tamanhoMB}MB...`);
      fileToUpload = await comprimirImagem(file, 1920, 0.7);
    }

    atualizarTextoLoading('Preparando upload...');
    const base64 = await fileToBase64(fileToUpload);
    const base64Data = base64.split(',')[1];
    
    const formData = new FormData();
    formData.append('image', base64Data);
    formData.append('name', `post_${userId}_${Date.now()}`);
    
    atualizarTextoLoading('Enviando para servidor...');
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error('Erro na requisição ao ImgBB');
    }
    
    const data = await response.json();
    
    if (data.success) {
      return {
        success: true,
        url: data.data.url,
        deleteUrl: data.data.delete_url,
        thumb: data.data.thumb.url,
        display: data.data.display_url
      };
    } else {
      throw new Error(data.error?.message || 'Erro ao fazer upload');
    }
    
  } catch (error) {
    console.error('Erro ao fazer upload:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Mostra preview pequeno embaixo dos inputs
function mostrarPreviewNaPostArea(file) {
  const postArea = document.querySelector('.post-area');
  
  if (!postArea) return;

  // Remove preview anterior se existir
  let previewContainer = document.querySelector('.preview-imagem-post');
  
  if (previewContainer) {
    previewContainer.remove();
  }

  // Cria novo preview
  previewContainer = document.createElement('div');
  previewContainer.className = 'preview-imagem-post';
  
  const tamanhoMB = (file.size / 1024 / 1024).toFixed(2);
  const avisoCompressao = file.size > 5 * 1024 * 1024 
    ? `<small class="aviso-compressao">⚡ ${tamanhoMB}MB - Será comprimida</small>`
    : `<small class="info-tamanho">${tamanhoMB}MB</small>`;
  
  previewContainer.innerHTML = `
    <div class="preview-mini">
      <div class="preview-imagem-mini">
  <img src="" alt="Preview">
  <button class="btn-remover-preview" type="button" title="Remover imagem">
    <i class="fas fa-times"></i>
  </button>
</div>

      <div class="preview-info">
        <span class="preview-nome">${file.name}</span>
        ${avisoCompressao}
      </div>
    </div>
  `;

  // Insere embaixo do post-area
  postArea.parentNode.insertBefore(previewContainer, postArea.nextSibling);

  // Carrega a imagem
  const reader = new FileReader();
  reader.onload = (e) => {
    previewContainer.querySelector('img').src = e.target.result;
  };
  reader.readAsDataURL(file);

  // Botão de remover
  previewContainer.querySelector('.btn-remover-preview').addEventListener('click', () => {
    previewContainer.remove();
    document.getElementById('direct-file-input').value = '';
  });
}

// Transforma o botão de arquivo em input direto (clica no ícone = abre seletor)
function criarInputImagem() {
  const fileBtn = document.querySelector('.file-button');
  
  if (!fileBtn) return;

  // Cria o input de arquivo (invisível)
  let fileInput = document.getElementById('direct-file-input');
  
  if (!fileInput) {
    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'direct-file-input';
    fileInput.accept = 'image/jpeg,image/jpg,image/png,image/gif,image/webp';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);
  }

  // Quando clica no ícone, abre o seletor de arquivo
  fileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    fileInput.click();
  });

  // Quando seleciona arquivo, mostra preview
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    
    if (!file) return;

    // Valida tamanho (1GB)
    const maxSize = 1024 * 1024 * 1024;
    if (file.size > maxSize) {
      criarPopup('Arquivo muito grande', 'Tamanho máximo: 1GB', 'error');
      fileInput.value = '';
      return;
    }

    // Mostra preview
    mostrarPreviewNaPostArea(file);
  });
}

// Adiciona estilos CSS para o preview
function adicionarEstilosUpload() {
  if (document.querySelector('#upload-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'upload-styles';
  style.textContent = `
    .preview-imagem-post {
      margin: 10px 0;
      padding: 0;
      animation: slideDown 0.3s ease;
    }
    
    @keyframes slideDown {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .preview-mini {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      background: rgba(74, 144, 226, 0.08);
      border: 1px solid rgba(74, 144, 226, 0.3);
      border-radius: 8px;
      transition: all 0.3s ease;
    }
    
    .preview-mini:hover {
      background: rgba(74, 144, 226, 0.12);
      border-color: rgba(74, 144, 226, 0.5);
    }
    
    .preview-imagem-mini {
      width: 50px;
      height: 50px;
      border-radius: 6px;
      overflow: hidden;
      background: #000;
      flex-shrink: 0;
    }
    
    .preview-imagem-mini img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    
    .preview-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
    }
    
    .preview-nome {
      font-size: 13px;
      color: #fff;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .aviso-compressao {
      display: block;
      color: #ffa500;
      font-size: 11px;
      font-style: italic;
    }
    
    .info-tamanho {
      display: block;
      color: #999;
      font-size: 11px;
    }
    
    .btn-remover-preview {
      background: #e74c3c;
      color: white;
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
      flex-shrink: 0;
    }
    
    .btn-remover-preview:hover {
      background: #c0392b;
      transform: scale(1.1);
    }
    
    .btn-remover-preview i {
      font-size: 12px;
    }
    
    .file-button {
      cursor: pointer;
      transition: all 0.3s ease;
    }
    
    .file-button:hover {
      transform: scale(1.1);
      color: #4A90E2;
    }
    
    @media (max-width: 768px) {
      .preview-mini {
        gap: 10px;
        padding: 8px;
      }
      
      .preview-imagem-mini {
        width: 45px;
        height: 45px;
      }
      
      .preview-nome {
        font-size: 12px;
      }
    }
  `;
  
  document.head.appendChild(style);
} */
