import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    collection,
    query,
    orderBy,
    startAt,
    endAt,
    getDocs,
    Timestamp,
    serverTimestamp
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

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;

// API Key do ImgBB (SUBSTITUA pela sua chave)
const IMGBB_API_KEY = "fc8497dcdf559dc9cbff97378c82344c";

// NOVO: Map para armazenar os arquivos de imagem selecionados pendentes de upload
const filesToUpload = new Map();

// ===================
// UPLOAD DE IMAGEM PARA IMGBB
// ===================
async function uploadToImgBB(file) {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
        const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            return data.data.url;
        } else {
            throw new Error('Falha no upload da imagem: ' + (data.error?.message || 'Erro desconhecido'));
        }
    } catch (error) {
        console.error('Erro ao fazer upload:', error);
        throw error;
    }
}

// ===================
// SETUP DOS INPUTS DE IMAGEM
// (APENAS ARMAZENA O ARQUIVO LOCALMENTE)
// ===================
function setupImageInputs() {
    const imageInputs = document.querySelectorAll('input[type="file"][data-image-field]');
    
    imageInputs.forEach(input => {
        const fieldName = input.dataset.imageField;
        const hiddenInput = document.querySelector(`input[name="${fieldName}"]`);
        const uploadStatus = input.nextElementSibling;
        
        input.addEventListener('change', async (e) => {
            const file = e.target.files[0];

            if (!file) {
                filesToUpload.delete(fieldName);
                if (hiddenInput) hiddenInput.value = '';
                if (uploadStatus) uploadStatus.textContent = '';
                return;
            }
            
            // Validar tipo de arquivo
            if (!file.type.startsWith('image/')) {
                alert('Por favor, selecione apenas arquivos de imagem.');
                input.value = '';
                filesToUpload.delete(fieldName);
                return;
            }
            
            // Validar tamanho (máx 5MB)
            if (file.size > 5 * 1024 * 1024) {
                alert('A imagem deve ter no máximo 5MB.');
                input.value = '';
                filesToUpload.delete(fieldName);
                return;
            }
            
            // Armazena o arquivo e limpa o campo oculto.
            filesToUpload.set(fieldName, file);
            
            if (hiddenInput) {
                hiddenInput.value = ''; 
            }
            
            if (uploadStatus) {
                uploadStatus.textContent = 'Aguardando salvar...';
                uploadStatus.style.color = '#f39c12';
            }
        });
    });
}

// ===================
// PROCESSAR UPLOADS PENDENTES ANTES DO SUBMIT
// ===================
async function processPendingUploads(formData) {
    if (filesToUpload.size === 0) return; 

    const uploadPromises = [];
    const fieldsToDelete = []; 

    for (const [fieldName, file] of filesToUpload.entries()) {
        console.log(`Iniciando upload para o campo: ${fieldName}`);
        
        const promise = uploadToImgBB(file)
            .then(url => {
                formData.set(fieldName, url); 
                fieldsToDelete.push(fieldName);
                
                const input = document.querySelector(`input[type="file"][data-image-field="${fieldName}"]`);
                const uploadStatus = input ? input.nextElementSibling : null;
                if (uploadStatus) {
                    uploadStatus.textContent = '✓ Enviado com sucesso!';
                    uploadStatus.style.color = '#27ae60';
                }
            })
            .catch(error => {
                const input = document.querySelector(`input[type="file"][data-image-field="${fieldName}"]`);
                const uploadStatus = input ? input.nextElementSibling : null;
                if (uploadStatus) {
                    uploadStatus.textContent = '✗ Erro no upload';
                    uploadStatus.style.color = '#e74c3c';
                }
                throw new Error(`Falha ao enviar a imagem para o campo ${fieldName}: ${error.message}`);
            });
        
        uploadPromises.push(promise);
    }

    await Promise.all(uploadPromises);

    fieldsToDelete.forEach(fieldName => filesToUpload.delete(fieldName));
}

// ===================
// FUNÇÕES DE CONVERSÃO DO YOUTUBE (NOVO)
// ===================

/**
 * Extrai o ID do vídeo de uma URL do YouTube.
 * Suporta formatos watch?v=ID, youtu.be/ID e v/ID.
 */
function extractVideoId(url) {
    // Regex comum para extrair o ID do vídeo de vários formatos de URL
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|v\/|watch\?.*v=)|youtu\.be\/)([^&?]*)/;
    const match = url.match(regex);
    // O ID do vídeo está no primeiro grupo de captura (índice 1)
    return match ? match[1] : null;
}

