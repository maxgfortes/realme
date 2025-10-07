// Sistema de DM - JavaScript
import { 
    initializeApp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";

import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Configuração do Firebase
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

// Variáveis globais
let currentUser = null;
let currentChatId = null;
let currentChatUser = null;
let currentChatData = null;
let unsubscribeChat = null;
let conversationsCache = new Map();

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
    // Verificar usuário logado
    const userData = localStorage.getItem('usuarioLogado');
    if (!userData) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = JSON.parse(userData);
    console.log('Usuário logado:', currentUser);
    
    // Inicializar sistema
    await initializeDMSystem();
});

// Inicializar sistema de DM
async function initializeDMSystem() {
    try {
        // Configurar pesquisa de conversas
        setupChatSearch();
        
        // Carregar conversas
        await loadConversations();
        
        console.log('Sistema de DM inicializado com sucesso');
    } catch (error) {
        console.error('Erro ao inicializar sistema de DM:', error);
    }
}

// Carregar conversas do usuário
async function loadConversations() {
    const chatList = document.getElementById('chatList');
    
    try {
        const conversasRef = collection(db, 'users', currentUser.username, 'conversas');
        
        onSnapshot(conversasRef, async (snapshot) => {
            console.log('Conversas encontradas:', snapshot.size);
            
            if (snapshot.empty) {
                chatList.innerHTML = `
                    <li class="empty-conversations">
                        <i class="fas fa-inbox"></i>
                        <span>Nenhuma conversa ainda</span>
                    </li>
                `;
                return;
            }

            // Carregar previews das conversas
            const chatPromises = [];
            snapshot.forEach(docSnap => {
                const chatId = docSnap.id;
                chatPromises.push(loadChatPreview(chatId));
            });

            const chatPreviews = await Promise.all(chatPromises);
            const validPreviews = chatPreviews.filter(preview => preview !== null);
            
            // Ordenar por última mensagem
            validPreviews.sort((a, b) => {
                const timeA = a.lastMessage?.enviadoEm?.seconds || 0;
                const timeB = b.lastMessage?.enviadoEm?.seconds || 0;
                return timeB - timeA;
            });

            // Renderizar lista
            renderChatList(validPreviews);
        });
        
    } catch (error) {
        console.error('Erro ao carregar conversas:', error);
        chatList.innerHTML = `
            <li class="empty-conversations">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Erro ao carregar conversas</span>
            </li>
        `;
    }
}

// Carregar preview de uma conversa
async function loadChatPreview(chatId) {
    try {
        // Verificar cache
        if (conversationsCache.has(chatId)) {
            return conversationsCache.get(chatId);
        }

        // Buscar informações dos usuários da conversa
        const usersDoc = await getDoc(doc(db, 'users', currentUser.username, 'conversas', chatId, 'users', 'usernames'));
        if (!usersDoc.exists()) {
            console.log('Documento de usuários não encontrado para:', chatId);
            return null;
        }

        const usersData = usersDoc.data();
        const otherUsername = usersData.username1 === currentUser.username ? usersData.username2 : usersData.username1;

        // Buscar dados do outro usuário
        const otherUserDoc = await getDoc(doc(db, 'users', otherUsername));
        if (!otherUserDoc.exists()) {
            console.log('Usuário não encontrado:', otherUsername);
            return null;
        }

        const otherUser = otherUserDoc.data();

        // Buscar última mensagem de ambos os usuários
        const myMessagesRef = collection(db, 'users', currentUser.username, 'conversas', chatId, `mensagem-${currentUser.username}`);
        const otherMessagesRef = collection(db, 'users', currentUser.username, 'conversas', chatId, `mensagem-${otherUsername}`);

        const [myMessages, otherMessages] = await Promise.all([
            getDocs(query(myMessagesRef, orderBy('enviadoEm', 'desc'))),
            getDocs(query(otherMessagesRef, orderBy('enviadoEm', 'desc')))
        ]);

        let lastMessage = null;
        let lastMessageTime = null;

        // Encontrar a mensagem mais recente
        if (!myMessages.empty) {
            const myLastMsg = myMessages.docs[0].data();
            if (!lastMessage || myLastMsg.enviadoEm.seconds > lastMessageTime.seconds) {
                lastMessage = myLastMsg;
                lastMessageTime = myLastMsg.enviadoEm;
            }
        }

        if (!otherMessages.empty) {
            const otherLastMsg = otherMessages.docs[0].data();
            if (!lastMessage || otherLastMsg.enviadoEm.seconds > lastMessageTime.seconds) {
                lastMessage = otherLastMsg;
                lastMessageTime = otherLastMsg.enviadoEm;
            }
        }

        // Contar mensagens não lidas
        let unreadCount = 0;
        otherMessages.forEach(doc => {
            const msg = doc.data();
            if (!msg.vistoEm) {
                unreadCount++;
            }
        });

        const preview = {
            chatId,
            otherUser,
            lastMessage,
            unreadCount
        };

        // Salvar no cache
        conversationsCache.set(chatId, preview);
        
        return preview;
        
    } catch (error) {
        console.error('Erro ao carregar preview da conversa:', chatId, error);
        return null;
    }
}

