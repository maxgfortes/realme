const YT_API_KEY = 'AIzaSyANnbp95mLLqwl4FThjC__R5gQWqJ7_V7g';
const MAX_RECENTS = 10;

window.selectedMusic = null;
let nowPlaying = null;
let searchTimer = null;

const musicInput = document.getElementById('searchMusic');

musicInput.addEventListener('input', function () {
  const searchText = this.value.trim();
  clearTimeout(searchTimer);

  if (searchText.length === 0) {
    showRecents();
    return;
  }

  searchTimer = setTimeout(function () {
    youtubeSearch(searchText);
  }, 500);
});

async function youtubeSearch(query) {
  const url =
    'https://www.googleapis.com/youtube/v3/search' +
    '?part=snippet' +
    '&type=video' +
    '&videoCategoryId=10' +
    '&maxResults=8' +
    '&q=' + encodeURIComponent(query) +
    '&key=' + YT_API_KEY;

  const response = await fetch(url);
  const data = await response.json();
  renderList(data.items);
}

function renderList(musics) {
  const listContainer = document.getElementById('musicsList');
  listContainer.innerHTML = '';

  musics.forEach(function (item) {
    const videoId  = item.id.videoId;
    const title    = item.snippet.title;
    const channel  = item.snippet.channelTitle;
    const thumb    = item.snippet.thumbnails.default.url;

    const isSelected = window.selectedMusic && window.selectedMusic.videoId === videoId;

    const box = document.createElement('div');
    box.className = 'music-box';
    box.dataset.videoId = videoId;

    box.innerHTML = `
      <div class="music-icon">
        <img src="${thumb}" alt="thumbnail">
      </div>
      <div class="music-info">
        <div class="music-name-row">
            <div class="barrinhas">
                <span></span><span></span><span></span>
            </div>
            <div class="music-name">${title}</div>
        </div>
        <div class="music-artist">${channel}</div>
      </div>
      <div class="music-status">
        <div class="selected-music-dot ${isSelected ? 'active' : ''}">
          <svg fill="#212327" viewBox="-3.13 -3.13 84.63 84.63" xmlns="http://www.w3.org/2000/svg"><path d="M78.049,19.015L29.458,67.606c-0.428,0.428-1.121,0.428-1.548,0L0.32,40.015c-0.427-0.426-0.427-1.119,0-1.547l6.704-6.704c0.428-0.427,1.121-0.427,1.548,0l20.113,20.112l41.113-41.113c0.429-0.427,1.12-0.427,1.548,0l6.703,6.704C78.477,17.894,78.477,18.586,78.049,19.015z"/></svg>
        </div>
      </div>
    `;

    box.querySelector('.music-icon').addEventListener('click', function (e) {
      e.stopPropagation();
      togglePreview(videoId, this);
    });

    box.addEventListener('click', function () {
      toggleSelectMusic({ videoId, title, channel, thumb });
    });

    listContainer.appendChild(box);
  });
}

function toggleSelectMusic(music) {

  if (window.selectedMusic && window.selectedMusic.videoId === music.videoId) {
    window.selectedMusic = null;

    const box = document.querySelector('[data-video-id="' + music.videoId + '"]');
    box.querySelector('.selected-music-dot').classList.remove('active');
    return;
  }

  window.selectedMusic = music;
  window.selectedMusic.url = 'https://www.youtube.com/watch?v=' + music.videoId;

  document.querySelectorAll('.selected-music-dot').forEach(function (dot) {
    dot.classList.remove('active');
  });

  const box = document.querySelector('[data-video-id="' + music.videoId + '"]');
  box.querySelector('.selected-music-dot').classList.add('active');

  const lista = document.getElementById('musicsList');
  lista.prepend(box);
}

function togglePreview(videoId, iconEl) {
  const iframe = document.getElementById('yt-preview');
  const box = iconEl.closest('.music-box');

  if (nowPlaying === videoId) {
    iframe.src = '';
    nowPlaying = null;
    box.classList.remove('tocando');
    return;
  }

  document.querySelectorAll('.music-box.tocando').forEach(function (el) {
    el.classList.remove('tocando');
  });

  iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&start=30';
  nowPlaying = videoId;
  box.classList.add('tocando');
}

function saveRecent(music) {
  let recents = JSON.parse(localStorage.getItem('recentsMusics') || '[]');

  recents = recents.filter(function (m) {
    return m.videoId !== music.videoId;
  });

  recents.unshift(music);
  recents = recents.slice(0, MAX_RECENTS);

  localStorage.setItem('recentsMusics', JSON.stringify(recents));
}

function showRecents() {
  const recents = JSON.parse(localStorage.getItem('recentsMusics') || '[]');
  if (recents.length === 0) return;

  const formatted = recents.map(function (m) {
    return {
      id: { videoId: m.videoId },
      snippet: {
        title: m.title,
        channelTitle: m.channel,
        thumbnails: { default: { url: m.thumb } }
      }
    };
  });

  renderList(formatted);
}

function closeModal() {
  document.getElementById('yt-preview').src = '';
  nowPlaying = null;
  document.querySelectorAll('.music-icon.tocando').forEach(function (el) {
    el.classList.remove('tocando');
  });
  musicInput.value = '';
}