/**
 * Converte a URL padrão do YouTube para o formato de embed com autoplay e loop.
 */
function convertToEmbedUrl(fullUrl) {
    const videoId = extractVideoId(fullUrl);

    if (videoId) {
        // Formato: https://www.youtube.com/embed/VIDEO_ID?autoplay=1&loop=1&playlist=VIDEO_ID
        // O parâmetro 'playlist=VIDEO_ID' é necessário para que o 'loop=1' funcione.
        return `https://www.youtube.com/embed/${videoId}?autoplay=1&loop=1&playlist=${videoId}`;
    }
    
    // Retorna a URL original se o ID não for encontrado (pode ser um link válido já em embed, ou inválido)
    return fullUrl; 
}


// ===================
// AUTENTICAÇÃO E CARREGAMENTO DE DADOS
// ===================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userRef = doc(db, "users", currentUser.uid);
            const userMediaRef = doc(db, "users", currentUser.uid, "user-infos", "user-media");
            const aboutRef = doc(db, "users", currentUser.uid, "user-infos", "about");
            const likesRef = doc(db, "users", currentUser.uid, "user-infos", "likes");

            const [userDocSnap, userMediaDocSnap, aboutDocSnap, likesDocSnap] = await Promise.all([
                getDoc(userRef),
                getDoc(userMediaRef),
                getDoc(aboutRef),
                getDoc(likesRef)
            ]);

            let allUserData = userDocSnap.exists() ? userDocSnap.data() : {};
            if (userMediaDocSnap.exists()) allUserData = { ...allUserData, ...userMediaDocSnap.data() };
            if (aboutDocSnap.exists()) allUserData = { ...allUserData, ...aboutDocSnap.data() };
            if (likesDocSnap.exists()) allUserData = { ...allUserData, ...likesDocSnap.data() };

            preencherDadosIniciais(allUserData);
            preencherFormulario(allUserData);
            inicializarFuncionalidades();
        } catch (error) {
            alert("Erro ao carregar seus dados. Tente recarregar a página.");
        }
    } else {
        window.location.href = 'login.html';
    }
});

// ===================
// PREENCHER DADOS DO CABEÇALHO E FORMULÁRIO
// ===================
function preencherDadosIniciais(userData) {
    const nomeCompleto = document.getElementById("nomeCompleto");
    if (nomeCompleto) {
        nomeCompleto.textContent = `${userData.name || ''} ${userData.surname || ''}`.trim();
    }

    const usernameElement = document.getElementById("username");
    if (usernameElement) {
        usernameElement.textContent = `@${userData.username || '...'}`;
    }
}

function preencherFormulario(userData) {
    const form = document.querySelector('form');
    if (!form) return;

    const fillField = (selector, dataKey) => {
        const element = form.querySelector(selector);
        if (element && userData[dataKey] !== undefined) {
            element.value = userData[dataKey];
        }
    };

    fillField('input[name="username"]', 'username');
    fillField('input[name="displayname"]', 'displayname');
    fillField('input[name="email"]', 'email');
    fillField('input[name="location"]', 'location');
    
    const maritalStatus = userData.maritalStatus;
    const selectMarital = form.querySelector('select[name="maritalStatus"]');
    if (selectMarital && maritalStatus) {
        selectMarital.value = maritalStatus;
    }
    
    fillField('input[name="name"]', 'name');
    fillField('input[name="pronoun1"]', 'pronoun1');
    fillField('input[name="pronoun2"]', 'pronoun2');
    fillField('input[name="status"]', 'status');
    fillField('input[name="surname"]', 'surname');
    fillField('input[name="tel"]', 'tel');
    fillField('input[name="telefone"]', 'telefone');

    // Mídia (URLs ocultas)
    fillField('input[name="userphoto"]', 'userphoto');
    fillField('input[name="background"]', 'background');
    fillField('input[name="headerphoto"]', 'headerphoto');
    fillField('input[name="musicTheme"]', 'musicTheme');
    fillField('input[name="musicThemeName"]', 'musicThemeName');
    fillField('input[name="profileColor"]', 'profileColor');
    fillField('input[name="customFont"]', 'customFont');

    // Likes
    fillField('textarea[name="dreams"]', 'dreams');
    fillField('textarea[name="fears"]', 'fears');
    fillField('textarea[name="overview"]', 'overview');
    fillField('textarea[name="personality"]', 'personality');
    fillField('textarea[name="styles"]', 'styles');
    fillField('input[name="tags"]', 'tags');

    // About
    fillField('textarea[name="books"]', 'books');
    fillField('textarea[name="characters"]', 'characters');
    fillField('textarea[name="foods"]', 'foods');
    fillField('textarea[name="games"]', 'games');
    fillField('textarea[name="hobbies"]', 'hobbies');
    fillField('textarea[name="movies"]', 'movies');
    fillField('textarea[name="music"]', 'music');
    fillField('textarea[name="others"]', 'others');
}

