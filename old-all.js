// ===================
// IMPORTAÇÕES E CONFIGURAÇÕES DO FIREBASE
// ===================

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
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
    deleteField,
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Suas credenciais do Firebase
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
const auth = getAuth(app);
const db = getFirestore(app);

// Variável global para armazenar os dados do usuário logado
window.currentUser = null;

// ===================
// LÓGICA DE AUTENTICAÇÃO E INICIALIZAÇÃO
// ===================

// O ponto de entrada da aplicação.
// Garante que todas as funções só rodem após a autenticação do usuário.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            // Caminho para os dados de informação do usuário
            const userDocRef = doc(db, 'users', user.uid, 'user-infos', 'data');
            const userDoc = await getDoc(userDocRef);

            if (userDoc.exists()) {
                window.currentUser = userDoc.data();
                window.currentUser.uid = user.uid; // Adiciona o uid para referência
                console.log('✅ Usuário logado e dados carregados:', window.currentUser.username);

                // Captura o nome de usuário do parâmetro da URL para carregar o perfil
                const urlParams = new URLSearchParams(window.location.search);
                const targetUsername = urlParams.get("username") || urlParams.get("user");
                const profileUsername = targetUsername || window.currentUser.username;

                // Chama todas as funções de inicialização
                // O `targetUsername` é passado para que as funções saibam qual perfil exibir
                // O `currentUser` é passado para que saibam quem está logado
                configurarBotaoSeguir(window.currentUser, profileUsername);
                carregarDepoimentos(window.currentUser, profileUsername);
                carregarLinks(profileUsername);
                carregarPosts(profileUsername);
                atualizarEstatisticasPerfil(profileUsername);

            } else {
                console.warn('⚠️ Dados do usuário não encontrados no Firestore. Redirecionando para login.');
                signOut(auth).then(() => {
                    window.location.href = 'login.html';
                });
            }
        } catch (error) {
            console.error('❌ Erro ao buscar dados do usuário:', error);
            signOut(auth).then(() => {
                window.location.href = 'login.html';
            });
        }
    } else {
        console.log('❌ Nenhum usuário logado. Redirecionando para login.');
        window.location.href = 'login.html';
    }
});

// ===================
// FUNÇÕES DE UTILIDADE
// ===================

/**
 * Formata um timestamp do Firestore para um formato de string legível.
 * @param {object|number} timestamp - O timestamp a ser formatado.
 * @returns {string} A string formatada.
 */
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
        if (diffMinutos < 60) return `Há ${diffMinutos} min`;
        if (diffHoras < 24) return `Há ${diffHoras}h`;
        if (diffDias < 30) return `Há ${diffDias}d`;

        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        console.error('Erro ao formatar data:', e);
        return 'Data inválida';
    }
}

/**
 * Busca o UID de um usuário a partir do seu username.
 * @param {string} username - O nome de usuário a ser buscado.
 * @returns {Promise<string|null>} O UID do usuário ou null se não for encontrado.
 */
async function getUserByUsername(username) {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('username', '==', username), limit(1));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        return querySnapshot.docs[0].id;
    }
    return null;
}

// ===================
// FUNCIONALIDADE DE BUSCA
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
        const q = query(usersRef, orderBy('username'), startAt(term), endAt(term + '\uf8ff'), limit(10));

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
// SISTEMA DE SEGUIR/SEGUINDO
// ===================

let isFollowing = false;

/**
 * Verifica se o usuário atual está seguindo o usuário alvo.
 * @param {object} currentUser - O objeto do usuário logado.
 * @param {string} targetUsername - O nome de usuário do perfil alvo.
 * @returns {Promise<boolean>} Retorna true se estiver seguindo, false caso contrário.
 */
async function verificarSeEstaSeguindo(currentUser, targetUsername) {
    try {
        const targetUserUid = await getUserByUsername(targetUsername);
        if (!targetUserUid) return false;

        const followingRef = doc(db, 'users', currentUser.uid, 'following', targetUserUid);
        const followingDoc = await getDoc(followingRef);
        
        return followingDoc.exists();
    } catch (error) {
        console.error('Erro ao verificar seguimento:', error);
        return false;
    }
}

/**
 * Segue um usuário.
 * @param {object} currentUser - O objeto do usuário logado.
 * @param {string} targetUsername - O nome de usuário do perfil alvo.
 * @returns {Promise<boolean>} Retorna true se a operação for bem-sucedida.
 */
async function seguirUsuario(currentUser, targetUsername) {
    try {
        const targetUserUid = await getUserByUsername(targetUsername);
        if (!targetUserUid) {
            console.error('Usuário alvo não encontrado.');
            return false;
        }

        const now = new Date();
        const seguidoresRef = doc(db, 'users', targetUserUid, 'followers', currentUser.uid);
        const seguindoRef = doc(db, 'users', currentUser.uid, 'following', targetUserUid);

        await setDoc(seguidoresRef, { username: currentUser.username, followerin: now });
        await setDoc(seguindoRef, { username: targetUsername, followin: now });

        console.log(`${currentUser.username} agora está seguindo ${targetUsername}`);
        return true;
    } catch (error) {
        console.error('Erro ao seguir usuário:', error);
        return false;
    }
}

