let totalResources = 0;
        let loadedResources = 0;
        let domReady = false;
        const progressBar = document.getElementById('progressBar');

        // Conta todos os recursos que precisam ser carregados
        function countResources() {
            const images = document.querySelectorAll('img');
            const scripts = document.querySelectorAll('script[src]');
            const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
            
            totalResources = images.length + scripts.length + stylesheets.length;
            
            // Se não há recursos externos, considera apenas o DOM
            if (totalResources === 0) {
                totalResources = 1;
            }
            
            updateProgress();
        }

        // Atualiza a barra de progresso baseada no carregamento real
        function updateProgress() {
            let domProgress = domReady ? 1 : 0;
            let totalProgress = domProgress + loadedResources;
            let maxProgress = 1 + (totalResources - 1); // DOM + recursos
            
            let percentage = (totalProgress / maxProgress) * 100;
            progressBar.style.width = Math.min(percentage, 100) + '%';
            
            // Atualiza contador visual
            const loadedCount = document.getElementById('loadedCount');
            if (loadedCount) {
                loadedCount.textContent = `${loadedResources} / ${totalResources - 1}`;
            }
            
            // Quando tudo carregou
            if (percentage >= 100) {
                setTimeout(() => {
                    progressBar.style.opacity = '0';
                    progressBar.style.transition = 'opacity 0.3s ease-out';
                    showMainContent();
                }, 300);
            }
        }

        // Chamada quando um recurso é carregado
        function resourceLoaded() {
            loadedResources++;
            updateProgress();
        }

        // Monitora carregamento de imagens existentes
        function setupImageLoading() {
            const images = document.querySelectorAll('img');
            images.forEach(img => {
                if (img.complete) {
                    resourceLoaded();
                } else {
                    img.addEventListener('load', resourceLoaded);
                    img.addEventListener('error', resourceLoaded); // Conta erro como "carregado"
                }
            });
        }

        // Monitora carregamento de CSS
        function setupCSSLoading() {
            const stylesheets = document.querySelectorAll('link[rel="stylesheet"]');
            stylesheets.forEach(link => {
                if (link.sheet) {
                    resourceLoaded();
                } else {
                    link.addEventListener('load', resourceLoaded);
                    link.addEventListener('error', resourceLoaded);
                }
            });
        }

        // Monitora carregamento de JS
        function setupScriptLoading() {
            const scripts = document.querySelectorAll('script[src]');
            scripts.forEach(script => {
                script.addEventListener('load', resourceLoaded);
                script.addEventListener('error', resourceLoaded);
            });
        }

        function showMainContent() {
            document.getElementById('mainContent').classList.add('visible');
        }

        // Quando o DOM estiver pronto
        document.addEventListener('DOMContentLoaded', () => {
            domReady = true;
            countResources();
            setupImageLoading();
            setupCSSLoading();
            setupScriptLoading();
            updateProgress();
        });

        // Fallback para window.onload se algo não for detectado
        window.addEventListener('load', () => {
            // Se ainda não chegou a 100%, força completar
            if (progressBar.style.width !== '100%') {
                loadedResources = totalResources - 1;
                updateProgress();
            }
        });

        // Inicia o progresso imediatamente
        progressBar.style.width = '10%';