// Renderizar lista de conversas
function renderChatList(previews) {
    const chatList = document.getElementById('chatList');
    chatList.innerHTML = '';

    previews.forEach(preview => {
        const listItem = createChatListItem(preview);
        chatList.appendChild(listItem);
    });
}

// Criar item da lista de conversas
function createChatListItem(preview) {
    const { chatId, otherUser, lastMessage, unreadCount } = preview;
    
    const li = document.createElement('li');
    li.setAttribute('data-chat-id', chatId);
    li.setAttribute('data-username', otherUser.username);
    
    // Definir foto do usuário
    const userPhoto = getUserPhoto(otherUser);
    
    // Definir última mensagem
    let lastMessageText = 'Nenhuma mensagem';
    let messageTime = '';
    
    if (lastMessage) {
        const isMyMessage = lastMessage.username === currentUser.username;
        const messagePrefix = isMyMessage ? 'Você: ' : '';
        lastMessageText = messagePrefix + (lastMessage.conteudo.length > 25 
            ? lastMessage.conteudo.substring(0, 25) + '...' 
            : lastMessage.conteudo);
        
        messageTime = formatTime(lastMessage.enviadoEm);
    }

    li.innerHTML = `
        <img src="${userPhoto}" alt="${otherUser.username}" onerror="this.src='./src/icon/default.jpg'">
        <div class="user-info">
            <div class="user-name">${otherUser.displayname || otherUser.username}</div>
            <div class="last-message">${lastMessageText}</div>
        </div>
        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 5px;">
            <span class="message-time">${messageTime}</span>
            ${unreadCount > 0 ? `<div class="unread-count">${unreadCount}</div>` : ''}
        </div>
    `;

    // Adicionar evento de clique
    li.addEventListener('click', () => {
        openChat(chatId, otherUser);
    });

    return li;
}

// Obter foto do usuário com fallbacks
function getUserPhoto(userData) {
    return userData.userphoto || userData.foto || userData.fotoPerfil || './src/icon/default.jpg';
}

// Abrir conversa
async function openChat(chatId, otherUserData) {
    try {
        // Atualizar variáveis globais
        currentChatId = chatId;
        currentChatUser = otherUserData.username;
        currentChatData = otherUserData;

        // Marcar conversa como ativa na sidebar
        document.querySelectorAll('.msg-sidebar li').forEach(li => {
            li.classList.remove('active');
        });
        document.querySelector(`[data-chat-id="${chatId}"]`).classList.add('active');

        // Renderizar interface do chat
        renderChatInterface(otherUserData);

        // Carregar mensagens
        await loadChatMessages(chatId);

        // Marcar mensagens como vistas
        await markMessagesAsSeen(chatId, otherUserData.username);

        console.log('Chat aberto:', chatId, otherUserData.username);
        
    } catch (error) {
        console.error('Erro ao abrir chat:', error);
    }
}

