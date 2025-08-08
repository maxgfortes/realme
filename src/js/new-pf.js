// profile-features.js
// Funcionalidades extras para o perfil: Background, Depoimentos, Seguir/Seguindo

// Aguardar que o Firebase seja carregado
document.addEventListener('DOMContentLoaded', function() {
  // Aguardar um pouco para garantir que o Firebase foi inicializado
  setTimeout(initializeProfileFeatures, 1000);
});

function initializeProfileFeatures() {
  console.log('🚀 Inicializando funcionalidades extras do perfil...');
  
  // Verificar se as variáveis do Firebase estão disponíveis
  if (typeof db === 'undefined' || typeof rtdb === 'undefined') {
    console.warn('⚠️ Firebase ainda não carregado, tentando novamente...');
    setTimeout(initializeProfileFeatures, 1000);
    return;
  }
  
  console.log('✅ Firebase detectado, funcionalidades prontas!');
}

// ===================
// 1. SISTEMA DE BACKGROUND NO BODY
// ===================
function aplicarBackgroundBody(dados) {
  const body = document.body;
  
  if (dados.headerphoto) {
    // Criar overlay se não existir
    let overlay = document.querySelector('.body-background-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'body-background-overlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        opacity: 0.1;
        background-size: cover;
        background-position: center;
        background-repeat: no-repeat;
        background-attachment: fixed;
        pointer-events: none;
      `;
      body.insertBefore(overlay, body.firstChild);
    }
    
    overlay.style.backgroundImage = `url(${dados.headerphoto})`;
    console.log('✅ Background aplicado no body:', dados.headerphoto);
  }
}

// ===================
// 2. SISTEMA DE DEPOIMENTOS
// ===================
async function carregarDepoimentos(username) {
  console.log('🔄 Carregando depoimentos para:', username);
  
  const depsTab = document.querySelector('.deps-tab .about-container');
  if (!depsTab) return;

  // Mostrar loading
  depsTab.innerHTML = `
    <div class="loading-depoimentos">
      <div class="loading-spinner"></div>
      <p>Carregando depoimentos...</p>
    </div>
  `;

  try {
    // Acessar Firebase através do objeto global
    const { collection, query, orderBy, getDocs, doc, getDoc } = window.firestore;
    
    const depoimentosRef = collection(window.db, 'users', username, 'depoimentos');
    const depoimentosQuery = query(depoimentosRef, orderBy('criadoem', 'desc'));
    const snapshot = await getDocs(depoimentosQuery);

    // Limpar container
    depsTab.innerHTML = '';

    // Adicionar botão de enviar depoimento (só para outros usuários)
    if (!isPerfilProprio()) {
      const botaoEnviar = document.createElement('div');
      botaoEnviar.className = 'enviar-depoimento-container';
      botaoEnviar.innerHTML = `
        <button class="btn-enviar-depoimento" onclick="abrirModalDepoimento('${username}')">
          <i class="fas fa-pen"></i>
          Enviar Depoimento
        </button>
      `;
      depsTab.appendChild(botaoEnviar);
    }

    if (snapshot.empty) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-depoimentos';
      emptyDiv.innerHTML = `
        <div class="empty-icon">
          <i class="fas fa-comments"></i>
        </div>
        <h3>Nenhum depoimento ainda</h3>
        <p>${isPerfilProprio() ? 'Você ainda não recebeu depoimentos.' : 'Este usuário ainda não recebeu depoimentos.'}</p>
      `;
      depsTab.appendChild(emptyDiv);
      return;
    }

    // Buscar dados dos autores dos depoimentos
    const depoimentos = [];
    for (const docSnap of snapshot.docs) {
      const depData = docSnap.data();
      
      // Buscar dados do autor
      let autorData = { username: depData.username, displayname: depData.username };
      try {
        const autorRef = doc(window.db, 'users', depData.username);
        const autorDoc = await getDoc(autorRef);
        if (autorDoc.exists()) {
          autorData = autorDoc.data();
        }
      } catch (error) {
        console.warn('Erro ao buscar dados do autor:', error);
      }

      depoimentos.push({
        id: docSnap.id,
        ...depData,
        autorData
      });
    }

    // Criar elementos dos depoimentos
    depoimentos.forEach(dep => {
      const depElement = criarElementoDepoimento(dep);
      depsTab.appendChild(depElement);
    });

    console.log(`✅ ${depoimentos.length} depoimentos carregados`);

  } catch (error) {
    console.error('❌ Erro ao carregar depoimentos:', error);
    depsTab.innerHTML = `
      <div class="error-depoimentos">
        <div class="error-icon">
          <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3>Erro ao carregar depoimentos</h3>
        <p>Não foi possível carregar os depoimentos. Tente novamente.</p>
        <button onclick="carregarDepoimentos('${username}')" class="btn-secondary">Tentar novamente</button>
      </div>
    `;
  }
}

function criarElementoDepoimento(depoimento) {
  const depDiv = document.createElement('div');
  depDiv.className = 'depoimento-card';
  
  const dataFormatada = formatarDataPost(depoimento.criadoem);
  const autorFoto = depoimento.autorData.userphoto || depoimento.autorData.foto || './src/icon/default.jpg';
  const autorNome = depoimento.autorData.displayname || depoimento.autorData.username;

  depDiv.innerHTML = `
    <div class="dep-header">
      <div class="dep-autor">
        <img src="${autorFoto}" alt="Foto do autor" class="dep-autor-foto" 
             onerror="this.src='./src/icon/default.jpg'">
        <div class="dep-autor-info">
          <span class="dep-autor-nome">${autorNome}</span>
          <span class="dep-autor-username">@${depoimento.username}</span>
          <span class="dep-data">${dataFormatada}</span>
        </div>
      </div>
    </div>
    <div class="dep-conteudo">
      <p>${depoimento.conteudo}</p>
    </div>
  `;

  return depDiv;
}

// Modal para enviar depoimento
function abrirModalDepoimento(username) {
  const modal = document.createElement('div');
  modal.className = 'depoimento-modal';
  modal.innerHTML = `
    <div class="modal-overlay" onclick="fecharModalDepoimento()">
      <div class="modal-content" onclick="event.stopPropagation()">
        <div class="modal-header">
          <h3>Enviar Depoimento</h3>
          <button class="modal-close" onclick="fecharModalDepoimento()">
            <i class="fas fa-times"></i>
          </button>
        </div>
        <div class="modal-body">
          <textarea id="depoimentoTexto" 
                    placeholder="Escreva seu depoimento sobre este usuário..." 
                    maxlength="500"></textarea>
          <div class="char-count">
            <span id="charCount">0</span>/500 caracteres
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancelar" onclick="fecharModalDepoimento()">Cancelar</button>
          <button class="btn-enviar" onclick="enviarDepoimento('${username}')">
            <i class="fas fa-paper-plane"></i>
            Enviar Depoimento
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  document.body.style.overflow = 'hidden';

  // Contador de caracteres
  const textarea = document.getElementById('depoimentoTexto');
  const charCount = document.getElementById('charCount');
  
  textarea.addEventListener('input', () => {
    charCount.textContent = textarea.value.length;
    if (textarea.value.length > 450) {
      charCount.style.color = '#dc3545';
    } else {
      charCount.style.color = '#666';
    }
  });

  textarea.focus();
}

function fecharModalDepoimento() {
  const modal = document.querySelector('.depoimento-modal');
  if (modal) {
    modal.remove();
    document.body.style.overflow = 'auto';
  }
}

async function enviarDepoimento(usernameDestino) {
  const textarea = document.getElementById('depoimentoTexto');
  const btnEnviar = document.querySelector('.btn-enviar');
  const conteudo = textarea.value.trim();

  if (!conteudo) {
    alert('Por favor, escreva algo no depoimento.');
    return;
  }

  if (conteudo.length > 500) {
    alert('O depoimento deve ter no máximo 500 caracteres.');
    return;
  }

  // Verificar se usuário está logado
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (!usuarioLogadoJSON) {
    alert('Você precisa estar logado para enviar um depoimento.');
    return;
  }

  const usuarioLogado = JSON.parse(usuarioLogadoJSON);

  // Desabilitar botão
  btnEnviar.disabled = true;
  btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

  try {
    // Acessar Firebase através do objeto global
    const { doc, setDoc, serverTimestamp } = window.firestore;
    
    // Gerar ID único para o depoimento
    const depId = `dep-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Criar depoimento
    const novoDepoimento = {
      conteudo: conteudo,
      username: usuarioLogado.username,
      criadoem: serverTimestamp()
    };

    // Salvar no Firebase
    const depRef = doc(window.db, 'users', usernameDestino, 'depoimentos', depId);
    await setDoc(depRef, novoDepoimento);

    console.log('✅ Depoimento enviado com sucesso');
    
    // Fechar modal
    fecharModalDepoimento();
    
    // Recarregar depoimentos
    await carregarDepoimentos(usernameDestino);
    
    // Mostrar sucesso
    mostrarNotificacao('Depoimento enviado com sucesso!', 'success');

  } catch (error) {
    console.error('❌ Erro ao enviar depoimento:', error);
    alert('Erro ao enviar depoimento. Tente novamente.');
    
    // Reabilitar botão
    btnEnviar.disabled = false;
    btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Depoimento';
  }
}

// ===================
// 3. SISTEMA DE SEGUIR/SEGUINDO
// ===================
async function carregarSeguidoresESeguindo(username) {
  console.log('🔄 Carregando seguidores e seguindo para:', username);
  
  try {
    // Acessar Firebase através do objeto global
    const { collection, getDocs } = window.firestore;
    
    // Carregar seguidores
    const seguidoresRef = collection(window.db, 'users', username, 'seguidores', 'users');
    const seguidoresSnapshot = await getDocs(seguidoresRef);
    const numSeguidores = seguidoresSnapshot.size;

    // Carregar seguindo
    const seguindoRef = collection(window.db, 'users', username, 'seguindo', 'users');
    const seguindoSnapshot = await getDocs(seguindoRef);
    const numSeguindo = seguindoSnapshot.size;

    // Atualizar interface
    const statsElement = document.querySelector('.profile-stats');
    if (statsElement) {
      const spans = statsElement.querySelectorAll('span');
      if (spans[1]) spans[1].innerHTML = `<strong>${numSeguidores}</strong> seguidores`;
      if (spans[3]) spans[3].innerHTML = `<strong>${numSeguindo}</strong> seguindo`;
    }

    // Verificar se já está seguindo (se não for o próprio perfil)
    if (!isPerfilProprio()) {
      await verificarSeJaSeguindo(username);
    }

    console.log(`✅ Seguidores: ${numSeguidores}, Seguindo: ${numSeguindo}`);

  } catch (error) {
    console.error('❌ Erro ao carregar seguidores/seguindo:', error);
  }
}

async function verificarSeJaSeguindo(username) {
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (!usuarioLogadoJSON) return;

  const usuarioLogado = JSON.parse(usuarioLogadoJSON);
  
  try {
    // Acessar Firebase através do objeto global
    const { doc, getDoc } = window.firestore;
    
    const seguidorRef = doc(window.db, 'users', username, 'seguidores', 'users', usuarioLogado.username);
    const seguidorDoc = await getDoc(seguidorRef);
    
    const btnSeguir = document.querySelector('.btn-follow');
    if (btnSeguir) {
      if (seguidorDoc.exists()) {
        btnSeguir.textContent = 'seguindo';
        btnSeguir.classList.add('seguindo');
        btnSeguir.onclick = () => deixarDeSeguir(username);
      } else {
        btnSeguir.textContent = 'seguir';
        btnSeguir.classList.remove('seguindo');
        btnSeguir.onclick = () => seguirUsuario(username);
      }
    }
  } catch (error) {
    console.error('Erro ao verificar se já está seguindo:', error);
  }
}

async function seguirUsuario(username) {
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (!usuarioLogadoJSON) {
    alert('Você precisa estar logado para seguir usuários.');
    return;
  }

  const usuarioLogado = JSON.parse(usuarioLogadoJSON);
  const btnSeguir = document.querySelector('.btn-follow');
  
  // Não pode seguir a si mesmo
  if (usuarioLogado.username === username) {
    alert('Você não pode seguir a si mesmo.');
    return;
  }

  btnSeguir.disabled = true;
  btnSeguir.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    // Acessar Firebase através do objeto global
    const { writeBatch, doc, serverTimestamp } = window.firestore;
    
    const batch = writeBatch(window.db);

    // Adicionar aos seguidores do usuário alvo
    const seguidorRef = doc(window.db, 'users', username, 'seguidores', 'users', usuarioLogado.username);
    batch.set(seguidorRef, {
      username: usuarioLogado.username,
      criadoem: serverTimestamp()
    });

    // Adicionar aos seguindo do usuário logado
    const seguindoRef = doc(window.db, 'users', usuarioLogado.username, 'seguindo', 'users', username);
    batch.set(seguindoRef, {
      username: username,
      criadoem: serverTimestamp()
    });

    await batch.commit();

    btnSeguir.textContent = 'seguindo';
    btnSeguir.classList.add('seguindo');
    btnSeguir.onclick = () => deixarDeSeguir(username);
    
    // Atualizar contadores
    await carregarSeguidoresESeguindo(username);
    
    mostrarNotificacao(`Você começou a seguir @${username}`, 'success');
    console.log(`✅ Seguindo ${username}`);

  } catch (error) {
    console.error('❌ Erro ao seguir usuário:', error);
    alert('Erro ao seguir usuário. Tente novamente.');
  } finally {
    btnSeguir.disabled = false;
  }
}

async function deixarDeSeguir(username) {
  const usuarioLogadoJSON = localStorage.getItem('usuarioLogado');
  if (!usuarioLogadoJSON) return;

  const usuarioLogado = JSON.parse(usuarioLogadoJSON);
  const btnSeguir = document.querySelector('.btn-follow');

  btnSeguir.disabled = true;
  btnSeguir.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

  try {
    // Acessar Firebase através do objeto global
    const { writeBatch, doc } = window.firestore;
    
    const batch = writeBatch(window.db);

    // Remover dos seguidores do usuário alvo
    const seguidorRef = doc(window.db, 'users', username, 'seguidores', 'users', usuarioLogado.username);
    batch.delete(seguidorRef);

    // Remover dos seguindo do usuário logado
    const seguindoRef = doc(window.db, 'users', usuarioLogado.username, 'seguindo', 'users', username);
    batch.delete(seguindoRef);

    await batch.commit();

    btnSeguir.textContent = 'seguir';
    btnSeguir.classList.remove('seguindo');
    btnSeguir.onclick = () => seguirUsuario(username);
    
    // Atualizar contadores
    await carregarSeguidoresESeguindo(username);
    
    mostrarNotificacao(`Você deixou de seguir @${username}`, 'info');
    console.log(`✅ Deixou de seguir ${username}`);

  } catch (error) {
    console.error('❌ Erro ao deixar de seguir:', error);
    alert('Erro ao deixar de seguir. Tente novamente.');
  } finally {
    btnSeguir.disabled = false;
  }
}

// ===================
// 4. ATUALIZAÇÃO DOS TÍTULOS DAS TABS
// ===================
function atualizarTitulosTabs(dados, username) {
  const nomeCompleto = dados.displayname || `${dados.nome || ''} ${dados.sobrenome || ''}`.trim();
  const nomeParaExibir = nomeCompleto || dados.username || username;

  // Título da aba de depoimentos
  const tituloDepoimentos = document.querySelector('.deps-tab h3');
  if (tituloDepoimentos) {
    tituloDepoimentos.textContent = `Depoimentos de ${nomeParaExibir}`;
  }

  // Título da aba de links
  const tituloLinks = document.querySelector('.links-tab h3');
  if (tituloLinks) {
    tituloLinks.textContent = `Links de ${nomeParaExibir}`;
  }

  // Título da aba de gostos
  const tituloGostos = document.querySelector('.gostos-tab h3');
  if (tituloGostos) {
    tituloGostos.textContent = `Gostos de ${nomeParaExibir}`;
  }
}

// ===================
// 5. SISTEMA DE NOTIFICAÇÕES
// ===================
function mostrarNotificacao(mensagem, tipo = 'info') {
  // Remover notificação anterior se existir
  const notifAnterior = document.querySelector('.notification-toast');
  if (notifAnterior) {
    notifAnterior.remove();
  }

  const notificacao = document.createElement('div');
  notificacao.className = `notification-toast ${tipo}`;
  
  const icons = {
    success: 'fa-check-circle',
    error: 'fa-exclamation-circle',
    warning: 'fa-exclamation-triangle',
    info: 'fa-info-circle'
  };

  notificacao.innerHTML = `
    <div class="notification-content">
      <i class="fas ${icons[tipo] || icons.info}"></i>
      <span>${mensagem}</span>
    </div>
  `;

  document.body.appendChild(notificacao);

  // Mostrar notificação
  setTimeout(() => {
    notificacao.classList.add('show');
  }, 100);

  // Remover após 3 segundos
  setTimeout(() => {
    notificacao.classList.remove('show');
    setTimeout(() => {
      if (notificacao.parentNode) {
        notificacao.remove();
      }
    }, 300);
  }, 3000);
}

// ===================
// 6. FUNÇÕES UTILITÁRIAS
// ===================
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

// Função para formatar data (se não existir)
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

// ===================
// 7. EXPOR FUNÇÕES GLOBALMENTE
// ===================
window.aplicarBackgroundBody = aplicarBackgroundBody;
window.carregarDepoimentos = carregarDepoimentos;
window.abrirModalDepoimento = abrirModalDepoimento;
window.fecharModalDepoimento = fecharModalDepoimento;
window.enviarDepoimento = enviarDepoimento;
window.carregarSeguidoresESeguindo = carregarSeguidoresESeguindo;
window.seguirUsuario = seguirUsuario;
window.deixarDeSeguir = deixarDeSeguir;
window.atualizarTitulosTabs = atualizarTitulosTabs;
window.mostrarNotificacao = mostrarNotificacao;

// ===================
// 8. INTEGRAÇÃO COM A FUNÇÃO PRINCIPAL
// ===================
// Função para chamar todas as novas funcionalidades
window.carregarFuncionalidadesExtras = async function(dados, username) {
  try {
    console.log('🚀 Carregando funcionalidades extras...');
    
    // Aplicar background
    aplicarBackgroundBody(dados);
    
    // Atualizar títulos
    atualizarTitulosTabs(dados, username);
    
    // Carregar dados dinâmicos
    await carregarDepoimentos(username);
    await carregarSeguidoresESeguindo(username);
    
    console.log('✅ Funcionalidades extras carregadas!');
  } catch (error) {
    console.error('❌ Erro ao carregar funcionalidades extras:', error);
  }
};

console.log('📄 profile-features.js carregado!');