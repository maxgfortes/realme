// Aguarda o DOM estar completamente carregado antes de executar o script.
document.addEventListener('DOMContentLoaded', async () => {

    // =========================================================================
    // 1. Inicialização do Firebase e Autenticação
    // =========================================================================
    // Variáveis globais fornecidas pelo ambiente do Canvas.
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    // Importações do Firebase
    const { initializeApp } = firebase;
    const { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } = firebase.auth;
    const { getFirestore, doc, getDoc, setDoc, addDoc, collection, query, getDocs, orderBy, deleteDoc, updateDoc } = firebase.firestore;
    const { getDatabase, ref, onValue, set, onDisconnect, serverTimestamp } = firebase.database;

    // Inicializa o Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);
    const auth = getAuth(app);
    const rtdb = getDatabase(app);

    // Variáveis para armazenar o usuário e o perfil
    let userId = null;
    let userProfile = null;
    let liveStatusManager = null;

    // Autentica o usuário no Firebase
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }
    } catch (error) {
        console.error("Authentication failed:", error);
    }

    // Listener para o estado de autenticação
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            userId = user.uid;
            console.log("✅ Usuário autenticado com UID:", userId);
            
            // Inicia o resto da aplicação
            await initializeProfilePage();
            
        } else {
            console.log("❌ Usuário não autenticado.");
            // Lógica para lidar com a falta de autenticação, se necessário.
            // Por exemplo, redirecionar para uma página de login.
        }
    });

    /**
     * Inicializa a página de perfil após a autenticação do usuário.
     */
    async function initializeProfilePage() {
        const params = new URLSearchParams(window.location.search);
        // O perfil que estamos visualizando é definido por 'userId' na URL.
        // Se não houver 'userId', o usuário está vendo o seu próprio perfil.
        const targetUserId = params.get("userId") || userId;
        
        // Carrega os dados do perfil
        userProfile = await fetchUserProfile(targetUserId);

        if (userProfile) {
            populateProfile(userProfile);
            setupTabs();
            // A LiveStatusManager agora usa o userId
            if (!liveStatusManager) {
                liveStatusManager = new LiveStatusManager(userId);
            }
            createMuralPosts(targetUserId);
            carregarDepoimentos(targetUserId);
            configurarBotaoSeguir(targetUserId);
        } else {
            console.error("Perfil do usuário não encontrado.");
            // Opcional: mostrar uma mensagem de erro na tela
            document.body.innerHTML = '<h1>Perfil não encontrado.</h1>';
        }
    }

    // =========================================================================
    // 2. Funções de Busca e Preenchimento de Dados
    // =========================================================================
    /**
     * Busca os dados do perfil de um usuário no Firestore.
     * @param {string} uid O UID do usuário a ser buscado.
     * @returns {Promise<Object|null>} Os dados do perfil ou null se não for encontrado.
     */
    async function fetchUserProfile(uid) {
        if (!uid) return null;
        try {
            const userRef = doc(db, 'users', uid);
            const userSnap = await getDoc(userRef);
            if (userSnap.exists()) {
                console.log("✅ Dados do perfil carregados com sucesso.");
                return userSnap.data();
            } else {
                console.log("❌ Perfil não encontrado para o UID:", uid);
                return null;
            }
        } catch (error) {
            console.error("Erro ao buscar perfil:", error);
            return null;
        }
    }
    
    /**
     * Preenche os elementos HTML do perfil com os dados do objeto do usuário.
     * @param {Object} data Os dados do perfil.
     */
    function populateProfile(data) {
        // Preenche o cabeçalho do perfil
        document.getElementById('nomeCompleto').textContent = data.nomeCompleto || 'Nome Completo';
        document.getElementById('username').textContent = `@${data.username || 'username'}`;
        
        // Preenche as estatísticas do perfil (serão atualizadas dinamicamente)
        const stats = document.querySelectorAll('.profile-stats span strong');
        if (stats[0]) stats[0].textContent = data.stats?.posts || 0;
        if (stats[1]) stats[1].textContent = data.stats?.seguidores || 0;
        if (stats[2]) stats[2].textContent = data.stats?.amigos || 0;
        if (stats[3]) stats[3].textContent = data.stats?.seguindo || 0;

        // Preenche os títulos das abas
        const nomeCurto = data.nomeCompleto ? data.nomeCompleto.split(' ')[0] : 'Usuário';
        document.getElementById('tituloMural').textContent = `Mural de ${nomeCurto}`;
        document.getElementById('visao-geral-title').textContent = `Visão Geral de ${nomeCurto}`;
        document.getElementById('gostos-title').textContent = `Gostos de ${nomeCurto}`;
        document.getElementById('deps-title').textContent = `Depoimentos de ${nomeCurto}`;
        document.getElementById('links-title').textContent = `Links de ${nomeCurto}`;
        document.getElementById('amigos-title').textContent = `Amigos de ${nomeCurto}`;

        // Preenche os detalhes da Visão Geral
        const visaoGeralElements = document.querySelector('.visao-tab');
        if (visaoGeralElements) {
            const infoValues = visaoGeralElements.querySelectorAll('.info-value');
            if (infoValues[0]) infoValues[0].textContent = data.genero || 'Não informado';
            if (infoValues[1]) infoValues[1].textContent = data.localizacao || 'Não informado';
            if (infoValues[2]) infoValues[2].textContent = data.estadoCivil || 'Não informado';

            const aboutContents = visaoGeralElements.querySelectorAll('.about-box p:not(.about-contant)');
            const about = data.about || {};
            if (aboutContents[0]) aboutContents[0].textContent = about.overview || 'esta opção nao esta disponível no momento...';
            if (aboutContents[1]) aboutContents[1].textContent = about.sobreMim || 'esta opção nao esta disponível no momento...';
            if (aboutContents[2]) aboutContents[2].textContent = about.meuEstilo || 'esta opção nao esta disponível no momento...';
            if (aboutContents[3]) aboutContents[3].textContent = about.minhaPersonalidade || 'esta opção nao esta disponível no momento...';
            if (aboutContents[4]) aboutContents[4].textContent = about.sonhosDesejos || 'esta opção nao esta disponível no momento...';
            if (aboutContents[5]) aboutContents[5].textContent = about.medos || 'esta opção nao esta disponível no momento...';
        }

        // Preenche os gostos
        const gostosContainer = document.querySelector('.gostos-tab .about-container');
        if (gostosContainer && data.gostos) {
            gostosContainer.innerHTML = '';
            for (const key in data.gostos) {
                if (data.gostos.hasOwnProperty(key)) {
                    const title = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
                    const content = Array.isArray(data.gostos[key]) ? data.gostos[key].join(", ") : data.gostos[key];
                    const box = `
                        <div class="about-box">
                            <p class="about-contant"><i>${title}:</i></p>
                            <p>${content || 'esta opção nao esta disponível no momento...'}</p>
                        </div>
                    `;
                    gostosContainer.innerHTML += box;
                }
            }
        }
    }

    /**
     * Cria posts de exemplo para o mural e os insere no container.
     * @param {string} targetUserId O UID do usuário cujo mural será exibido.
     */
    async function createMuralPosts(targetUserId) {
        const muralPostsContainer = document.getElementById('muralPosts');
        if (!muralPostsContainer) return;
        muralPostsContainer.innerHTML = ''; // Limpa o conteúdo existente

        try {
            const postsRef = collection(db, 'users', targetUserId, 'posts');
            const postsSnap = await getDocs(postsRef);

            if (postsSnap.empty) {
                muralPostsContainer.innerHTML = '<p>Nenhum post encontrado.</p>';
                return;
            }

            postsSnap.forEach(postDoc => {
                const post = postDoc.data();
                const postElement = document.createElement('div');
                postElement.classList.add('mural-post');
                
                const postContent = `
                    <img src="${post.image}" alt="Imagem do mural" class="mural-image" onerror="this.onerror=null;this.src='https://placehold.co/400x300?text=Image+not+found';">
                    <p>${post.text}</p>
                `;
                
                postElement.innerHTML = postContent;
                muralPostsContainer.appendChild(postElement);
            });
        } catch (error) {
            console.error("Erro ao carregar posts:", error);
            muralPostsContainer.innerHTML = '<p>Ocorreu um erro ao carregar os posts.</p>';
        }
    }

    // =========================================================================
    // 3. Lógica de Abas e Navegação (mantida, mas sem dados de exemplo)
    // =========================================================================
    const menuItems = document.querySelectorAll('.profile-menu .menu-item');
    const tabs = document.querySelectorAll('.tab');
    
    /**
     * Adiciona um ouvinte de evento de clique a cada item do menu para alternar as abas.
     */
    function setupTabs() {
        menuItems.forEach(item => {
            item.addEventListener('click', () => {
                menuItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                tabs.forEach(tab => tab.classList.remove('active'));
                
                const targetTabClass = item.querySelector('p').textContent.toLowerCase().replace(' ', '-').replace('mural', 'mural-tab').replace('visão-geral', 'visao-tab').replace('gostos', 'gostos-tab').replace('depoimentos', 'deps-tab').replace('links', 'links-tab');
                const targetTab = document.querySelector(`.${targetTabClass}`);
                
                if (targetTab) {
                    targetTab.classList.add('active');
                }
            });
        });
    }

    // =========================================================================
    // 4. Lógica de Seguir/Deixar de Seguir e Estatísticas
    // =========================================================================

    /**
     * Verifica se o usuário atual está seguindo o usuário do perfil.
     * @param {string} currentUserId O UID do usuário logado.
     * @param {string} targetUserId O UID do usuário do perfil.
     * @returns {Promise<boolean>} True se estiver seguindo, false caso contrário.
     */
    async function verificarSeEstaSeguindo(currentUserId, targetUserId) {
      if (!currentUserId || !targetUserId) return false;
      try {
        const seguindoRef = doc(db, 'users', currentUserId, 'seguindo', 'users');
        const seguindoDoc = await getDoc(seguindoRef);
        if (seguindoDoc.exists()) {
          const seguindoData = seguindoDoc.data();
          return seguindoData.hasOwnProperty(targetUserId);
        }
        return false;
      } catch (error) {
        console.error('Erro ao verificar seguimento:', error);
        return false;
      }
    }
    
    /**
     * Atualiza as estatísticas de posts, seguidores e seguindo no perfil.
     * @param {string} targetUserId O UID do usuário a ter as estatísticas atualizadas.
     */
    async function atualizarEstatisticasPerfil(targetUserId) {
        try {
            // Contar posts
            const postsRef = collection(db, 'users', targetUserId, 'posts');
            const postsSnapshot = await getDocs(postsRef);
            const numPosts = postsSnapshot.size;

            // Contar seguidores
            const seguidoresRef = doc(db, 'users', targetUserId, 'seguidores', 'users');
            const seguidoresDoc = await getDoc(seguidoresRef);
            const numSeguidores = seguidoresDoc.exists() ? Object.keys(seguidoresDoc.data()).length : 0;

            // Contar seguindo
            const seguindoRef = doc(db, 'users', targetUserId, 'seguindo', 'users');
            const seguindoDoc = await getDoc(seguindoRef);
            const numSeguindo = seguindoDoc.exists() ? Object.keys(seguindoDoc.data()).length : 0;

            // Atualizar o DOM
            const statsElement = document.querySelector('.profile-stats');
            if (statsElement) {
                const stats = statsElement.querySelectorAll('strong');
                if (stats[0]) stats[0].textContent = numPosts;
                if (stats[1]) stats[1].textContent = numSeguidores;
                if (stats[3]) stats[3].textContent = numSeguindo;
            }

            console.log(`Estatísticas atualizadas para o UID ${targetUserId}`);
        } catch (error) {
            console.error('Erro ao atualizar estatísticas:', error);
        }
    }

    /**
     * Configura o botão de "seguir" ou "editar perfil".
     * @param {string} targetUserId O UID do usuário do perfil sendo visualizado.
     */
    async function configurarBotaoSeguir(targetUserId) {
        const followBtn = document.querySelector('.btn-follow');
        if (!followBtn) return;

        // Se o usuário logado estiver visualizando o próprio perfil
        if (targetUserId === userId) {
            followBtn.style.display = 'none'; 
            const editBtn = document.createElement('button');
            editBtn.textContent = 'Editar perfil';
            editBtn.className = 'btn-edit-profile';
            editBtn.onclick = () => {
                window.location.href = 'config.html';
            };
            followBtn.parentNode.appendChild(editBtn);
            return;
        }

        let isFollowing = await verificarSeEstaSeguindo(userId, targetUserId);
        
        followBtn.textContent = isFollowing ? 'seguindo' : 'seguir';
        followBtn.className = isFollowing ? 'btn-follow following' : 'btn-follow';

        followBtn.onclick = async () => {
            followBtn.disabled = true;
            followBtn.textContent = 'carregando...';

            try {
                if (isFollowing) {
                    await deixarDeSeguir(userId, targetUserId);
                    isFollowing = false;
                } else {
                    await seguirUsuario(userId, targetUserId);
                    isFollowing = true;
                }
                
                followBtn.textContent = isFollowing ? 'seguindo' : 'seguir';
                followBtn.className = isFollowing ? 'btn-follow following' : 'btn-follow';
                
                await atualizarEstatisticasPerfil(targetUserId);
                
            } catch (error) {
                console.error('Erro ao processar seguimento:', error);
                followBtn.textContent = 'erro';
            } finally {
                followBtn.disabled = false;
            }
        };
    }

    /**
     * Lógica para seguir um usuário.
     * @param {string} currentUserId O UID do usuário logado.
     * @param {string} targetUserId O UID do usuário a ser seguido.
     */
    async function seguirUsuario(currentUserId, targetUserId) {
      if (!currentUserId || !targetUserId) return;
      try {
        // Adiciona o usuário logado à lista de seguidores do alvo
        const seguidoresRef = doc(db, 'users', targetUserId, 'seguidores', 'users');
        const seguidoresDoc = await getDoc(seguidoresRef);
        let seguidoresData = seguidoresDoc.exists() ? seguidoresDoc.data() : {};
        seguidoresData[currentUserId] = true;
        await setDoc(seguidoresRef, seguidoresData);

        // Adiciona o alvo à lista de "seguindo" do usuário logado
        const seguindoRef = doc(db, 'users', currentUserId, 'seguindo', 'users');
        const seguindoDoc = await getDoc(seguindoRef);
        let seguindoData = seguindoDoc.exists() ? seguindoDoc.data() : {};
        seguindoData[targetUserId] = true;
        await setDoc(seguindoRef, seguindoData);
        
      } catch (error) {
        console.error('Erro ao seguir usuário:', error);
      }
    }

    /**
     * Lógica para deixar de seguir um usuário.
     * @param {string} currentUserId O UID do usuário logado.
     * @param {string} targetUserId O UID do usuário a ser deixado de seguir.
     */
    async function deixarDeSeguir(currentUserId, targetUserId) {
      if (!currentUserId || !targetUserId) return;
      try {
        // Remove o usuário logado da lista de seguidores do alvo
        const seguidoresRef = doc(db, 'users', targetUserId, 'seguidores', 'users');
        const seguidoresDoc = await getDoc(seguidoresRef);
        if (seguidoresDoc.exists()) {
          let seguidoresData = seguidoresDoc.data();
          delete seguidoresData[currentUserId];
          await setDoc(seguidoresRef, seguidoresData);
        }

        // Remove o alvo da lista de "seguindo" do usuário logado
        const seguindoRef = doc(db, 'users', currentUserId, 'seguindo', 'users');
        const seguindoDoc = await getDoc(seguindoRef);
        if (seguindoDoc.exists()) {
          let seguindoData = seguindoDoc.data();
          delete seguindoData[targetUserId];
          await setDoc(seguindoRef, seguindoData);
        }
      } catch (error) {
        console.error('Erro ao deixar de seguir usuário:', error);
      }
    }

    // =========================================================================
    // 5. Sistema de Depoimentos
    // =========================================================================
    
    /**
     * Carrega e exibe os depoimentos de um usuário.
     * @param {string} targetUserId O UID do usuário do perfil.
     */
    async function carregarDepoimentos(targetUserId) {
        console.log('🔄 Carregando depoimentos para:', targetUserId);
        const depoimentosContainer = document.querySelector('.deps-tab .about-container');
        if (!depoimentosContainer) {
            console.error('❌ Container de depoimentos não encontrado');
            return;
        }

        try {
            depoimentosContainer.innerHTML = `<div class="loading-container">
                <div class="loading-spinner"></div>
                <p>Carregando depoimentos...</p>
            </div>`;

            const depoimentosRef = collection(db, 'users', targetUserId, 'depoimentos');
            const depoimentosQuery = query(depoimentosRef, orderBy('criadoem', 'desc'));
            const snapshot = await getDocs(depoimentosQuery);
            depoimentosContainer.innerHTML = '';

            const isOwnProfile = targetUserId === userId;

            if (!isOwnProfile) {
                const depoimentoForm = document.createElement('div');
                depoimentoForm.className = 'depoimento-form';
                depoimentoForm.innerHTML = `
                    <h4>Deixar um depoimento</h4>
                    <textarea id="depoimentoTexto" placeholder="Escreva seu depoimento aqui..." maxlength="500"></textarea>
                    <div class="form-actions">
                        <span class="char-count">0/500</span>
                        <button class="btn-enviar-depoimento">
                            <i class="fas fa-paper-plane"></i> Enviar Depoimento
                        </button>
                    </div>
                `;
                depoimentosContainer.appendChild(depoimentoForm);
                const textarea = depoimentoForm.querySelector('#depoimentoTexto');
                const btnEnviar = depoimentoForm.querySelector('.btn-enviar-depoimento');
                const charCount = depoimentoForm.querySelector('.char-count');
                textarea.addEventListener('input', () => {
                    const count = textarea.value.length;
                    charCount.textContent = `${count}/500`;
                    charCount.style.color = count > 450 ? '#dc3545' : '#666';
                });
                 btnEnviar.addEventListener('click', () => enviarDepoimento(targetUserId));
            }

            if (snapshot.empty) {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'empty-depoimentos';
                emptyDiv.innerHTML = `
                    <div class="empty-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <h3>Nenhum depoimento ainda</h3>
                    <p>${isOwnProfile ? 'Você ainda não recebeu depoimentos.' : 'Este usuário ainda não recebeu depoimentos.'}</p>
                `;
                depoimentosContainer.appendChild(emptyDiv);
                return;
            }

            for (const depoDoc of snapshot.docs) {
                try {
                    const depoData = depoDoc.data();
                    const autorId = depoData.autorId;
                    let autorData = { username: 'Usuário Anônimo' };
                    if (autorId) {
                        const autorRef = doc(db, 'users', autorId);
                        const autorDoc = await getDoc(autorRef);
                        if (autorDoc.exists()) {
                            autorData = autorDoc.data();
                        }
                    }
                    const depoElement = criarElementoDepoimento(depoData, autorData, depoDoc.id, targetUserId);
                    depoimentosContainer.appendChild(depoElement);
                } catch (error) {
                    console.error(`❌ Erro ao processar depoimento ${depoDoc.id}:`, error);
                }
            }
            console.log(`✅ ${snapshot.size} depoimentos carregados com sucesso!`);
        } catch (error) {
            console.error('❌ Erro ao carregar depoimentos:', error);
            depoimentosContainer.innerHTML = `<div class="error-container">
                <div class="error-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <h3>Erro ao carregar depoimentos</h3>
                <p>Não foi possível carregar os depoimentos. Tente novamente.</p>
            </div>`;
        }
    }

    async function enviarDepoimento(targetUserId) {
        const textarea = document.getElementById('depoimentoTexto');
        const btnEnviar = document.querySelector('.btn-enviar-depoimento');
        if (!textarea || !btnEnviar || !userId) return;

        const conteudo = textarea.value.trim();
        if (!conteudo) {
            alert('Por favor, escreva um depoimento antes de enviar.');
            return;
        }

        if (userId === targetUserId) {
            alert('Você não pode deixar um depoimento para si mesmo.');
            return;
        }

        btnEnviar.disabled = true;
        btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            const depoimentoData = {
                conteudo: conteudo,
                autorId: userId,
                criadoem: new Date(),
            };
            await addDoc(collection(db, 'users', targetUserId, 'depoimentos'), depoimentoData);
            
            textarea.value = '';
            const charCount = document.querySelector('.char-count');
            if (charCount) charCount.textContent = '0/500';

            await carregarDepoimentos(targetUserId);

            const successMsg = document.createElement('div');
            successMsg.className = 'success-message';
            successMsg.textContent = 'Depoimento enviado com sucesso!';
            successMsg.style.cssText = `
                position: fixed; top: 20px; right: 20px; background: #28a745; color: white;
                padding: 12px 20px; border-radius: 8px; z-index: 9999; animation: slideIn 0.3s ease-out;
            `;
            document.body.appendChild(successMsg);
            setTimeout(() => successMsg.remove(), 3000);
        } catch (error) {
            console.error('❌ Erro ao enviar depoimento:', error);
            alert('Erro ao enviar depoimento. Tente novamente.');
        } finally {
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Depoimento';
        }
    };
    
    window.excluirDepoimento = async function(depoId, targetUserId) {
        const depoRef = doc(db, 'users', targetUserId, 'depoimentos', depoId);
        try {
            await deleteDoc(depoRef);
            console.log("Depoimento excluído com sucesso!");
            await carregarDepoimentos(targetUserId);
        } catch (e) {
            console.error("Erro ao excluir depoimento: ", e);
        }
    }

    function criarElementoDepoimento(depoData, autorData, depoId, targetUserId) {
      const depoElement = document.createElement('div');
      depoElement.className = 'depoimento-card';
      depoElement.setAttribute('data-depo-id', depoId);
      
      const autorFoto = autorData.userphoto || autorData.foto || 'https://placehold.co/50x50/cccccc/000000?text=User';
      const autorNome = autorData.displayname || autorData.username || 'Usuário Anônimo';
      const conteudo = depoData.conteudo || 'Depoimento sem conteúdo';

      const isOwner = targetUserId === userId;
      const isAuthor = depoData.autorId === userId;
      const podeExcluir = isOwner || isAuthor;

      depoElement.innerHTML = `
        <div class="depoimento-header">
            <div class="autor-info">
                <img src="${autorFoto}" alt="Foto do autor" class="autor-pic" onerror="this.src='https://placehold.co/50x50/cccccc/000000?text=User'" onclick="window.location.href='PF.html?userId=${depoData.autorId}'">
                <div class="autor-details">
                    <span class="autor-nome" onclick="window.location.href='PF.html?userId=${depoData.autorId}'">${autorNome}</span>
                </div>
            </div>
            ${podeExcluir ? `<button class="delete-depo-btn" onclick="excluirDepoimento('${depoId}', '${targetUserId}')">
                <i class="fas fa-trash"></i>
            </button>` : ''}
        </div>
        <div class="depoimento-content">
            <p>${conteudo}</p>
        </div>
      `;
      return depoElement;
    }
    
    // =========================================================================
    // 6. Funcionalidade de Busca
    // =========================================================================
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
        // Busca por username, mas o resultado contém o UID
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
              // Navega para a página do perfil usando o UID
              window.location.href = `PF.html?userId=${docSnap.id}`;
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

    // =========================================================================
    // 7. Live Status Manager (Refatorado para usar UID)
    // =========================================================================

    class LiveStatusManager {
      constructor(userId) {
        this.userId = userId;
        this.currentPage = this.getCurrentPage();
        this.statusRef = ref(rtdb, `userStatus/${this.userId}`);
        this.heartbeatInterval = null;
        this.lastActivity = Date.now();
        this.isTabActive = true;
        this.awayTimeout = null;
        this.init();
      }

      init() {
        this.setupPresenceSystem();
        this.setupActivityTracking();
        this.setupPageTracking();
        this.setupVisibilityTracking();
        this.startHeartbeat();
        this.monitorUserStatus();
      }

      getCurrentPage() {
        const path = window.location.pathname;
        const page = path.split('/').pop() || 'index.html';
        const pageMap = {
          'index.html': 'Login',
          'feed.html': 'Feed',
          'PF.html': 'Perfil',
          'config.html': 'Configurações',
          'chat.html': 'Chat',
          'search.html': 'Busca'
        };
        return pageMap[page] || page.replace('.html', '');
      }

      setupPresenceSystem() {
        const statusData = {
          userId: this.userId,
          status: 'online',
          lastSeen: serverTimestamp(),
          currentPage: this.currentPage,
          timestamp: serverTimestamp()
        };
        set(this.statusRef, statusData);
        onDisconnect(this.statusRef).set({
          userId: this.userId,
          status: 'offline',
          lastSeen: serverTimestamp(),
          currentPage: this.currentPage,
          timestamp: serverTimestamp()
        });
        const connectedRef = ref(rtdb, '.info/connected');
        onValue(connectedRef, (snapshot) => {
          if (snapshot.val() === true) {
            set(this.statusRef, {
              ...statusData,
              status: this.isTabActive ? 'online' : 'away',
              timestamp: serverTimestamp()
            });
          }
        });
      }

      setupActivityTracking() {
        const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
        const updateActivity = () => {
          this.lastActivity = Date.now();
          if (this.awayTimeout) clearTimeout(this.awayTimeout);
          if (this.isTabActive) this.setStatus('online');
          this.awayTimeout = setTimeout(() => {
            if (this.isTabActive) this.setStatus('away');
          }, 5 * 60 * 1000);
        };
        activityEvents.forEach(event => {
          document.addEventListener(event, updateActivity, true);
        });
      }

      setupPageTracking() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        history.pushState = (...args) => {
          originalPushState.apply(history, args);
          this.updateCurrentPage();
        };
        history.replaceState = (...args) => {
          originalReplaceState.apply(history, args);
          this.updateCurrentPage();
        };
        window.addEventListener('popstate', () => {
          this.updateCurrentPage();
        });
      }

      setupVisibilityTracking() {
        document.addEventListener('visibilitychange', () => {
          this.isTabActive = !document.hidden;
          if (this.isTabActive) {
            this.setStatus('online');
            this.lastActivity = Date.now();
          } else {
            this.setStatus('away');
          }
        });
        window.addEventListener('beforeunload', () => this.setStatus('offline'));
        window.addEventListener('focus', () => {
          this.isTabActive = true;
          this.setStatus('online');
        });
        window.addEventListener('blur', () => {
          this.isTabActive = false;
          this.setStatus('away');
        });
      }

      startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
          if (this.isTabActive) {
            this.updateHeartbeat();
          }
        }, 30000);
      }

      updateCurrentPage() {
        const newPage = this.getCurrentPage();
        if (newPage !== this.currentPage) {
          this.currentPage = newPage;
          this.updateHeartbeat();
        }
      }

      updateHeartbeat() {
        const now = Date.now();
        const timeSinceActivity = now - this.lastActivity;
        let status = 'online';
        if (!this.isTabActive) {
          status = 'away';
        } else if (timeSinceActivity > 5 * 60 * 1000) {
          status = 'away';
        }
        set(this.statusRef, {
          userId: this.userId,
          status: status,
          lastSeen: serverTimestamp(),
          currentPage: this.currentPage,
          timestamp: serverTimestamp(),
          heartbeat: now
        });
      }

      setStatus(status) {
        set(this.statusRef, {
          userId: this.userId,
          status: status,
          lastSeen: serverTimestamp(),
          currentPage: this.currentPage,
          timestamp: serverTimestamp()
        });
      }

      monitorUserStatus() {
        const params = new URLSearchParams(window.location.search);
        const targetUserId = params.get("userId") || this.userId;
        if (targetUserId && targetUserId !== this.userId) {
          const targetUserRef = ref(rtdb, `userStatus/${targetUserId}`);
          onValue(targetUserRef, (snapshot) => {
            if (snapshot.exists()) {
              this.updateStatusDisplay(snapshot.val());
            } else {
              this.updateStatusDisplay({ status: 'offline' });
            }
          });
        }
      }

      updateStatusDisplay(statusData) {
        const statusBox = document.querySelector('.status-box');
        const statusText = document.querySelector('.status-text');
        if (!statusBox || !statusText) return;
        const { status, lastSeen, currentPage } = statusData;
        let displayText = '';
        let statusClass = '';

        switch (status) {
          case 'online':
            displayText = currentPage ? `Online • ${currentPage}` : 'Online';
            statusClass = 'online';
            break;
          case 'away':
            displayText = currentPage ? `Ausente • ${currentPage}` : 'Ausente';
            statusClass = 'away';
            break;
          case 'offline':
            const lastSeenText = this.formatLastSeen(lastSeen);
            displayText = `Offline • ${lastSeenText}`;
            statusClass = 'offline';
            break;
          default:
            displayText = 'Status desconhecido';
            statusClass = 'offline';
        }

        statusText.textContent = displayText;
        statusText.className = `status-text ${statusClass}`;
        const indicator = statusBox.querySelector('.status-indicator') || this.createStatusIndicator();
        indicator.className = `status-indicator ${statusClass}`;
        if (!statusBox.querySelector('.status-indicator')) {
          statusBox.querySelector('p:first-child').appendChild(indicator);
        }
      }

      createStatusIndicator() {
        const indicator = document.createElement('span');
        indicator.className = 'status-indicator';
        indicator.style.cssText = `
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-left: 8px;
          animation: pulse 2s infinite;
        `;
        return indicator;
      }

      formatLastSeen(timestamp) {
        if (!timestamp) return 'há muito tempo';
        const now = Date.now();
        const lastSeen = typeof timestamp === 'number' ? timestamp : timestamp.seconds * 1000;
        const diff = now - lastSeen;
        if (diff < 60000) return 'agora mesmo';
        if (diff < 3600000) return `há ${Math.floor(diff / 60000)} min`;
        if (diff < 86400000) return `há ${Math.floor(diff / 3600000)}h`;
        return `há ${Math.floor(diff / 86400000)}d`;
      }

      destroy() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.awayTimeout) clearTimeout(this.awayTimeout);
        this.setStatus('offline');
      }
    }
});