// Renderizar interface do chat
function renderChatInterface(otherUserData) {
    const chatContainer = document.getElementById('chatContainer');
    const userPhoto = getUserPhoto(otherUserData);
    const displayName = otherUserData.displayname || otherUserData.username;

    chatContainer.innerHTML = `
        <div class="chat-header">
            <img src="${userPhoto}" alt="${displayName}" onerror="this.src='./src/icon/default.jpg'">
            <div class="chat-header-info">
                <h3>${displayName}</h3>
                <div class="chat-status online">Online</div>
            </div>
        </div>

        <div class="chat-messages" id="chatMessages">
            <div class="messages-loading">
                <i class="fas fa-spinner fa-spin"></i>
                <span>Carregando mensagens...</span>
            </div>
        </div>

        <div class="chat-input">
            <textarea id="messageInput" placeholder="Digite sua mensagem..." rows="1"></textarea>
            <button class="send-button" id="sendButton">
                <i class="fas fa-paper-plane"></i>
            </button>
        </div>
    `;

    // Configurar textarea auto-resize
    const textarea = document.getElementById('messageInput');
    textarea.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
    });

    // Configurar eventos
    textarea.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById('sendButton').addEventListener('click', sendMessage);
}

// Carregar mensagens do chat
async function loadChatMessages(chatId) {
    if (unsubscribeChat) {
        unsubscribeChat();
    }

    const chatMessages = document.getElementById('chatMessages');
    
    try {
        // Referências para as mensagens
        const myMessagesRef = collection(db, 'users', currentUser.username, 'conversas', chatId, `mensagem-${currentUser.username}`);
        const otherMessagesRef = collection(db, 'users', currentUser.username, 'conversas', chatId, `mensagem-${currentChatUser}`);

        let allMessages = [];

        const updateMessages = async () => {
            // Ordenar mensagens por timestamp
            allMessages.sort((a, b) => a.enviadoEm?.seconds - b.enviadoEm?.seconds);
            await displayMessages(allMessages);
        };

        // Escutar minhas mensagens
        const unsubscribeMyMessages = onSnapshot(query(myMessagesRef, orderBy('enviadoEm')), (snapshot) => {
            // Remover mensagens antigas do usuário atual
            allMessages = allMessages.filter(msg => msg.username !== currentUser.username);
            
            // Adicionar mensagens atualizadas
            snapshot.forEach(doc => {
                allMessages.push({ id: doc.id, ...doc.data() });
            });
            
            updateMessages();
        });

        // Escutar mensagens do outro usuário
        const unsubscribeOtherMessages = onSnapshot(query(otherMessagesRef, orderBy('enviadoEm')), (snapshot) => {
            // Remover mensagens antigas do outro usuário
            allMessages = allMessages.filter(msg => msg.username !== currentChatUser);
            
            // Adicionar mensagens atualizadas
            snapshot.forEach(doc => {
                allMessages.push({ id: doc.id, ...doc.data() });
            });
            
            updateMessages();
            
            // Marcar mensagens como vistas automaticamente
            markMessagesAsSeen(chatId, currentChatUser);
        });

        // Função para cleanup
        unsubscribeChat = () => {
            unsubscribeMyMessages();
            unsubscribeOtherMessages();
        };

    } catch (error) {
        console.error('Erro ao carregar mensagens:', error);
        chatMessages.innerHTML = `
            <div class="messages-loading">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Erro ao carregar mensagens</span>
            </div>
        `;
    }
}