/**
 * Deixa de seguir um usuário.
 * @param {object} currentUser - O objeto do usuário logado.
 * @param {string} targetUsername - O nome de usuário do perfil alvo.
 * @returns {Promise<boolean>} Retorna true se a operação for bem-sucedida.
 */
async function deixarDeSeguir(currentUser, targetUsername) {
    try {
        const targetUserUid = await getUserByUsername(targetUsername);
        if (!targetUserUid) {
            console.error('Usuário alvo não encontrado.');
            return false;
        }
        
        const seguidoresRef = doc(db, 'users', targetUserUid, 'followers', currentUser.uid);
        const seguindoRef = doc(db, 'users', currentUser.uid, 'following', targetUserUid);
        
        await deleteDoc(seguidoresRef);
        await deleteDoc(seguindoRef);

        console.log(`${currentUser.username} deixou de seguir ${targetUsername}`);
        return true;
    } catch (error) {
        console.error('Erro ao deixar de seguir usuário:', error);
        return false;
    }
}

/**
 * Conta o número de seguidores de um usuário.
 * @param {string} username - O nome de usuário do perfil.
 * @returns {Promise<number>} O número de seguidores.
 */
async function contarSeguidores(username) {
    try {
        const userUid = await getUserByUsername(username);
        if (!userUid) return 0;

        const seguidoresRef = collection(db, 'users', userUid, 'followers');
        const snapshot = await getDocs(seguidoresRef);
        return snapshot.size;
    } catch (error) {
        console.error('Erro ao contar seguidores:', error);
        return 0;
    }
}

/**
 * Conta o número de usuários que um perfil está seguindo.
 * @param {string} username - O nome de usuário do perfil.
 * @returns {Promise<number>} O número de usuários que o perfil segue.
 */
async function contarSeguindo(username) {
    try {
        const userUid = await getUserByUsername(username);
        if (!userUid) return 0;

        const seguindoRef = collection(db, 'users', userUid, 'following');
        const snapshot = await getDocs(seguindoRef);
        return snapshot.size;
    } catch (error) {
        console.error('Erro ao contar seguindo:', error);
        return 0;
    }
}

/**
 * Atualiza as estatísticas do perfil na interface.
 * @param {string} username - O nome de usuário do perfil.
 */
async function atualizarEstatisticasPerfil(username) {
    try {
        const userUid = await getUserByUsername(username);
        if (!userUid) return;

        const postsRef = collection(db, 'users', userUid, 'posts');
        const postsSnapshot = await getDocs(postsRef);
        const numPosts = postsSnapshot.size;

        const numSeguidores = await contarSeguidores(username);
        const numSeguindo = await contarSeguindo(username);
        
        const statsElement = document.querySelector('.profile-stats');
        if (statsElement) {
            statsElement.innerHTML = `
                <span><strong>${numPosts}</strong> posts</span>
                <span><strong>${numSeguidores}</strong> seguidores</span>
                <span><strong>0</strong> amigos</span>
                <span><strong>${numSeguindo}</strong> seguindo</span>
            `;
        }
        console.log(`Estatísticas atualizadas: ${numPosts} posts, ${numSeguidores} seguidores`);
    } catch (error) {
        console.error('Erro ao atualizar estatísticas:', error);
    }
}

/**
 * Configura o botão de seguir ou editar perfil com base no contexto.
 * @param {object} currentUser - O objeto do usuário logado.
 * @param {string} targetUsername - O nome de usuário do perfil alvo.
 */
