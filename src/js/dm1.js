/// ===================
// SISTEMA DE LIVE STATUS AUTOMÁTICO INTEGRADO - VERSÃO COMPLETA
// ===================

import { 
  getDatabase, 
  ref, 
  onValue, 
  set, 
  onDisconnect, 
  serverTimestamp,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  orderBy,
  startAt,
  endAt,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  limit,
  startAfter,
  deleteDoc,
  updateDoc,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB2N41DiH0-Wjdos19dizlWSKOlkpPuOWs",
  authDomain: "ifriendmatch.firebaseapp.com",
  projectId: "ifriendmatch",
  storageBucket: "ifriendmatch.appspot.com",
  messagingSenderId: "306331636603",
  appId: "1:306331636603:web:c0ae0bd22501803995e3de",
  measurementId: "G-D96BEW6RC3"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const rtdb = getDatabase(app);
// ===================
// FUNCIONALIDADE DE BUSCA (mantida igual)
// ===================
const searchInput = document.getElementById('searchInput');
const resultsList = document.getElementById('searchResults');
const searchButton = document.querySelector('.search-box button');

if (searchInput && resultsList && searchButton) {
  async function performSearch() {
    const term = searchInput.value.trim().toLowerCase();
    resultsList.innerHTML = '';
    resultsList.classList.remove('visible');

    if (!term) return;

    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('username'), startAt(term), endAt(term + '\uf8ff'));

    try {
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        resultsList.innerHTML = '<li>Nenhum usuário encontrado</li>';
        resultsList.classList.add('visible');
        return;
      }

      snapshot.forEach(docSnap => {
        const user = docSnap.data();
        const li = document.createElement('li');
        li.textContent = user.username;
        li.addEventListener('click', () => {
          window.location.href = `PF.html?username=${user.username}`;
        });
        resultsList.appendChild(li);
      });

      resultsList.classList.add('visible');
    } catch (err) {
      console.error('Erro na busca:', err);
      resultsList.innerHTML = '<li>Erro na busca</li>';
      resultsList.classList.add('visible');
    }
  }

  searchButton.addEventListener('click', (e) => {
    e.preventDefault();
    performSearch();
  });

  searchInput.addEventListener('input', performSearch);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-area')) {
      resultsList.classList.remove('visible');
    }
  });
}
// ===================
// OUTRAS FUNÇÕES
// ===================

function determinarUsuarioParaCarregar() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username") || params.get("user");
  
  if (usernameParam) {
    return usernameParam;
  }
  
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    return usuarioLogado.username;
  }
  
  return null;
}

function isPerfilProprio() {
  const params = new URLSearchParams(window.location.search);
  const usernameParam = params.get("username") || params.get("user");
  
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    return !usernameParam || usernameParam === usuarioLogado.username;
  }
  
  return false;
}

async function carregarPerfilCompleto() {
  const usernameParaCarregar = determinarUsuarioParaCarregar();
  
  if (!usernameParaCarregar) {
    console.log("Nenhum usuário para carregar");
    window.location.href = 'index.html';
    return;
  }

  console.log("Carregando perfil do usuário:", usernameParaCarregar);

  try {
    const userRef = doc(db, "users", usernameParaCarregar);
    const docSnap = await getDoc(userRef);

    if (docSnap.exists()) {
      const dados = docSnap.data();
      console.log("Dados do usuário carregados:", dados);
      
      atualizarInformacoesBasicas(dados, usernameParaCarregar);
      atualizarVisaoGeral(dados);
      atualizarGostos(dados);
      atualizarImagensPerfil(dados);
      
      // Aplicar background do headerphoto no body
      aplicarBackgroundHeaderPhoto(dados);
      
      // Atualizar estatísticas e configurar botão de seguir
      await atualizarEstatisticasPerfil(usernameParaCarregar);
      await configurarBotaoSeguir();
      
      // Carregar posts do mural (versão corrigida)
      await carregarPostsDoMural(usernameParaCarregar);
      
    } else {
      console.log("Usuário não encontrado no banco de dados");
      const nomeElement = document.getElementById("nomeCompleto");
      if (nomeElement) nomeElement.textContent = "Usuário não encontrado";
      const usernameElement = document.getElementById("username");
      if (usernameElement) usernameElement.textContent = "";
      
      // Ainda assim tentar carregar posts
      await carregarPostsDoMural(usernameParaCarregar);
    }
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);
  }
}
// ===================
// FUNÇÕES DE ATUALIZAÇÃO DO PERFIL
// ===================
function atualizarInformacoesBasicas(dados, username) {
  const nomeCompleto = dados.displayname || `${dados.nome || ''} ${dados.sobrenome || ''}`.trim();
  const nomeElement = document.getElementById("nomeCompleto");
  if (nomeElement) {
    nomeElement.textContent = nomeCompleto || "Nome não disponível";
  }

  const usernameElement = document.getElementById("username");
  if (usernameElement) {
    usernameElement.textContent = `@${dados.username || username}`;
  }

  const tituloMural = document.getElementById("tituloMural");
  if (tituloMural) {
    tituloMural.textContent = `Mural de ${nomeCompleto || dados.username || username}`;
  }

  const visaoGeralTitle = document.getElementById("visao-geral-title");
  if (visaoGeralTitle) {
    visaoGeralTitle.textContent = `Visão Geral de ${nomeCompleto || dados.username || username}`;
  }

  // Atualizar títulos das outras tabs
  const gostosTitle = document.getElementById("gostos-title");
  if (gostosTitle) {
    gostosTitle.textContent = `Gostos de ${nomeCompleto || dados.username || username}`;
  }

  const depsTitle = document.querySelector('.deps-tab h3');
  if (depsTitle) {
    depsTitle.textContent = `Depoimentos de ${nomeCompleto || dados.username || username}`;
  }

  const linksTitle = document.querySelector('.links-tab h3');
  if (linksTitle) {
    linksTitle.textContent = `Links de ${nomeCompleto || dados.username || username}`;
  }

  const amigosTitle = document.querySelector('.amigos-tab h3');
  if (amigosTitle) {
    amigosTitle.textContent = `Amigos de ${nomeCompleto || dados.username || username}`;
  }

  if (dados.pronoun1 || dados.pronoun2) {
    const pronomes = `${dados.pronoun1 || ''}/${dados.pronoun2 || ''}`.replace(/^\/|\/$/g, '');
    const handleElement = document.querySelector('.handle');
    if (handleElement && pronomes) {
      handleElement.innerHTML = `@${dados.username || username} • ${pronomes}`;
    }
  }
}

