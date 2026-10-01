const API_SCRIPT_ID = "_yt_api_script";
const PLAYER_ID = "music-player";
const VOLUME = 60;

let player = null;
let playing = false;
let currentUrl = null;
let apiReady = Boolean(window.YT?.Player);
let pendingVideoId = null;

const byId = id => document.getElementById(id);

window.onYouTubeIframeAPIReady = () => {
  apiReady = true;
  if (pendingVideoId) {
    createPlayer(pendingVideoId);
    pendingVideoId = null;
  }
};

function extractYouTubeId(url) {
  if (!url) return null;
  const text = String(url);
  const match = text.match(/(?:v=|\/v\/|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{11}$/.test(text) ? text : null;
}

function setTitle(text) {
  [byId("musicTitle"), byId("music-title")].forEach(el => {
    if (el) el.textContent = text;
  });
}

function loadTitle(videoId) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  fetch(url)
    .then(response => response.json())
    .then(data => setTitle(data.title))
    .catch(() => {});
}

function updateButtons() {
  byId("btnPauseMusic")?.classList.toggle("playing", playing);
  byId("play")?.classList.toggle("active", !playing);
  byId("pause")?.classList.toggle("active", playing);
  document.querySelector(".music-bars")?.classList.toggle("visible", playing);
  byId("musicTitle")?.classList.toggle("shifted", playing);
}

function destroyPlayer() {
  if (player?.destroy) {
    try { player.destroy(); } catch {}
  }
  player = null;
  playing = false;
  byId(PLAYER_ID)?.remove();
  updateButtons();
}

function createPlayer(videoId) {
  destroyPlayer();

  const holder = document.createElement("div");
  holder.id = PLAYER_ID;
  holder.style.cssText =
    "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;";
  document.body.appendChild(holder);

  player = new YT.Player(PLAYER_ID, {
    height: "1",
    width: "1",
    videoId,
    playerVars: {
      autoplay: 0, controls: 0, disablekb: 1, fs: 0, modestbranding: 1, rel: 0,
      iv_load_policy: 3, playsinline: 1, enablejsapi: 1, loop: 1, playlist: videoId,
    },
    events: {
      onReady(event) {
        event.target.setVolume(VOLUME);
        loadTitle(videoId);
      },
      onStateChange(event) {
        if (event.data === YT.PlayerState.ENDED) {
          event.target.seekTo(0);
          event.target.playVideo();
        }
      },
    },
  });
}

function toggleMusic() {
  if (!player?.playVideo) return;
  if (playing) player.pauseVideo();
  else player.playVideo();
  playing = !playing;
  updateButtons();
}

function bindButtons() {
  ["btnPauseMusic", "music-toggle-btn"].forEach(id => {
    const button = byId(id);
    if (button) button.onclick = toggleMusic;
  });
}

function loadApi() {
  if (apiReady || byId(API_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = API_SCRIPT_ID;
  script.src = "https://www.youtube.com/iframe_api";
  document.head.appendChild(script);
}

function initMusicPlayer(url) {
  const section = document.querySelector(".music");
  const videoId = extractYouTubeId(url);

  if (!videoId) {
    section?.classList.remove("has-music");
    return;
  }

  section?.classList.add("has-music");
  bindButtons();
  if (url === currentUrl) return;
  currentUrl = url;

  loadApi();
  if (apiReady) createPlayer(videoId);
  else pendingVideoId = videoId;
}

export function stopMusic() {
  currentUrl = null;
  pendingVideoId = null;
  destroyPlayer();
}

export function renderMusic(media = {}) {
  const section = document.querySelector(".music");

  if (media.musicTheme) {
    section?.classList.add("show");
    initMusicPlayer(media.musicTheme);
  } else {
    section?.classList.remove("show", "has-music");
    if (currentUrl) stopMusic();
  }
}