// ===================
// SALVAR PERFIL NO FIRESTORE
// ===================
async function salvarConfigPerfil(userId, formData) {
    const dadosPrincipais = {
        displayname: formData.get('displayname'),
        email: formData.get('email'),
        location: formData.get('location'),
        maritalStatus: formData.get('maritalStatus'),
        pronoun1: formData.get('pronoun1'),
        pronoun2: formData.get('pronoun2'),
        tel: formData.get('tel') ? Number(formData.get('tel')) : null, 
        telefone: formData.get('telefone'),
        ultimaAtualizacao: serverTimestamp(),
        username: formData.get('username')
    };

    const dadosMedia = {
        userphoto: formData.get('userphoto') || "",
        background: formData.get('background') || "",
        headerphoto: formData.get('headerphoto') || "",
        musicTheme: formData.get('musicTheme') || "", // AQUI JÁ ESTARÁ CONVERTIDO
        musicThemeName: formData.get('musicThemeName') || "",
        profileColor: String(formData.get('profileColor') || ""),
        profileColor2: String(formData.get('profileColor2') || ""),
        customFont: formData.get('customFont') || "",
    };

    const dadosLikes = {
        dreams: formData.get('dreams'),
        fears: formData.get('fears'),
        overview: formData.get('overview'),
        personality: formData.get('personality'),
        styles: formData.get('styles'),
        tags: formData.get('tags')
    };

    const dadosAbout = {
        books: formData.get('books'),
        characters: formData.get('characters'),
        foods: formData.get('foods'),
        games: formData.get('games'),
        hobbies: formData.get('hobbies'),
        movies: formData.get('movies'),
        music: formData.get('music'),
        others: formData.get('others')
    };
    
    await setDoc(doc(db, "users", userId), dadosPrincipais, { merge: true });
    await setDoc(doc(db, "users", userId, "user-infos", "user-media"), dadosMedia, { merge: true });
    await setDoc(doc(db, "users", userId, "user-infos", "likes"), dadosLikes, { merge: true });
    await setDoc(doc(db, "users", userId, "user-infos", "about"), dadosAbout, { merge: true });
}

// ===================
// SUBMIT DO FORMULÁRIO
// ===================
function setupFormSubmit() {
    const form = document.querySelector('form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return alert("Usuário não autenticado!");

        const submitBtn = document.querySelector('.submit-btn');
        const originalText = submitBtn ? submitBtn.textContent : 'Salvar Configurações';
        
        if (submitBtn) {
            submitBtn.textContent = 'Salvando...';
            submitBtn.disabled = true;
        }

        try {
            const formData = new FormData(form);
            
            // 1. Processa o upload de imagens pendentes
            await processPendingUploads(formData);
            
            // 2. CONVERTE A URL DA MÚSICA DO YOUTUBE (NOVO PASSO DE CONVERSÃO)
            const musicThemeUrl = formData.get('musicTheme');
            if (musicThemeUrl) {
                const embedUrl = convertToEmbedUrl(musicThemeUrl);
                formData.set('musicTheme', embedUrl); // Atualiza o formData com a URL convertida
            }
            
            // 3. Salva as configurações com as URLs atualizadas
            await salvarConfigPerfil(currentUser.uid, formData);
            
            window.location.href = `PF.html?userid=${currentUser.uid}`;
        } catch (error) {
            alert('Erro ao salvar as configurações. Tente novamente. Erro: ' + error.message);
        } finally {
            if (submitBtn) {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            }
        }
    });
}