async function configurarBotaoSeguir(currentUser, targetUsername) {
    const followBtn = document.querySelector('.btn-follow');
    if (!followBtn) return;

    if (!targetUsername || targetUsername === currentUser.username) {
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

    isFollowing = await verificarSeEstaSeguindo(currentUser, targetUsername);
    
    followBtn.textContent = isFollowing ? 'seguindo' : 'seguir';
    followBtn.className = isFollowing ? 'btn-follow following' : 'btn-follow';

    followBtn.onclick = async () => {
        followBtn.disabled = true;
        followBtn.textContent = 'carregando...';

        try {
            if (isFollowing) {
                const success = await deixarDeSeguir(currentUser, targetUsername);
                if (success) {
                    isFollowing = false;
                    followBtn.textContent = 'seguir';
                    followBtn.className = 'btn-follow';
                }
            } else {
                const success = await seguirUsuario(currentUser, targetUsername);
                if (success) {
                    isFollowing = true;
                    followBtn.textContent = 'seguindo';
                    followBtn.className = 'btn-follow following';
                }
            }
            
            await atualizarEstatisticasPerfil(targetUsername);
            
        } catch (error) {
            console.error('Erro ao processar seguimento:', error);
            followBtn.textContent = 'erro';
        } finally {
            followBtn.disabled = false;
        }
    };
}


// ===================
// SISTEMA DE DEPOIMENTOS
// ===================

/**
 * Carrega e exibe os depoimentos de um usuário.
 * @param {object} currentUser - O objeto do usuário logado.
 * @param {string} username - O nome de usuário do perfil.
 */
async function carregarDepoimentos(currentUser, username) {
    const depoimentosContainer = document.querySelector('.deps-tab .about-container');
    if (!depoimentosContainer) {
        console.error('❌ Container de depoimentos não encontrado');
        return;
    }

    depoimentosContainer.innerHTML = `
        <div class="loading-container">
            <div class="loading-spinner"></div>
            <p>Carregando depoimentos...</p>
        </div>
    `;

    try {
        const userUid = await getUserByUsername(username);
        if (!userUid) {
             depoimentosContainer.innerHTML = '<h3>Usuário não encontrado</h3>';
             return;
        }
        
        const depoimentosRef = collection(db, 'users', userUid, 'deps');
        const depoimentosQuery = query(depoimentosRef, orderBy('create', 'desc'));
        const snapshot = await getDocs(depoimentosQuery);

        depoimentosContainer.innerHTML = '';

        const isOwnProfile = currentUser.username === username;

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
            const charCount = depoimentoForm.querySelector('.char-count');
            const btnEnviar = depoimentoForm.querySelector('.btn-enviar-depoimento');

            textarea.addEventListener('input', () => {
                const count = textarea.value.length;
                charCount.textContent = `${count}/500`;
                charCount.style.color = count > 450 ? '#dc3545' : '#666';
            });
            
            btnEnviar.addEventListener('click', () => enviarDepoimento(username));
        }

        if (snapshot.empty) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-depoimentos';
            emptyDiv.innerHTML = `
                <div class="empty-icon"><i class="fas fa-comments"></i></div>
                <h3>Nenhum depoimento ainda</h3>
                <p>${isOwnProfile ? 'Você ainda não recebeu depoimentos.' : 'Este usuário ainda não recebeu depoimentos.'}</p>
            `;
            depoimentosContainer.appendChild(emptyDiv);
            return;
        }

        for (const depoDoc of snapshot.docs) {
            try {
                const depoData = depoDoc.data();
                const autorUid = await getUserByUsername(depoData.sender);
                let autorData = { username: depoData.sender }; // Valor padrão
                if (autorUid) {
                    const autorRef = doc(db, 'users', autorUid, 'user-infos', 'data');
                    const autorDoc = await getDoc(autorRef);
                    if (autorDoc.exists()) {
                        autorData = autorDoc.data();
                    }
                }
                const depoElement = criarElementoDepoimento(depoData, autorData, depoDoc.id, username);
                depoimentosContainer.appendChild(depoElement);
            } catch (error) {
                console.error(`❌ Erro ao processar depoimento ${depoDoc.id}:`, error);
            }
        }
    } catch (error) {
        console.error('❌ Erro ao carregar depoimentos:', error);
        depoimentosContainer.innerHTML = `
            <div class="error-container">
                <div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div>
                <h3>Erro ao carregar depoimentos</h3>
                <p>Não foi possível carregar os depoimentos. Tente novamente.</p>
                <button onclick="carregarDepoimentos(window.currentUser, '${username}')" class="btn-secondary">Tentar novamente</button>
            </div>
        `;
    }
}

/**
 * Cria o elemento HTML para um depoimento.
 * @param {object} depoData - Dados do depoimento.
 * @param {object} autorData - Dados do autor do depoimento.
 * @param {string} depoId - ID do depoimento.
 * @param {string} targetUsername - Nome de usuário do perfil alvo.
 * @returns {HTMLElement} O elemento do depoimento.
 */
function criarElementoDepoimento(depoData, autorData, depoId, targetUsername) {
    const depoElement = document.createElement('div');
    depoElement.className = 'depoimento-card';
    depoElement.setAttribute('data-depo-id', depoId);

    const autorFoto = autorData.userphoto || autorData.foto || './src/icon/default.jpg';
    const autorNome = autorData.displayname || autorData.username || 'Usuário Anônimo';
    const dataFormatada = formatarDataPost(depoData.create);
    const conteudo = depoData.content || 'Depoimento sem conteúdo';

    const currentUser = window.currentUser;
    const isOwner = currentUser && currentUser.username === targetUsername;
    const isAuthor = currentUser && currentUser.username === depoData.sender;
    const podeExcluir = isOwner || isAuthor;

    depoElement.innerHTML = `
        <div class="depoimento-header">
            <div class="autor-info">
                <img src="${autorFoto}" alt="Foto do autor" class="autor-pic" onerror="this.src='./src/icon/default.jpg'" onclick="window.location.href='PF.html?username=${depoData.sender}'">
                <div class="autor-details">
                    <span class="autor-nome" onclick="window.location.href='PF.html?username=${depoData.sender}'">${autorNome}</span>
                    <span class="depo-time">${dataFormatada}</span>
                </div>
            </div>
            ${podeExcluir ? `<button class="delete-depo-btn" onclick="excluirDepoimento('${depoId}', '${targetUsername}')"><i class="fas fa-trash"></i></button>` : ''}
        </div>
        <div class="depoimento-content">
            <p>${conteudo}</p>
        </div>
    `;

    return depoElement;
}

