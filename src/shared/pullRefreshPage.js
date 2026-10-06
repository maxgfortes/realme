import { refreshFeed } from "../js/pages/feed/render/postsRender.js";

(function iniciarPullToRefresh() {
  const scroller = document.getElementById('scroll_page');
  if (!scroller) return;

  const ALTURA = 64; 
  const MAXIMO = 120;
  const FATOR = 0.5;
  const TEMPO_MINIMO = 700;
  const GIF_LOADING = '../public/img/loading.gif';

  const ICONE_SETA =
    '<svg class="ptr-seta" viewBox="0 0 24 24" width="28" height="28" fill="none" ' +
    'stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="12" y1="4" x2="12" y2="20"/><polyline points="5 13 12 20 19 13"/></svg>';

  const hook = document.createElement('div');
  hook.id = 'ptrHook';
  hook.innerHTML =
    '<div class="ptr-conteudo">' +
      ICONE_SETA +
      '<img class="ptr-gif" src="' + GIF_LOADING + '" alt="Carregando">' +
      '<span class="ptr-texto">Puxe para atualizar</span>' +
    '</div>';
  document.body.appendChild(hook);

  const texto = hook.querySelector('.ptr-texto');

  let startY = 0;
  let distancia = 0;
  let puxando = false;
  let carregando = false;

  const overlayAberto = (el) => el.closest('.post-layer');
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

  function setEstado(estado) {
    hook.dataset.estado = estado;
    if (estado === 'initial') texto.textContent = 'Puxe para atualizar';
    if (estado === 'preaction') texto.textContent = 'Solte para atualizar';
    if (estado === 'action') texto.textContent = '';
  }

  function mover(px, animar) {
    scroller.style.transition = animar ? 'transform .25s ease' : 'none';
    scroller.style.transform = px > 0 ? `translateY(${px}px)` : '';
    hook.style.opacity = px > 0 ? '1' : '0';
  }

  async function executarAtualizacao() {
    carregando = true;
    setEstado('action');
    mover(ALTURA, true);

    try {
      await Promise.all([refreshFeed(), esperar(TEMPO_MINIMO)]);
    } catch (err) {
      console.error('Erro ao atualizar o feed:', err);
    }

    carregando = false;
    setEstado('initial');
    mover(0, true);
    scroller.scrollTop = 0;
  }

  setEstado('initial');

  scroller.addEventListener('touchstart', (e) => {
    if (carregando || overlayAberto(e.target)) return;
    if (scroller.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    puxando = true;
    distancia = 0;
  }, { passive: true });

  scroller.addEventListener('touchmove', (e) => {
    if (!puxando) return;
    const dy = e.touches[0].clientY - startY;

    if (dy <= 0 || scroller.scrollTop > 0) {
      puxando = false;
      setEstado('initial');
      mover(0, true);
      return;
    }

    distancia = Math.min(dy * FATOR, MAXIMO);
    setEstado(distancia >= ALTURA ? 'preaction' : 'initial');
    mover(distancia, false);
  }, { passive: true });

  function soltar() {
    if (!puxando) return;
    puxando = false;

    if (distancia >= ALTURA) {
      executarAtualizacao();
    } else {
      setEstado('initial');
      mover(0, true);
    }
  }

  scroller.addEventListener('touchend', soltar);
  scroller.addEventListener('touchcancel', soltar);
})();