function atualizarVisaoGeral(dados) {
  const visaoTab = document.querySelector('.visao-tab .about-container');
  if (!visaoTab) return;

  const aboutBoxes = visaoTab.querySelectorAll('.about-box');
  
  if (aboutBoxes[0]) {
    const visaoGeral = dados.visaoGeral || "Informação não disponível";
    aboutBoxes[0].innerHTML = `<p><i>Visão geral:</i></p><p>${visaoGeral}</p>`;
  }

  if (aboutBoxes[1]) {
    const tags = dados.tags || "Informação não disponível";
    aboutBoxes[1].innerHTML = `<p><i>Tags:</i></p><p>${tags}</p>`;
  }

  if (aboutBoxes[2]) {
    const estilo = dados.estilo || "Informação não disponível";
    aboutBoxes[2].innerHTML = `<p><i>Meu Estilo:</i></p><p>${estilo}</p>`;
  }

  if (aboutBoxes[3]) {
    const personalidade = dados.personalidade || "Informação não disponível";
    aboutBoxes[3].innerHTML = `<p><i>Minha personalidade:</i></p><p>${personalidade}</p>`;
  }

  if (aboutBoxes[4]) {
    const sonhos = dados.sonhos || "Informação não disponível";
    aboutBoxes[4].innerHTML = `<p><i>Meus Sonhos e desejos:</i></p><p>${sonhos}</p>`;
  }

  if (aboutBoxes[5]) {
    const medos = dados.medos || "Informação não disponível";
    aboutBoxes[5].innerHTML = `<p><i>Meus Medos:</i></p><p>${medos}</p>`;
  }
}

function atualizarGostos(dados) {
  const gostosTab = document.querySelector('.gostos-tab .about-container');
  if (!gostosTab) return;

  const aboutBoxes = gostosTab.querySelectorAll('.about-box');

  if (aboutBoxes[0]) {
    const musicas = dados.musicas || "Informação não disponível";
    aboutBoxes[0].innerHTML = `<p><i>Músicas:</i></p><p>${musicas}</p>`;
  }

  if (aboutBoxes[1]) {
    const filmesSeries = dados.filmesSeries || "Informação não disponível";
    aboutBoxes[1].innerHTML = `<p><i>Filmes e Séries:</i></p><p>${filmesSeries}</p>`;
  }

  if (aboutBoxes[2]) {
    const livros = dados.livros || "Informação não disponível";
    aboutBoxes[2].innerHTML = `<p><i>Livros:</i></p><p>${livros}</p>`;
  }

  if (aboutBoxes[3]) {
    const personagens = dados.personagens || "Informação não disponível";
    aboutBoxes[3].innerHTML = `<p><i>Personagens:</i></p><p>${personagens}</p>`;
  }

  if (aboutBoxes[4]) {
    const comidas = dados.comidas || "Informação não disponível";
    aboutBoxes[4].innerHTML = `<p><i>Comidas e Bebidas:</i></p><p>${comidas}</p>`;
  }

  if (aboutBoxes[5]) {
    const hobbies = dados.hobbies || "Informação não disponível";
    aboutBoxes[5].innerHTML = `<p><i>Hobbies:</i></p><p>${hobbies}</p>`;
  }

  if (aboutBoxes[6]) {
    const jogos = dados.jogos || "Informação não disponível";
    aboutBoxes[6].innerHTML = `<p><i>Jogos favoritos:</i></p><p>${jogos}</p>`;
  }

  if (aboutBoxes[7]) {
    const outrosGostos = dados.outrosGostos || "Informação não disponível";
    aboutBoxes[7].innerHTML = `<p><i>Outros gostos:</i></p><p>${outrosGostos}</p>`;
  }
}