/**
 * Envia um novo depoimento.
 * @param {string} targetUsername - O nome de usuário do perfil que receberá o depoimento.
 */
async function enviarDepoimento(targetUsername) {
    const textarea = document.getElementById('depoimentoTexto');
    const btnEnviar = document.querySelector('.btn-enviar-depoimento');
    
    if (!textarea || !btnEnviar) return;

    const conteudo = textarea.value.trim();
    if (!conteudo) {
        alert('Por favor, escreva um depoimento antes de enviar.');
        return;
    }

    const currentUser = window.currentUser;
    if (!currentUser) {
        alert('Você precisa estar logado para enviar depoimentos.');
        return;
    }

    if (currentUser.username === targetUsername) {
        alert('Você não pode deixar um depoimento para si mesmo.');
        return;
    }

    btnEnviar.disabled = true;
    btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        const targetUserUid = await getUserByUsername(targetUsername);
        if (!targetUserUid) {
            alert('Usuário alvo não encontrado.');
            btnEnviar.disabled = false;
            btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Depoimento';
            return;
        }

        const depoimentoData = {
            content: conteudo,
            sender: currentUser.username,
            create: new Date(),
            report: 0
        };

        const depoimentosRef = collection(db, 'users', targetUserUid, 'deps');
        await addDoc(depoimentosRef, depoimentoData);

        textarea.value = '';
        const charCount = document.querySelector('.char-count');
        if (charCount) charCount.textContent = '0/500';

        await carregarDepoimentos(currentUser, targetUsername);
        
        const successMsg = document.createElement('div');
        successMsg.className = 'success-message';
        successMsg.textContent = 'Depoimento enviado com sucesso!';
        successMsg.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: #28a745; color: white; padding: 12px 20px; border-radius: 8px; z-index: 9999; animation: slideIn 0.3s ease-out;
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
}

/**
 * Exclui um depoimento.
 * @param {string} depoId - ID do depoimento a ser excluído.
 * @param {string} targetUsername - Nome de usuário do perfil que possui o depoimento.
 */
async function excluirDepoimento(depoId, targetUsername) {
    if (!confirm('Tem certeza que deseja excluir este depoimento?')) {
        return;
    }

    try {
        const targetUserUid = await getUserByUsername(targetUsername);
        if (!targetUserUid) {
            alert('Usuário alvo não encontrado.');
            return;
        }

        const depoRef = doc(db, 'users', targetUserUid, 'deps', depoId);
        await deleteDoc(depoRef);

        const successMsg = document.createElement('div');
        successMsg.className = 'success-message';
        successMsg.textContent = 'Depoimento excluído com sucesso!';
        successMsg.style.cssText = `
            position: fixed; top: 20px; right: 20px; background: #dc3545; color: white; padding: 12px 20px; border-radius: 8px; z-index: 9999; animation: slideIn 0.3s ease-out;
        `;
        document.body.appendChild(successMsg);
        setTimeout(() => successMsg.remove(), 3000);
        
        await carregarDepoimentos(window.currentUser, targetUsername);

    } catch (error) {
        console.error('❌ Erro ao excluir depoimento:', error);
        alert('Erro ao excluir depoimento. Tente novamente.');
    }
}

// ===================
// SISTEMA DE LINKS (Baseado em user-likes/more)
// ===================

/**
 * Carrega e exibe os links do usuário.
 * @param {string} username - O nome de usuário do perfil.
 */
