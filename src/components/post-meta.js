// ============================================================
// POST META — data + música alternando
// ============================================================

window.criarPostMeta = function (postData) {
  const dataFormatada = formatarDataRelativa(postData.create);
  const temMusica = !!(postData.musicUrl && postData.musicUrl.trim() !== '');

  if (!temMusica) {
    return `
      <div class="post-meta">
        <small class="post-date">${dataFormatada}</small>
      </div>
    `;
  }

  return `
    <div class="post-meta" data-alternavel="true">
      <small class="post-date visible">${dataFormatada}</small>
      <small class="post-music-title">♪ ...</small>
    </div>
  `;
}

window.iniciarAlternanciasMeta = function () {
  document.querySelectorAll('.post-meta[data-alternavel="true"]:not([data-iniciado])').forEach(function (bloco) {
    bloco.dataset.iniciado = 'true';

    const data   = bloco.querySelector('.post-date');
    const musica = bloco.querySelector('.post-music-title');
    let mostrando = 'data';

    setInterval(function () {
      if (mostrando === 'data') {
        data.classList.remove('visible');
        musica.classList.add('visible');
        mostrando = 'musica';
      } else {
        musica.classList.remove('visible');
        data.classList.add('visible');
        mostrando = 'data';
      }
    }, 5000);
  });
}


// ============================================================
// MÚSICA NO POST — YT IFrame API + Intersection Observer
// ============================================================

const _ytPlayers  = {};
const _ytMuted    = {};
const _ytStarted  = {};
let   _ytAPIReady = false;
let   _ytObserver = null;

window.carregarYouTubeAPI = function () {
  if (window.YT && window.YT.Player) {
    _ytAPIReady = true;
    observarPostsComMusica();
    return;
  }
  window.onYouTubeIframeAPIReady = function () {
    _ytAPIReady = true;
    observarPostsComMusica();
  };
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

function extrairVideoId(url) {
  const match = url.match(/(?:v=|embed\/)([^&?/]+)/);
  return match ? match[1] : null;
}

function criarPlayerNoPost(postEl, postId, musicUrl) {
  if (_ytStarted[postId]) return;
  _ytStarted[postId] = true;

  const videoId = extrairVideoId(musicUrl);
  if (!videoId) return;

  const iframe = document.createElement('iframe');
  iframe.id = 'yt-player-' + postId;
  iframe.style.cssText = 'width:1px;height:1px;opacity:0;position:absolute;pointer-events:none;';
  postEl.appendChild(iframe);

  _ytPlayers[postId] = new YT.Player(iframe, {
    videoId: videoId,
    playerVars: { autoplay: 0, start: 30, controls: 0, disablekb: 1, fs: 0, rel: 0 },
    events: {
      onReady: function (e) {
        e.target.mute();
        _ytMuted[postId] = true;

        // pega o título direto da IFrame API
        const titulo = e.target.getVideoData().title;
        if (titulo) {
          const tituloEl = postEl.querySelector('.post-music-title');
          if (tituloEl) tituloEl.textContent = '♪ ' + titulo;
        }

        atualizarBotaoMusicaPost(postEl, postId);
      }
    }
  });
}

function tocarPostPrincipal(postId, postEl) {
  const player = _ytPlayers[postId];
  if (!player) return;
  try {
    if (!_ytMuted[postId]) player.unMute();
    player.playVideo();
  } catch (e) {}
}

function pausarPost(postId) {
  const player = _ytPlayers[postId];
  if (!player) return;
  try { player.pauseVideo(); } catch (e) {}
}

function atualizarBotaoMusicaPost(postEl, postId) {
  const btn = postEl.querySelector('.post-music-btn');
  if (!btn) return;

  const muted = _ytMuted[postId];

  // ícone mudo
  const svgMudo = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
  // ícone com som
  const svgSom  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';

  btn.innerHTML = muted ? svgMudo : svgSom;
  btn.title = muted ? 'Ativar som' : 'Silenciar';
}

// clique no botão de som — delegado no document
document.addEventListener('click', function (e) {
  const btn = e.target.closest('.post-music-btn');
  if (!btn) return;

  const postEl = btn.closest('.post-card');
  if (!postEl) return;

  const postId = postEl.dataset.postId;
  const player = _ytPlayers[postId];
  if (!player) return;

  if (_ytMuted[postId]) {
    _ytMuted[postId] = false;
    player.unMute();
    player.playVideo();
  } else {
    _ytMuted[postId] = true;
    player.mute();
  }

  atualizarBotaoMusicaPost(postEl, postId);
});

function observarPostsComMusica() {
  if (_ytObserver) _ytObserver.disconnect();

  _ytObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      const postEl  = entry.target;
      const postId  = postEl.dataset.postId;
      const musicUrl = postEl.dataset.musicUrl;
      if (!musicUrl) return;

      if (entry.intersectionRatio >= 0.7) {
        if (!_ytStarted[postId]) criarPlayerNoPost(postEl, postId, musicUrl);
        setTimeout(function () { tocarPostPrincipal(postId, postEl); }, 600);
      } else {
        pausarPost(postId);
      }
    });
  }, { threshold: 0.7 });

  document.querySelectorAll('.post-card[data-music-url]').forEach(function (postEl) {
    _ytObserver.observe(postEl);
  });
}

// chame após cada loadPosts
function reobservarPostsComMusica() {
  if (_ytAPIReady) observarPostsComMusica();
}