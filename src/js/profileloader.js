// ===================
// PERFIL.JS - Carregar e atualizar perfil
// ===================

import { 
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = getFirestore();

// -------------------
// Funções principais
// -------------------

// Determina qual usuário deve ser carregado (parâmetro da URL ou logado)
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

// Verifica se o perfil carregado é do próprio usuário
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

// Carrega todas as informações do perfil
export async function carregarPerfilCompleto() {
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
      atualizarVisaoGeral(dados, usernameParaCarregar);
      atualizarGostos(dados);
      atualizarImagensPerfil(dados);
      aplicarBackgroundHeaderPhoto(dados);

    } else {
      console.log("Usuário não encontrado no banco de dados");
      const nomeElement = document.getElementById("nomeCompleto");
      if (nomeElement) nomeElement.textContent = "Usuário não encontrado";
      const usernameElement = document.getElementById("username");
      if (usernameElement) usernameElement.textContent = "";
    }
  } catch (error) {
    console.error("Erro ao carregar perfil:", error);
  }
}

// -------------------
// Atualização de informações do perfil
// -------------------

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

function criarAboutBoxSobre(dados, username) {
  const nomeUsuario = dados.displayname || dados.username || username;
  const genero = dados.genero || "Não informado";
  const localizacao = dados.localizacao || "Não informada";
  const estadoCivil = dados.estadoCivil || "Não informado";

  return `
    <div class="about-box sobre-box" id="sobreBox">
      <div class="sobre-header">
        <h4>Sobre ${nomeUsuario}</h4>
      </div>
      <div class="sobre-content">
        <div class="info-item">
          <div class="info-details">
            <span class="info-icon"><i class="fas fa-user"></i></span>
            <span class="info-label">Gênero:</span>
            <span class="info-value">${genero}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-details">
            <span class="info-icon"><i class="fas fa-map-marker-alt"></i></span>
            <span class="info-label">Localização:</span>
            <span class="info-value">${localizacao}</span>
          </div>
        </div>
        <div class="info-item">
          <div class="info-details">
            <span class="info-icon"><i class="fas fa-heart"></i></span>
            <span class="info-label">Estado Civil:</span>
            <span class="info-value">${estadoCivil}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function atualizarVisaoGeral(dados, username) {
  const visaoTab = document.querySelector('.visao-tab .about-container');
  if (!visaoTab) return;

  let sobreBox = document.getElementById('sobreBox');
  if (!sobreBox) {
    const sobreBoxHTML = criarAboutBoxSobre(dados, username);
    visaoTab.insertAdjacentHTML('afterbegin', sobreBoxHTML);
  } else {
    sobreBox.outerHTML = criarAboutBoxSobre(dados, username);
  }

  const aboutBoxes = visaoTab.querySelectorAll('.about-box:not(.sobre-box)');

  if (aboutBoxes[0]) {
    aboutBoxes[0].innerHTML = `<p><i>Visão geral:</i></p><p>${dados.visaoGeral || "Informação não disponível"}</p>`;
  }

  if (aboutBoxes[1]) {
    aboutBoxes[1].innerHTML = `<p><i>Tags:</i></p><p>${dados.tags || "Informação não disponível"}</p>`;
  }

  if (aboutBoxes[2]) {
    aboutBoxes[2].innerHTML = `<p><i>Meu Estilo:</i></p><p>${dados.estilo || "Informação não disponível"}</p>`;
  }

  if (aboutBoxes[3]) {
    aboutBoxes[3].innerHTML = `<p><i>Minha personalidade:</i></p><p>${dados.personalidade || "Informação não disponível"}</p>`;
  }

  if (aboutBoxes[4]) {
    aboutBoxes[4].innerHTML = `<p><i>Meus Sonhos e desejos:</i></p><p>${dados.sonhos || "Informação não disponível"}</p>`;
  }

  if (aboutBoxes[5]) {
    aboutBoxes[5].innerHTML = `<p><i>Meus Medos:</i></p><p>${dados.medos || "Informação não disponível"}</p>`;
  }
}

function atualizarGostos(dados) {
  const gostosTab = document.querySelector('.gostos-tab .about-container');
  if (!gostosTab) return;

  const aboutBoxes = gostosTab.querySelectorAll('.about-box');

  if (aboutBoxes[0]) aboutBoxes[0].innerHTML = `<p><i>Músicas:</i></p><p>${dados.musicas || "Informação não disponível"}</p>`;
  if (aboutBoxes[1]) aboutBoxes[1].innerHTML = `<p><i>Filmes e Séries:</i></p><p>${dados.filmesSeries || "Informação não disponível"}</p>`;
  if (aboutBoxes[2]) aboutBoxes[2].innerHTML = `<p><i>Livros:</i></p><p>${dados.livros || "Informação não disponível"}</p>`;
  if (aboutBoxes[3]) aboutBoxes[3].innerHTML = `<p><i>Personagens:</i></p><p>${dados.personagens || "Informação não disponível"}</p>`;
  if (aboutBoxes[4]) aboutBoxes[4].innerHTML = `<p><i>Comidas e Bebidas:</i></p><p>${dados.comidas || "Informação não disponível"}</p>`;
  if (aboutBoxes[5]) aboutBoxes[5].innerHTML = `<p><i>Hobbies:</i></p><p>${dados.hobbies || "Informação não disponível"}</p>`;
  if (aboutBoxes[6]) aboutBoxes[6].innerHTML = `<p><i>Jogos favoritos:</i></p><p>${dados.jogos || "Informação não disponível"}</p>`;
  if (aboutBoxes[7]) aboutBoxes[7].innerHTML = `<p><i>Outros gostos:</i></p><p>${dados.outrosGostos || "Informação não disponível"}</p>`;
}

function atualizarImagensPerfil(dados) {
  const profilePic = document.querySelector('.profile-pic');
  if (profilePic) {
    profilePic.src = dados.userphoto || dados.foto || './src/icon/default.jpg';
    profilePic.onerror = () => profilePic.src = './src/icon/default.jpg';
  }

  const userPics = document.querySelectorAll('.user-pic');
  userPics.forEach(pic => {
    pic.src = dados.userphoto || dados.foto || './src/icon/default.jpg';
    pic.onerror = () => pic.src = './src/icon/default.jpg';
  });

  if (dados.backgroundphoto || dados.imagemFundo) {
    const profileHeader = document.querySelector('.profile-header');
    if (profileHeader) {
      const backgroundUrl = dados.backgroundphoto || dados.imagemFundo;
      profileHeader.style.backgroundImage = `url(${backgroundUrl})`;
      profileHeader.style.backgroundSize = 'cover';
      profileHeader.style.backgroundPosition = 'center';
    }
  }

  if (dados.headerphoto) {
    const headerImages = document.querySelectorAll('.header-image, .banner-image, .cover-photo');
    headerImages.forEach(img => {
      if (img.tagName === 'IMG') {
        img.src = dados.headerphoto;
        img.onerror = () => img.src = './src/bg/bg.jpg';
      } else {
        img.style.backgroundImage = `url(${dados.headerphoto})`;
        img.style.backgroundSize = 'cover';
        img.style.backgroundPosition = 'center';
      }
    });
  }

  const usernameSpans = document.querySelectorAll('.username');
  const displayName = dados.displayname || dados.username;
  usernameSpans.forEach(span => {
    if (displayName) span.textContent = displayName;
  });
}

function aplicarBackgroundHeaderPhoto(dados) {
  if (dados.headerphoto) {
    const body = document.body;
    body.style.backgroundImage = `url(${dados.headerphoto})`;
    body.style.backgroundSize = 'cover';
    body.style.backgroundPosition = 'center';
    body.style.backgroundAttachment = 'fixed';
    body.style.backgroundRepeat = 'no-repeat';
  }
}

export { determinarUsuarioParaCarregar, isPerfilProprio };