async function carregarLinks(username) {
    const linksContainer = document.querySelector('.links-tab .about-container');
    if (!linksContainer) {
        console.error('❌ Container de links não encontrado');
        return;
    }

    try {
        const userUid = await getUserByUsername(username);
        if (!userUid) {
            linksContainer.innerHTML = '<h3>Usuário não encontrado</h3>';
            return;
        }
        
        const userLikesRef = doc(db, 'users', userUid, 'user-likes', 'more');
        const userLikesDoc = await getDoc(userLikesRef);
        
        linksContainer.innerHTML = '';

        if (!userLikesDoc.exists()) {
            linksContainer.innerHTML = `<div class="empty-links"><div class="empty-icon"><i class="fas fa-link"></i></div><h3>Nenhum link ainda</h3><p>Este usuário ainda não adicionou nenhum link.</p></div>`;
            return;
        }

        const userData = userLikesDoc.data();
        const links = userData.links || {}; // Assume que os links estão em um campo 'links' dentro de 'more'

        if (Object.keys(links).length === 0) {
            linksContainer.innerHTML = `<div class="empty-links"><div class="empty-icon"><i class="fas fa-link"></i></div><h3>Nenhum link ainda</h3><p>Este usuário ainda não adicionou nenhum link.</p></div>`;
            return;
        }

        Object.entries(links).forEach(([key, url]) => {
            if (url && url.trim()) {
                const linkElement = document.createElement('div');
                linkElement.className = 'link-box';
                let icon = 'fas fa-external-link-alt';
                let label = key;
                
                if (url.includes('instagram.com')) { icon = 'fab fa-instagram'; label = 'Instagram'; } 
                else if (url.includes('twitter.com') || url.includes('x.com')) { icon = 'fab fa-twitter'; label = 'Twitter/X'; }
                else if (url.includes('tiktok.com')) { icon = 'fab fa-tiktok'; label = 'TikTok'; } 
                else if (url.includes('youtube.com')) { icon = 'fab fa-youtube'; label = 'YouTube'; }
                else if (url.includes('github.com')) { icon = 'fab fa-github'; label = 'GitHub'; } 
                else if (url.includes('linkedin.com')) { icon = 'fab fa-linkedin'; label = 'LinkedIn'; } 
                else if (url.includes('discord')) { icon = 'fab fa-discord'; label = 'Discord'; } 
                else if (url.includes('spotify.com')) { icon = 'fab fa-spotify'; label = 'Spotify'; }

                linkElement.innerHTML = `
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="user-link">
                        <i class="${icon}"></i>
                        <span>${label}</span>
                        <i class="fas fa-external-link-alt link-arrow"></i>
                    </a>
                `;
                linksContainer.appendChild(linkElement);
            }
        });
    } catch (error) {
        console.error('❌ Erro ao carregar links:', error);
        linksContainer.innerHTML = `<div class="error-container"><div class="error-icon"><i class="fas fa-exclamation-triangle"></i></div><h3>Erro ao carregar links</h3><p>Não foi possível carregar os links. Tente novamente.</p><button onclick="carregarLinks('${username}')" class="btn-secondary">Tentar novamente</button></div>`;
    }
}


// ===================
// SISTEMA DE POSTS
// ===================

let isLoadingPosts = false;
let lastPostDoc = null;

/**
 * Carrega e exibe os posts de um usuário.
 * @param {string} username - O nome de usuário do perfil.
 * @param {boolean} [loadMore=false] - Indica se é para carregar mais posts (para paginação).
 */
