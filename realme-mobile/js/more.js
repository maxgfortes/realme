const moreMenu = document.getElementById('moreMenu');
const moreToggle = document.getElementById('moreToggle');
const floatingMenu = document.getElementById('floatingMenu');
const overlay = document.getElementById('overlay');

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

// Função para abrir o menu
function openFloatingMenu() {
    moreMenu.classList.add('active');
    overlay.classList.add('active');
}

// Função para fechar o menu
function closeFloatingMenu() {
    moreMenu.classList.remove('active');
    overlay.classList.remove('active');
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