// Exibir mensagens na interface
async function displayMessages(messages) {
    const chatMessages = document.getElementById('chatMessages');
    
    if (messages.length === 0) {
        chatMessages.innerHTML = `
            <div class="empty-chat">
                <i class="fas fa-comment-dots"></i>
                <span>Conversa iniciada</span>
                <p>Envie uma mensagem para começar a conversar</p>
            </div>
        `;
        return;
    }

    chatMessages.innerHTML = '';

    for (const message of messages) {
        const messageElement = await createMessageElement(message);
        chatMessages.appendChild(messageElement);
    }

    // Scroll para a última mensagem
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Criar elemento de mensagem
async function createMessageElement(message) {
    const isMyMessage = message.username === currentUser.username;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMyMessage ? 'me' : 'other'}`;

    // Buscar foto do usuário
    let userPhoto = './src/icon/default.jpg';
    try {
        if (isMyMessage) {
            // Usar foto do usuário logado
            const currentUserData = await getUserData(currentUser.username);
            userPhoto = getUserPhoto(currentUserData);
        } else {
            // Usar foto do outro usuário
            userPhoto = getUserPhoto(currentChatData);
        }
    } catch (error) {
        console.error('Erro ao buscar foto do usuário:', error);
    }

    const messageTime = formatTime(message.enviadoEm);
    let statusHTML = '';

    if (isMyMessage) {
        let statusClass = 'sent';
        let statusText = 'Enviado';
        let statusIcon = 'fas fa-check';

        if (message.vistoEm) {
            statusClass = 'seen';
            statusText = `Visto ${formatTime(message.vistoEm)}`;
            statusIcon = 'fas fa-check-double';
        }

        statusHTML = `
            <div class="message-status ${statusClass}">
                <i class="${statusIcon}"></i>
                <span>${statusText}</span>
            </div>
        `;
    }

    messageDiv.innerHTML = `
        <img src="${userPhoto}" alt="${message.username}" onerror="this.src='./src/icon/default.jpg'">
        <div class="message-content">
            <div class="bubble">${escapeHtml(message.conteudo)}</div>
            <div class="message-time">${messageTime}</div>
            ${statusHTML}
        </div>
    `;

    return messageDiv;
}

// Buscar dados do usuário
async function getUserData(username) {
    try {
        const userDoc = await getDoc(doc(db, 'users', username));
        if (userDoc.exists()) {
            return userDoc.data();
        }
        return {};
    } catch (error) {
        console.error('Erro ao buscar dados do usuário:', error);
        return {};
    }
}

// Enviar mensagem
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const content = messageInput.value.trim();

    if (!content || !currentChatId || !currentChatUser) {
        return;
    }

    // Desabilitar botão
    sendButton.disabled = true;
    sendButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        const messageId = generateMessageId();
        const messageData = {
            conteudo: content,
            enviadoEm: serverTimestamp(),
            vistoEm: null,
            username: currentUser.username
        };

        // Salvar mensagem nas duas conversas
        await Promise.all([
            setDoc(doc(db, 'users', currentUser.username, 'conversas', currentChatId, `mensagem-${currentUser.username}`, messageId), messageData),
            setDoc(doc(db, 'users', currentChatUser, 'conversas', currentChatId, `mensagem-${currentUser.username}`, messageId), messageData)
        ]);

        // Limpar input
        messageInput.value = '';
        messageInput.style.height = 'auto';
        messageInput.focus();

        console.log('Mensagem enviada com sucesso');

    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        alert('Erro ao enviar mensagem. Tente novamente.');
    } finally {
        // Reabilitar botão
        sendButton.disabled = false;
        sendButton.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

// Marcar mensagens como vistas
async function markMessagesAsSeen(chatId, otherUsername) {
    try {
        const messagesRef = collection(db, 'users', currentUser.username, 'conversas', chatId, `mensagem-${otherUsername}`);
        const unreadQuery = query(messagesRef, where('vistoEm', '==', null));
        const snapshot = await getDocs(unreadQuery);

        if (snapshot.empty) return;

        const updatePromises = [];
        const now = serverTimestamp();

        snapshot.forEach(docSnap => {
            // Atualizar nas duas conversas
            updatePromises.push(
                updateDoc(doc(db, 'users', currentUser.username, 'conversas', chatId, `mensagem-${otherUsername}`, docSnap.id), {
                    vistoEm: now
                }),
                updateDoc(doc(db, 'users', otherUsername, 'conversas', chatId, `mensagem-${otherUsername}`, docSnap.id), {
                    vistoEm: now
                })
            );
        });

        await Promise.all(updatePromises);
        console.log('Mensagens marcadas como vistas');

    } catch (error) {
        console.error('Erro ao marcar mensagens como vistas:', error);
    }
}

// Configurar pesquisa de conversas
function setupChatSearch() {
    const chatSearchInput = document.getElementById('chatSearchInput');
    
    chatSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim().toLowerCase();
        const chatItems = document.querySelectorAll('.msg-sidebar li[data-username]');

        chatItems.forEach(item => {
            const username = item.getAttribute('data-username').toLowerCase();
            const displayName = item.querySelector('.user-name')?.textContent.toLowerCase() || '';
            const lastMessage = item.querySelector('.last-message')?.textContent.toLowerCase() || '';
            
            const matches = username.includes(term) || 
                           displayName.includes(term) || 
                           lastMessage.includes(term);
            
            item.style.display = matches ? 'flex' : 'none';
        });
    });
}

// Função para atualizar imagens de perfil (compatível com sua função existente)
function atualizarImagensPerfil(dados) {
    // Atualizar fotos de perfil no chat ativo
    if (currentChatData && currentChatData.username === dados.username) {
        const chatHeaderImg = document.querySelector('.chat-header img');
        if (chatHeaderImg) {
            const userPhoto = getUserPhoto(dados);
            chatHeaderImg.src = userPhoto;
            chatHeaderImg.onerror = () => {
                chatHeaderImg.src = './src/icon/default.jpg';
            };
        }
    }

    // Atualizar na lista de conversas
    const chatListItem = document.querySelector(`[data-username="${dados.username}"]`);
    if (chatListItem) {
        const img = chatListItem.querySelector('img');
        if (img) {
            const userPhoto = getUserPhoto(dados);
            img.src = userPhoto;
            img.onerror = () => {
                img.src = './src/icon/default.jpg';
            };
        }

        // Atualizar nome de exibição
        const userNameElement = chatListItem.querySelector('.user-name');
        if (userNameElement && dados.displayname) {
            userNameElement.textContent = dados.displayname;
        }
    }

    // Atualizar nas mensagens se for o usuário atual
    if (dados.username === currentUser.username) {
        const myMessageImages = document.querySelectorAll('.message.me img');
        myMessageImages.forEach(img => {
            const userPhoto = getUserPhoto(dados);
            img.src = userPhoto;
            img.onerror = () => {
                img.src = './src/icon/default.jpg';
            };
        });
    }
}

// Funções utilitárias
function generateChatId(user1, user2) {
    const users = [user1, user2].sort();
    return `chat-${users[0]}-${users[1]}`;
}

function generateMessageId() {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatTime(timestamp) {
    if (!timestamp) return '';
    
    const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Menos de 1 minuto
    if (diff < 60000) {
        return 'agora';
    }
    
    // Menos de 1 hora
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes}min`;
    }
    
    // Menos de 24 horas
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours}h`;
    }
    
    // Menos de 7 dias
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days}d`;
    }

    // Mais de 7 dias
    return date.toLocaleDateString('pt-BR', { 
        day: '2-digit', 
        month: '2-digit',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Funcionalidade para abrir chat com usuário específico (para integração com sistema de busca)
window.openChatWithUser = async function(username) {
    try {
        // Verificar se já existe conversa
        const chatId = generateChatId(currentUser.username, username);
        
        // Buscar dados do usuário
        const userDoc = await getDoc(doc(db, 'users', username));
        if (!userDoc.exists()) {
            console.error('Usuário não encontrado:', username);
            return;
        }

        const userData = userDoc.data();

        // Verificar se a conversa já existe
        const chatDoc = await getDoc(doc(db, 'users', currentUser.username, 'conversas', chatId));
        
        if (!chatDoc.exists()) {
            // Criar nova conversa
            await createNewConversation(chatId, username);
        }

        // Abrir chat
        await openChat(chatId, userData);
        
    } catch (error) {
        console.error('Erro ao abrir conversa com usuário:', error);
    }
};

// Criar nova conversa
async function createNewConversation(chatId, otherUsername) {
    try {
        // Criar conversa para o usuário atual
        await setDoc(doc(db, 'users', currentUser.username, 'conversas', chatId, 'users', 'usernames'), {
            username1: currentUser.username,
            username2: otherUsername
        });

        // Criar conversa para o outro usuário
        await setDoc(doc(db, 'users', otherUsername, 'conversas', chatId, 'users', 'usernames'), {
            username1: currentUser.username,
            username2: otherUsername
        });

        console.log('Nova conversa criada:', chatId);
        
        // Limpar cache para recarregar conversas
        conversationsCache.clear();
        
    } catch (error) {
        console.error('Erro ao criar conversa:', error);
        throw error;
    }
}

// Cleanup ao sair da página
window.addEventListener('beforeunload', () => {
    if (unsubscribeChat) {
        unsubscribeChat();
    }
});

// Exportar funções para uso global
window.atualizarImagensPerfil = atualizarImagensPerfil;

console.log('Sistema de DM carregado com sucesso');