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
