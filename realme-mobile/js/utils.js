// ===================
// FUNÇÕES UTILITÁRIAS
// ===================

import { db } from './config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Função para verificar login
function verificarLogin() {
  const usuarioLogado = localStorage.getItem('usuarioLogado');
  if (!usuarioLogado) {
    console.log("Usuário não está logado, redirecionando para login");
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// Função para configurar links do perfil
function configurarLinks() {
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    const username = usuarioLogado.username;
    
    const urlPerfil = `PF.html?username=${encodeURIComponent(username)}`;
    
    const linkSidebar = document.getElementById('linkPerfilSidebar');
    const linkMobile = document.getElementById('linkPerfilMobile');
    
    if (linkSidebar) linkSidebar.href = urlPerfil;
    if (linkMobile) linkMobile.href = urlPerfil;
  }

  const btnSair = document.getElementById('btnSair');
  if (btnSair) {
    btnSair.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('usuarioLogado');
      window.location.href = 'index.html';
    });
  }
}

// Função para atualizar marquee com último usuário
async function atualizarMarqueeUltimoUsuario() {
  try {
    const lastUpdateRef = doc(db, "lastupdate", "latestUser");
    const docSnap = await getDoc(lastUpdateRef);

    const marquee = document.querySelector(".marquee");
    if (!marquee) return;

    if (docSnap.exists()) {
      const data = docSnap.data();
      const nomeUsuario = data.username || "Usuário";
      marquee.textContent = `${nomeUsuario} acabou de entrar no RealMe!`;
    } else {
      marquee.textContent = "Bem-vindo ao RealMe!";
    }
  } catch (error) {
    console.error("Erro ao buscar último usuário:", error);
    const marquee = document.querySelector(".marquee");
    if (marquee) marquee.textContent = "Erro ao carregar dados.";
  }
}

// Função para formatar data de posts
function formatarDataPost(timestamp) {
  if (!timestamp) return 'Data não disponível';
  
  try {
    let date;
    if (timestamp && typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp && timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else if (timestamp) {
      date = new Date(timestamp);
    } else {
      return 'Data inválida';
    }

    const agora = new Date();
    const diff = agora - date;
    const diffMinutos = Math.floor(diff / (1000 * 60));
    const diffHoras = Math.floor(diff / (1000 * 60 * 60));
    const diffDias = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (diffMinutos < 1) return 'Agora';
    if (diffMinutos < 60) return `${diffMinutos}min`;
    if (diffHoras < 24) return `${diffHoras}h`;
    if (diffDias < 7) return `${diffDias}d`;
    
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Erro ao formatar data:', error);
    return 'Data inválida';
  }
}

// Função para formatar conteúdo do post
function formatarConteudoPost(conteudo) {
  if (!conteudo) return '<p class="empty-content">Post sem conteúdo</p>';
  
  let conteudoFormatado = conteudo;
  
  // Detectar URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  conteudoFormatado = conteudoFormatado.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Detectar hashtags
  const hashtagRegex = /#(\w+)/g;
  conteudoFormatado = conteudoFormatado.replace(hashtagRegex, '<span class="hashtag">#$1</span>');
  
  // Detectar menções
  const mentionRegex = /@(\w+)/g;
  conteudoFormatado = conteudoFormatado.replace(mentionRegex, '<span class="mention">@$1</span>');
  
  // Quebras de linha
  conteudoFormatado = conteudoFormatado.replace(/\n/g, '<br>');
  
  return `<p>${conteudoFormatado}</p>`;
}

// Funções para modais de imagem
function abrirModalImagem(imagemUrl) {
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
}

function fecharModal() {
  const modal = document.querySelector('.image-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
}

// Tornar funções globais
window.abrirModalImagem = abrirModalImagem;
window.fecharModal = fecharModal;

export { 
  verificarLogin, 
  configurarLinks, 
  atualizarMarqueeUltimoUsuario, 
  formatarDataPost, 
  formatarConteudoPost,
  abrirModalImagem,
  fecharModal
};