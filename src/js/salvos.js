// salvos.js - Página de Posts Salvos (Finalizado e Corrigido)
import { 
  getFirestore,
  doc,
  getDoc,
  updateDoc,
  setDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { 
  getAuth, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 💡 IMPORTANTE: Importa as funções para REUTILIZAR a instância do Firebase
import { 
    initializeApp, 
    getApp, 
    getApps 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js"; 

import { 
  buscarPostsSalvos,
  toggleSalvarPost,
  verificarSeEstaSalvo 
} from './save-posts.js';

// Configuração do Firebase (Apenas para fallback, se necessário)
const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de"
};

// 💡 CORREÇÃO: Reutiliza a instância do Firebase (a que foi criada pelo feed.js)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig); 

const db = getFirestore(app);
const auth = getAuth(app);

let currentUser = null;

// ===================
// INICIALIZAÇÃO
// ===================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = 'index.html'; 
    return;
  }

  currentUser = user;
  await carregarPostsSalvos();
});

// ===================
// CARREGAR POSTS SALVOS
// ===================
async function carregarPostsSalvos() {
  const feed = document.getElementById('savedPostsFeed');
  if (!feed) {
    console.error('Container de posts salvos não encontrado');
    return;
  }

  feed.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p>Carregando posts salvos...</p>
    </div>
  `;

  try {
    const posts = await buscarPostsSalvos();

    feed.innerHTML = '';

    if (posts.length === 0) {
      feed.innerHTML = `
        <div class="empty-saved">
          <i class="far fa-bookmark empty-icon"></i>
          <h3>Nenhum post salvo</h3>
          <p>Quando você salvar posts, eles aparecerão aqui</p>
          <a href="feed.html" class="btn-primary">Ir para o Feed</a>
        </div>
      `;
      return;
    }

    for (const post of posts) {
      const postElement = await criarElementoPost(post);
      feed.appendChild(postElement);
    }

  } catch (error) {
    console.error('Erro ao carregar posts salvos:', error);
    feed.innerHTML = `
      <div class="error-container">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Erro ao carregar posts</h3>
        <p>Tente recarregar a página</p>
        <button onclick="location.reload()" class="btn-primary">Recarregar</button>
      </div>
    `;
  }
}

// ===================
// CRIAR ELEMENTO DO POST
// ===================
async function criarElementoPost(post) {
  const postCard = document.createElement('div');
  postCard.className = 'post-card';
  postCard.setAttribute('data-post-id', post.id);

  const displayName = post.creatorData?.displayname || post.creatorData?.username || 'Usuário';
  const username = post.creatorData?.username || 'usuario';
  const userPhoto = post.creatorData?.userphoto || './src/icon/default.jpg';
  const dataPost = formatarDataRelativa(post.create);
  const conteudo = formatarConteudo(post.content || 'Post sem conteúdo');
  const curtidas = post.likes || 0;

  let imagemHTML = '';
  if (post.img) {
    imagemHTML = `
      <div class="post-image">
        <img src="${post.img}" alt="Imagem do post" loading="lazy" 
             onerror="this.parentElement.style.display='none'"
             onclick="abrirModalImagem('${post.img}')">
      </div>
    `;
  }

  postCard.innerHTML = `
    <div class="post-header">
      <div class="user-info">
        <img src="${userPhoto}" alt="Avatar" class="avatar"
             onerror="this.src='./src/icon/default.jpg'"
             onclick="window.location.href='PF.html?userid=${post.creatorid}'">
        <div class="user-meta">
          <strong class="user-name-link" onclick="window.location.href='PF.html?userid=${post.creatorid}'">${displayName}</strong>
          <small class="post-username">@${username}</small>
          <small class="post-date-mobile">${dataPost}</small>
        </div>
      </div>
    </div>
    <div class="post-content">
      <div class="post-text">${conteudo}</div>
      ${imagemHTML}
      <div class="post-actions">
        <div class="post-actions-left">
          <button class="btn-like action-btn" data-username="${post.creatorid}" data-id="${post.id}">
            <i class="fas fa-heart"></i> <span>${curtidas || ''}</span>
          </button>
          <button class="btn-comment action-btn" data-username="${post.creatorid}" data-id="${post.id}">
            <i class="fas fa-comment"></i> <p>Comentar</p>
          </button>
          <button class="btn-share action-btn">
            <i class="fas fa-share"></i> <p>Compartilhar</p>
          </button>
        </div>
        <div class="post-actions-right">
          <button class="btn-save action-btn saved" data-post-id="${post.id}" data-post-owner="${post.creatorid}">
            <i class="fas fa-bookmark"></i> <p>Salvo</p>
          </button>
        </div>
      </div>
      <div class="post-date">${dataPost}</div>
    </div>
  `;

  // Evento do botão salvar (para remover da lista)
  const btnSave = postCard.querySelector('.btn-save');
  btnSave.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    await toggleSalvarPost(post.id); 
    
    // Remove o post da lista visualmente se foi dessalvo
    if (!btnSave.classList.contains('saved')) {
      postCard.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        postCard.remove();
        
        const feed = document.getElementById('savedPostsFeed');
        if (feed && feed.children.length === 0) {
          feed.innerHTML = `
            <div class="empty-saved">
              <i class="far fa-bookmark empty-icon"></i>
              <h3>Nenhum post salvo</h3>
              <p>Quando você salvar posts, eles aparecerão aqui</p>
              <a href="feed.html" class="btn-primary">Ir para o Feed</a>
            </div>
          `;
        }
      }, 300);
    }
  });

  // Evento do botão curtir (mantido para funcionalidade completa)
  const btnLike = postCard.querySelector('.btn-like');
  btnLike.addEventListener('click', async () => {
    if (currentUser) {
        await toggleLikePost(currentUser.uid, post.id, btnLike);
    }
  });

  return postCard;
}

// ===================
// CURTIR POST
// ===================
async function toggleLikePost(uid, postId, btnElement) {
  const likerRef = doc(db, `posts/${postId}/likers/${uid}`);

  try {
    const likerSnap = await getDoc(likerRef);
    const spanCurtidas = btnElement.querySelector('span');
    let curtidasAtuais = parseInt(spanCurtidas.textContent) || 0;

    if (likerSnap.exists() && likerSnap.data().like === true) {
      await updateDoc(likerRef, { like: false, likein: new Date() });
      btnElement.style.color = '';
      spanCurtidas.textContent = Math.max(0, curtidasAtuais - 1);
    } else {
      if (likerSnap.exists()) {
        await updateDoc(likerRef, { like: true, likein: new Date() });
      } else {
        await setDoc(likerRef, { uid: uid, like: true, likein: new Date() });
      }
      btnElement.style.color = '#dc3545';
      spanCurtidas.textContent = curtidasAtuais + 1;
    }
  } catch (error) {
    console.error("Erro ao curtir post:", error);
  }
}

// ===================
// FUNÇÕES AUXILIARES
// ===================
function formatarDataRelativa(timestamp) {
  if (!timestamp) return 'Agora';
  
  try {
    let date;
    if (typeof timestamp === 'object' && timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    const agora = new Date();
    const diff = agora.getTime() - date.getTime();
    const minutos = Math.floor(diff / 60000);
    const horas = Math.floor(diff / 3600000);
    const dias = Math.floor(diff / 86400000);

    if (minutos < 1) return 'Agora';
    if (minutos < 60) return `${minutos}min`;
    if (horas < 24) return `${horas}h`;
    if (dias < 7) return `${dias}d`;
    
    return date.toLocaleDateString('pt-BR');
  } catch {
    return 'Data inválida';
  }
}

function formatarConteudo(conteudo) {
  if (!conteudo) return '<p class="empty-content">Post sem conteúdo</p>';
  
  let formatado = conteudo;
  formatado = formatado.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  formatado = formatado.replace(/#(\w+)/g, '<span class="hashtag">#$1</span>');
  formatado = formatado.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
  formatado = formatado.replace(/\n/g, '<br>');
  
  return `<p>${formatado}</p>`;
}

// Funções globais para o Modal (mantidas)
window.abrirModalImagem = function(imagemUrl) {
  const modal = document.createElement('div');
  modal.className = 'image-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="fecharModal()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <button class="modal-close" onclick="fecharModal()">
          <i class="fas fa-times"></i>
        </button>
        <img src="${imagemUrl}" alt="Imagem ampliada" class="modal-image">
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';
};

window.fecharModal = function() {
  const modal = document.querySelector('.image-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
};

// CSS adicional (mantido)
const style = document.createElement('style');
style.textContent = `
  .loading-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    color: #999;
  }

  .loading-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid rgba(255, 255, 255, 0.1);
    border-top-color: #4A90E2;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin-bottom: 20px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-saved, .error-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
    color: #999;
  }

  .empty-icon {
    font-size: 80px;
    margin-bottom: 20px;
    opacity: 0.3;
  }

  .empty-saved h3, .error-container h3 {
    font-size: 24px;
    margin-bottom: 10px;
    color: #fff;
  }

  .empty-saved p, .error-container p {
    font-size: 16px;
    margin-bottom: 20px;
  }

  .btn-primary {
    padding: 12px 24px;
    background: #4A90E2;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-size: 16px;
    text-decoration: none;
    display: inline-block;
  }

  .btn-primary:hover {
    background: #357ABD;
    transform: none;
  }

  @keyframes fadeOut {
    from {
      opacity: 1;
      transform: scale(1);
    }
    to {
      opacity: 0;
      transform: scale(0.9);
    }
  }

  .btn-save.saved i {
    color: #ffc107; 
  }
`;

document.head.appendChild(style);