async function carregarPosts(username, loadMore = false) {
    const postsContainer = document.querySelector('.posts-tab .posts-container');
    const loadingSpinner = document.querySelector('.posts-loading-spinner');
    if (!postsContainer || isLoadingPosts) return;

    isLoadingPosts = true;
    if (loadingSpinner) loadingSpinner.style.display = 'block';

    if (!loadMore) {
        postsContainer.innerHTML = '';
        lastPostDoc = null;
    }

    try {
        const userUid = await getUserByUsername(username);
        if (!userUid) {
            postsContainer.innerHTML = '<h3>Usuário não encontrado</h3>';
            return;
        }

        let postsRef = collection(db, 'users', userUid, 'posts');
        let postsQuery = query(postsRef, orderBy('data', 'desc'), limit(10));
        
        if (lastPostDoc) {
            postsQuery = query(postsRef, orderBy('data', 'desc'), startAfter(lastPostDoc), limit(10));
        }

        const snapshot = await getDocs(postsQuery);
        
        if (snapshot.empty && !loadMore) {
            postsContainer.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-camera"></i>
                    <h3>Nenhuma publicação ainda</h3>
                    <p>Este usuário ainda não publicou nada.</p>
                </div>
            `;
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            return;
        } else if (snapshot.empty && loadMore) {
            if (loadingSpinner) loadingSpinner.style.display = 'none';
            console.log('Fim das publicações');
            return;
        }

        lastPostDoc = snapshot.docs[snapshot.docs.length - 1];

        for (const postDoc of snapshot.docs) {
            const postData = postDoc.data();
            const postElement = criarElementoPost(postData);
            postsContainer.appendChild(postElement);
        }

    } catch (error) {
        console.error('Erro ao carregar posts:', error);
        postsContainer.innerHTML = `
            <div class="error-container">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Erro ao carregar posts</h3>
                <p>Não foi possível carregar as publicações. Tente novamente.</p>
            </div>
        `;
    } finally {
        isLoadingPosts = false;
        if (loadingSpinner) loadingSpinner.style.display = 'none';
    }
}

/**
 * Cria o elemento HTML para um post.
 * @param {object} postData - Dados do post.
 * @returns {HTMLElement} O elemento do post.
 */
function criarElementoPost(postData) {
    const postElement = document.createElement('div');
    postElement.className = 'post-card';
    postElement.innerHTML = `
        <div class="post-header">
            <img src="${postData.userphoto}" alt="Foto de perfil" class="post-profile-pic">
            <div class="post-info">
                <span class="post-username">${postData.username}</span>
                <span class="post-date">${formatarDataPost(postData.data)}</span>
            </div>
        </div>
        <img src="${postData.imagem}" alt="Imagem do post" class="post-image">
        <div class="post-content">
            <p>${postData.legenda}</p>
        </div>
    `;
    return postElement;
}


// ===================
// FUNCIONALIDADES ADICIONAIS
// ===================

/**
 * Configura os event listeners para a navegação por abas.
 */
function configurarNavegacaoTabs() {
    const tabs = document.querySelectorAll('.profile-tab-header span');
    const contents = document.querySelectorAll('.profile-tab-content > div');

    tabs.forEach(tab => {
        tab.addEventListener('click', async () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const tabName = tab.getAttribute('data-tab');

            contents.forEach(content => {
                content.classList.remove('active');
                if (content.classList.contains(`${tabName}-tab`)) {
                    content.classList.add('active');
                }
            });

            // Carrega os dados da tab com base no username da URL
            const urlParams = new URLSearchParams(window.location.search);
            const username = urlParams.get("username") || window.currentUser.username;
            
            if (tabName === 'posts') {
                carregarPosts(username);
            } else if (tabName === 'deps') {
                carregarDepoimentos(window.currentUser, username);
            } else if (tabName === 'links') {
                carregarLinks(username);
            }
        });
    });
}

// Inicializa a navegação das abas após o carregamento da página
document.addEventListener('DOMContentLoaded', configurarNavegacaoTabs);

// Torna as funções globais para poderem ser chamadas de dentro do HTML
window.enviarDepoimento = enviarDepoimento;
window.excluirDepoimento = excluirDepoimento;
window.carregarPosts = carregarPosts;


// ===================
// CSS MELHORADO PARA POSTS E STATUS
// ===================
const postCSS = `
<style>
/* Full Profile Container with Glassmorphism */
.full-profile-container {
  width: 1050px;
  height: 520px;
  margin: 0 auto;
  background: rgba(20, 20, 20, 0.247);
  backdrop-filter: blur(8px);
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  margin-left: 250px;
  margin-top: 80px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

/* Profile Header - Fixed Top */
.profile-header {
  display: flex;
  padding: 30px;
  gap: 20px;
  background: rgba(20, 20, 20, 0.61);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #333;
  position: sticky;
  top: 0;
  z-index: 1000;
  flex-shrink: 0;
}

/* Status Indicators */
.status-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 8px;
}

.status-indicator.online {
  background-color: #28a745;
  animation: pulse-green 2s infinite;
}

.status-indicator.away {
  background-color: #ffc107;
}

.status-indicator.offline {
  background-color: #dc3545;
}

@keyframes pulse-green {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.status-text.online { color: #28a745; font-weight: bold; }
.status-text.away { color: #ffc107; font-weight: bold; }
.status-text.offline { color: #dc3545; }

/* Body Background Overlay */
.body-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.3);
  z-index: -1;
  pointer-events: none;
}

/* Follow Button States */


/* Depoimentos Styles - Enhanced with Glassmorphism */
.depoimento-form {
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.depoimento-form h4 {
  color: #fff;
  margin-bottom: 15px;
  font-size: 1.2em;
  font-weight: 600;
}

.depoimento-form textarea {
  width: 100%;
  min-height: 100px;
  padding: 12px;
  border: 1px solid (255, 255, 255, 0.2);
  border-radius: 8px;
  resize: vertical;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.5;
  transition: border-color 0.3s ease;
  background: rgba(40, 40, 40, 0.8);
  color: #fff;
  backdrop-filter: blur(4px);
}

.depoimento-form textarea:focus {
  border-color: #fff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(0,123,255,0.2);
}

.depoimento-form textarea::placeholder {
  color: #aaa;
}

.form-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
}

.char-count {
  font-size: 12px;
  color: #aaa;
  font-weight: 500;
}

.btn-enviar-depoimento {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-enviar-depoimento:hover {
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 5px 15px rgba(0,123,255,0.4);
}

.btn-enviar-depoimento:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.depoimento-card {
  background: rgba(20, 20, 20, 0.85);
  backdrop-filter: blur(12px);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 15px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  animation: fadeInUp 0.5s ease-out;
}

.depoimento-card:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}

.depoimento-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.autor-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.autor-pic {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: border-color 0.3s ease;
}

.autor-pic:hover {
  border-color: #007bff;
}

.autor-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.autor-nome {
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: color 0.3s ease;
}

.autor-nome:hover {
  color: #007bff;
}

.depo-time {
  font-size: 12px;
  color: #aaa;
}

.delete-depo-btn {
  background: none;
  border: none;
  color: #dc3545;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.delete-depo-btn:hover {
  background: rgba(220, 53, 69, 0.2);
  transform: scale(1.1);
}

.depoimento-content p {
  margin: 0;
  color: #fff;
  line-height: 1.6;
  font-size: 15px;
}

.empty-depoimentos {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 60px 20px;
  color: #aaa;
  background-color: transparent;
  border-radius: 16px;
  margin: 20px 0;
}

.empty-depoimentos .empty-icon {
  font-size: 3em;
  color: #555;
  margin-bottom: 20px;
}

.empty-depoimentos h3 {
  margin-bottom: 10px;
  color: #fff;
}

/* Links Styles - Enhanced with Glassmorphism */
.link-box {
  margin-bottom: 12px;
}

.user-link {
  display: flex;
  align-items: center;
  padding: 15px 20px;
  background-color: transparent;
  border-radius: 12px;
  text-decoration: none;
  color: #fff;
  transition: all 0.3s ease;
  gap: 12px;
}

.user-link:hover {
  border-color: #007bff;
  color: #007bff;
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,123,255,0.2);
  background: rgba(0, 123, 255, 0.1);
}

.user-link i:first-child {
  font-size: 20px;
  width: 24px;
  text-align: center;
}

.user-link span {
  flex: 1;
  font-weight: 600;
}

.link-arrow {
  font-size: 12px !important;
  opacity: 0.7;
}

.empty-links {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 60px 20px;
  color: #aaa;
  background-color: transparent;
  border-radius: 16px;
  margin: 20px 0;
}

.empty-links .empty-icon {
  font-size: 3em;
  color: #555;
  margin-bottom: 20px;
}

.empty-links h3 {
  margin-bottom: 10px;
  color: #fff;
}

/* Social Media Link Colors - Enhanced for Dark Theme */
.user-link:hover .fa-instagram {
  color: #E4405F;
}

.user-link:hover .fa-twitter {
  color: #1DA1F2;
}

.user-link:hover .fa-tiktok {
  color: #ff0050;
}

.user-link:hover .fa-youtube {
  color: #FF0000;
}

.user-link:hover .fa-github {
  color: #fff;
}

.user-link:hover .fa-linkedin {
  color: #0077B5;
}

.user-link:hover .fa-discord {
  color: #7289DA;
}

.user-link:hover .fa-spotify {
  color: #1DB954;
}

/* Loading States - Dark Theme */
.loading-container, .error-container, .empty-posts {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  min-height: 200px;
  background-color: transparent;
  border-radius: 16px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.1);
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-icon, .error-icon {
  font-size: 3.5em;
  color: #555;
  margin-bottom: 20px;
}

.error-icon {
  color: #dc3545;
}

.empty-posts h3, .error-container h3 {
  color: #fff;
  margin-bottom: 10px;
  font-size: 1.3em;
}

.empty-posts p, .error-container p {
  color: #aaa;
  margin-bottom: 20px;
  line-height: 1.5;
}

.btn-primary, .btn-secondary {
  padding: 12px 24px;
  border: none;
  border-radius: 25px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.3s ease;
  cursor: pointer;
  display: inline-block;
  backdrop-filter: blur(8px);
}

.btn-primary {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
}

.btn-primary:hover {
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,123,255,0.4);
}

.btn-secondary {
  background: rgba(108, 117, 125, 0.8);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.btn-secondary:hover {
  background: rgba(84, 91, 98, 0.9);
  transform: translateY(-2px);
}

/* Post Cards - Enhanced Dark Glassmorphism */
.post-card {
  background: rgba(20, 20, 20, 0.582);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  margin-bottom: 20px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.3s ease;
  animation: fadeInUp 0.6s ease-out;
  position: relative;
  overflow: hidden;
}

.post-card:hover {
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.2);
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Post Header */
.post-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 15px;
}

.profile-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-pic {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid rgba(255, 255, 255, 0.2);
  transition: border-color 0.3s ease;
}

.user-pic:hover {
  border-color: #007bff;
}

.user-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.display-name {
  font-weight: 700;
  color: #fff;
  font-size: 1.1em;
  line-height: 1.2;
}

.username-small {
  color: #aaa;
  font-size: 0.9em;
  font-weight: 500;
}

.post-time {
  color: #999;
  font-size: 0.85em;
  font-weight: 400;
}

.post-options {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.post-options:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

/* Post Content */
.post-content {
  margin-bottom: 15px;
  line-height: 1.6;
}

.post-content p {
  margin: 0;
  color: #fff;
  font-size: 1.05em;
  word-wrap: break-word;
  white-space: pre-wrap;
}

.empty-content {
  color: #999;
  font-style: italic;
}

.hashtag {
  color: #007bff;
  font-weight: 600;
  cursor: pointer;
}

.hashtag:hover {
  text-decoration: underline;
}

.mention {
  color: #007bff;
  font-weight: 600;
  cursor: pointer;
}

.mention:hover {
  text-decoration: underline;
}

.post-content a {
  color: #007bff;
  text-decoration: none;
  font-weight: 500;
}

.post-content a:hover {
  text-decoration: underline;
}

/* Post Images */
.post-image-container {
  margin-top: 15px;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
}

.post-image {
  width: 100%;
  height: auto;
  max-height: 400px;
  object-fit: cover;
  transition: transform 0.3s ease;
  display: block;
}

.post-image:hover {
  transform: scale(1.02);
}

/* Post Actions */
.post-actions {
  display: flex;
  justify-content: space-around;
  align-items: center;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 400px;
  margin: 0 auto;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  cursor: pointer;
  color: #aaa;
  font-size: 0.95em;
  padding: 8px 16px;
  border-radius: 20px;
  transition: all 0.3s ease;
  font-weight: 500;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.action-btn i {
  font-size: 1.1em;
}

.action-btn.loading {
  opacity: 0.6;
  pointer-events: none;
}

.action-btn.loading i {
  animation: spin 1s linear infinite;
}

/* Like Button Specific */
.like-btn:hover {
  color: #e91e63 !important;
  background: rgba(233, 30, 99, 0.2) !important;
}

.like-btn.liked {
  color: #e91e63 !important;
}

.like-btn.has-likes .action-count {
  font-weight: 700;
}

/* Other Action Buttons */
.comment-btn:hover {
  color: #1da1f2 !important;
  background: rgba(29, 161, 242, 0.2) !important;
}

.share-btn:hover {
  color: #17bf63 !important;
  background: rgba(23, 191, 99, 0.2) !important;
}

.bookmark-btn:hover {
  color: #f39c12 !important;
  background: rgba(243, 156, 18, 0.2) !important;
}

.action-count {
  font-size: 0.9em;
  font-weight: 600;
  min-width: 20px;
  text-align: center;
}

/* Load More Button */
.load-more-container {
  display: flex;
  justify-content: center;
  padding: 30px 20px;
}

.load-more-btn {
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 25px;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.load-more-btn:hover {
  background: linear-gradient(135deg, #0056b3, #004085);
  transform: translateY(-2px);
  box-shadow: 0 8px 32px rgba(0,123,255,0.4);
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.end-posts {
  text-align: center;
  color: #28a745;
  font-weight: 600;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

/* Image Modal - Enhanced for Dark Theme */
.image-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999999;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-overlay {
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.95);
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  padding: 20px;
  box-sizing: border-box;
  backdrop-filter: blur(16px);
}

.modal-content {
  position: relative;
  max-width: 90%;
  max-height: 90%;
  animation: zoomIn 0.3s ease-out;
}

@keyframes zoomIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.modal-image {
  max-width: 100%;
  max-height: 100%;
  border-radius: 8px;
  box-shadow: 0 16px 64px rgba(0,0,0,0.5);
  max-width:600px;
  max-heigth:100%;
  overflow-y: auto;
}

.modal-close {
  position: absolute;
  top: -50px;
  right: 0;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #333;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px rgba(0,0,0,0.2);
}

.modal-close:hover {
  background: rgba(255, 255, 255, 1);
  transform: scale(1.1);
}

/* Success Message Animation */
.success-message {
  animation: slideIn 0.3s ease-out;
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}


/* Hover effects for better UX */
.depoimento-card:hover .autor-pic {
  transform: scale(1.05);
}

.user-link:hover i:first-child {
  transform: scale(1.1);
}

/* Loading spinner for buttons */
.btn-enviar-depoimento i.fa-spinner {
  animation: spin 1s linear infinite;
}

/* Enhanced visual feedback */
.depoimento-form textarea:valid {
  border-color: #4A90E2;
}

.depoimento-form textarea:invalid:not(:placeholder-shown) {
  border-color: #fff;
}

/* Smooth transitions for all interactive elements */
* {
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

/* Pulse animation for important buttons */
.btn-enviar-depoimento:not(:disabled):hover {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4); }
  70% { box-shadow: 0 0 0 10px rgba(0, 123, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(0, 123, 255, 0); }
}

/* Custom scrollbar for better aesthetics - Dark Theme */
.depoimento-form textarea::-webkit-scrollbar {
  width: 6px;
}

.depoimento-form textarea::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.depoimento-form textarea::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.depoimento-form textarea::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* Enhanced focus states for accessibility */
.btn-enviar-depoimento:focus,
.user-link:focus,
.delete-depo-btn:focus,
.modal-close:focus {
  outline: 2px solid #007bff;
  outline-offset: 2px;
}

/* Subtle animations for content loading */
.depoimento-card,
.user-link {
  animation: fadeInUp 0.5s ease-out;
}

.depoimento-card:nth-child(even) {
  animation-delay: 0.1s;
}

.user-link:nth-child(even) {
  animation-delay: 0.1s;
}

/* Improved typography hierarchy */
.depoimento-form h4,
.empty-depoimentos h3,
.empty-links h3,
.empty-posts h3 {
  font-weight: 700;
  letter-spacing: -0.5px;
}

.depoimento-content p,
.empty-depoimentos p,
.empty-links p,
.empty-posts p {
  line-height: 1.7;
  font-weight: 400;
}
</style>
`;

document.head.insertAdjacentHTML('beforeend', postCSS);