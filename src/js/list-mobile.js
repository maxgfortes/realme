// Detecta scroll horizontal e adiciona indicadores de página no mobile
document.addEventListener('DOMContentLoaded', () => {
    const listContainer = document.querySelector('.list-container');
    const lists = document.querySelectorAll('.list-seguidores, .list-seguindo, .list-amigos');

    // Apenas aplica em mobile
    if (window.innerWidth > 768) return;

    // Cria indicadores de página
    const indicatorContainer = document.createElement('div');
    indicatorContainer.className = 'list-indicators';
    indicatorContainer.innerHTML = `
        <span class="indicator active" data-index="0"></span>
        <span class="indicator" data-index="1"></span>
        <span class="indicator" data-index="2"></span>
    `;
    listContainer.parentElement.insertBefore(indicatorContainer, listContainer.nextSibling);

    // Atualiza indicadores ao scrollar
    let scrollTimeout;
    listContainer.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const scrollLeft = listContainer.scrollLeft;
            const containerWidth = listContainer.offsetWidth;
            const currentIndex = Math.round(scrollLeft / containerWidth);

            document.querySelectorAll('.indicator').forEach((indicator, index) => {
                indicator.classList.toggle('active', index === currentIndex);
            });
        }, 100);
    });

    // Touch swipe support para melhor experiência
    let touchStartX = 0;
    let touchEndX = 0;

    listContainer.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });

    listContainer.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;

        if (Math.abs(diff) > swipeThreshold) {
            const containerWidth = listContainer.offsetWidth;
            const currentIndex = Math.round(listContainer.scrollLeft / containerWidth);

            if (diff > 0) {
                // Swipe left - próxima lista
                const nextIndex = Math.min(currentIndex + 1, 2);
                listContainer.scrollLeft = nextIndex * containerWidth;
            } else {
                // Swipe right - lista anterior
                const prevIndex = Math.max(currentIndex - 1, 0);
                listContainer.scrollLeft = prevIndex * containerWidth;
            }
        }
    }
});