// ===================
// FUNCIONALIDADES GERAIS
// ===================
function inicializarFuncionalidades() {
    setupTabs();
    setupCharCounters();
    setupSearch();
    setupFormSubmit();
    setupMenuLinks();
    setupFloatingMenu();
    setupLogout();
    setupImageInputs();
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            button.classList.add('active');
            const tabId = button.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add('active');
        });
    });
}

function setupCharCounters() {
    document.querySelectorAll('textarea[maxlength], input[maxlength]').forEach(element => {
        const counter = element.parentNode.querySelector('.char-counter');
        if (counter) {
            const maxLength = parseInt(element.getAttribute('maxlength'));
            const updateCounter = () => {
                const currentLength = element.value.length;
                counter.textContent = `${currentLength}/${maxLength}`;
                counter.classList.toggle('danger', currentLength > maxLength * 0.9);
                counter.classList.toggle('warning', currentLength > maxLength * 0.75 && currentLength <= maxLength * 0.9);
            };
            element.addEventListener('input', updateCounter);
            updateCounter();
        }
    });
}

function setupSearch() {
    const searchInput = document.getElementById("searchInput");
    const resultsList = document.getElementById("searchResults");
    const searchButton = document.querySelector(".search-box button");

    if (!searchInput || !resultsList || !searchButton) return;

    const performSearch = async () => {
        const term = searchInput.value.trim().toLowerCase();
        resultsList.innerHTML = "";
        resultsList.classList.remove("visible");
        if (!term) return;

        const usersRef = collection(db, "users");
        const q = query(usersRef, orderBy("username"), startAt(term), endAt(term + "\uf8ff"));

        try {
            const snapshot = await getDocs(q);
            if (snapshot.empty) {
                resultsList.innerHTML = "<li>Nenhum usuário encontrado</li>";
                resultsList.classList.add("visible");
                return;
            }

            snapshot.forEach((docSnap) => {
                const user = docSnap.data();
                const li = document.createElement("li");
                li.textContent = user.username;
                li.addEventListener("click", () => {
                    window.location.href = `PF.html?userid=${docSnap.id}`;
                });
                resultsList.appendChild(li);
            });
            resultsList.classList.add("visible");
        } catch (err) {
            resultsList.innerHTML = "<li>Erro na busca</li>";
            resultsList.classList.add("visible");
        }
    };

    searchButton.addEventListener("click", (e) => {
        e.preventDefault();
        performSearch();
    });

    searchInput.addEventListener("input", performSearch);

    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-area")) {
            resultsList.classList.remove("visible");
        }
    });
}

function setupLogout() {
    const logoutBtn = document.getElementById('btnSair');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Tem certeza que deseja sair?')) {
                try {
                    await signOut(auth);
                    window.location.href = 'login.html';
                } catch (error) {
                    alert("Erro ao tentar sair. Tente novamente.");
                }
            }
        });
    }
}

function setupMenuLinks() {
    const menuItems = document.querySelectorAll('.menu-item');
    const tabs = document.querySelectorAll('.tab');
    if (menuItems.length > 0 && tabs.length > 0) {
        menuItems.forEach((item, index) => {
            item.addEventListener('click', () => {
                tabs.forEach(tab => tab.classList.remove('active'));
                if (tabs[index]) tabs[index].classList.add('active');
                menuItems.forEach(btn => btn.classList.remove('active'));
                item.classList.add('active');
            });
        });
    }
}

function setupFloatingMenu() {
    const moreMenu = document.getElementById('moreMenu');
    const moreToggle = document.getElementById('moreToggle');
    const floatingMenu = document.getElementById('floatingMenu');
    const overlay = document.getElementById('overlay');

    if (!moreToggle || !moreMenu || !overlay) return;

    const closeFloatingMenu = () => {
        moreMenu.classList.remove('active');
        overlay.classList.remove('active');
    };

    const openFloatingMenu = () => {
        moreMenu.classList.add('active');
        overlay.classList.add('active');
    };

    moreToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        moreMenu.classList.contains('active') ? closeFloatingMenu() : openFloatingMenu();
    });

    overlay.addEventListener('click', closeFloatingMenu);

    if (floatingMenu) {
        floatingMenu.addEventListener('click', (e) => {
            if (e.target.tagName === 'A') {
                closeFloatingMenu();
            }
        });
        floatingMenu.addEventListener('click', (e) => e.stopPropagation());
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && moreMenu.classList.contains('active')) {
            closeFloatingMenu();
        }
    });
}

async function atualizarMarqueeUltimoUsuario() {
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
}