function atualizarImagensPerfil(dados) {
  const profilePic = document.querySelector('.profile-pic');
  if (profilePic) {
    if (dados.userphoto || dados.foto) {
      profilePic.src = dados.userphoto || dados.foto;
      profilePic.onerror = () => {
        profilePic.src = './src/icon/default.jpg';
      };
    } else {
      profilePic.src = './src/icon/default.jpg';
    }
  }

  const userPics = document.querySelectorAll('.user-pic');
  userPics.forEach(pic => {
    if (dados.userphoto || dados.foto) {
      pic.src = dados.userphoto || dados.foto;
      pic.onerror = () => {
        pic.src = './src/icon/default.jpg';
      };
    } else {
      pic.src = './src/icon/default.jpg';
    }
  });

  if (dados.backgroundphoto || dados.imagemFundo) {
    const profileHeader = document.querySelector('.profile-header');
    if (profileHeader) {
      const backgroundUrl = dados.backgroundphoto || dados.imagemFundo;
      profileHeader.style.backgroundImage = `url(${backgroundUrl})`;
      profileHeader.style.backgroundSize = 'cover';
      profileHeader.style.backgroundPosition = 'center';
      profileHeader.style.position = 'relative';
      profileHeader.style.backgroundAttachment = 'scroll';
    }
    
    const backgroundElements = document.querySelectorAll('.background-image, .hero-bg, .banner-bg');
    backgroundElements.forEach(element => {
      element.style.backgroundImage = `url(${backgroundUrl})`;
      element.style.backgroundSize = 'cover';
      element.style.backgroundPosition = 'center';
    });
  }

  if (dados.headerphoto) {
    const headerImages = document.querySelectorAll('.header-image, .banner-image, .cover-photo');
    headerImages.forEach(img => {
      if (img.tagName === 'IMG') {
        img.src = dados.headerphoto;
        img.onerror = () => {
          img.src = './src/bg/bg.jpg';
        };
      } else {
        img.style.backgroundImage = `url(${dados.headerphoto})`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
      }
    });
    
    if (!dados.backgroundphoto && !dados.imagemFundo) {
      const profileHeader = document.querySelector('.profile-header');
      if (profileHeader) {
        profileHeader.style.backgroundImage = `url(${dados.headerphoto})`;
        profileHeader.style.backgroundSize = 'cover';
        profileHeader.style.backgroundPosition = 'center';
      }
    }
  }

  const usernameSpans = document.querySelectorAll('.username');
  const displayName = dados.displayname || dados.username;
  usernameSpans.forEach(span => {
    if (displayName) {
      span.textContent = displayName;
    }
  });
}

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

function verificarLogin() {
  const usuarioLogado = localStorage.getItem('usuarioLogado');
  if (!usuarioLogado) {
    console.log("Usuário não está logado, redirecionando para login");
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

// ===================
// INICIALIZAÇÃO
// ===================
let liveStatusManager = null;

window.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Carregando página de perfil...");
  
  if (!verificarLogin()) {
    return;
  }
  
  // Inicializar Live Status
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (usuarioLogadoJSON) {
    const usuarioLogado = JSON.parse(usuarioLogadoJSON);
    liveStatusManager = new LiveStatusManager(usuarioLogado.username);
  }
  
  // Configurar navegação entre tabs
  configurarNavegacaoTabs();
  
  await carregarPerfilCompleto();
  await atualizarMarqueeUltimoUsuario();
  configurarLinks();
  
  console.log("✅ Página de perfil carregada com sucesso!");
});

// Cleanup ao sair da página
window.addEventListener('beforeunload', () => {
  if (liveStatusManager) {
    liveStatusManager.destroy();
  }
});

// Tornar funções globais para onclick
window.curtirPost = curtirPost;
window.abrirModalImagem = abrirModalImagem;
window.fecharModal = fecharModal;
window.mostrarOpcoesPost = mostrarOpcoesPost;
window.abrirComentarios = abrirComentarios;
window.compartilharPost = compartilharPost;
window.salvarPost = salvarPost;
window.carregarMaisPosts = carregarMaisPosts;
window.enviarDepoimento = enviarDepoimento;
window.excluirDepoimento = excluirDepoimento;
window.carregarDepoimentos = carregarDepoimentos;
window.carregarLinks = carregarLinks;

document.head.insertAdjacentHTML('beforeend', postCSS);