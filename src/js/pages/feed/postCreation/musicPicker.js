import { setupBottomMenu, escapeHTML } from "./bottomMenu.js";

const YOUTUBE_API_KEY = "AIzaSyANnbp95mLLqwl4FThjC__R5gQWqJ7_V7g";

const SEARCH_DELAY = 450;
const MIN_QUERY_LENGTH = 2;

const button = document.getElementById("btnMusic");
const searchInput = document.getElementById("searchSongs");
const list = document.getElementById("songsList");

const PLAY_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`;

const changeListeners = [];

let confirmed = null;
let draft = null;
let results = [];
let searchTimer = null;
let searchController = null;

function extractVideoId(text) {
    try {
        const url = new URL(String(text).trim());
        const host = url.hostname.replace(/^(www|m|music)\./, "");

        let id = null;

        if (host === "youtu.be") {
            id = url.pathname.slice(1).split("/")[0];
        } else if (host === "youtube.com") {
            id = url.pathname === "/watch"
                ? url.searchParams.get("v")
                : url.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/)?.[1];
        }

        return /^[\w-]{11}$/.test(id ?? "") ? id : null;
    } catch {
        return null;
    }
}

function decodeEntities(text) {
    const element = document.createElement("textarea");
    element.innerHTML = text;
    return element.value;
}

function cleanAuthor(author = "") {
    return author.replace(/\s*-\s*Topic$/i, "").trim();
}

async function searchSongs(term, signal) {
    const videoId = extractVideoId(term);

    if (videoId) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const response = await fetch(
            `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
            { signal }
        );

        if (!response.ok) return [];

        const data = await response.json();

        return [{
            id: videoId,
            title: data.title,
            author: cleanAuthor(data.author_name),
            thumb: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
        }];
    }

    if (!YOUTUBE_API_KEY) throw new Error("NO_KEY");

    const params = new URLSearchParams({
        part: "snippet",
        type: "video",
        videoEmbeddable: "true",
        videoCategoryId: "10",
        maxResults: "10",
        q: term,
        key: YOUTUBE_API_KEY
    });

    const response = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`, { signal });

    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const data = await response.json();

    return (data.items || [])
        .filter(item => item.id?.videoId)
        .map(item => ({
            id: item.id.videoId,
            title: decodeEntities(item.snippet.title),
            author: cleanAuthor(decodeEntities(item.snippet.channelTitle)),
            thumb:
                item.snippet.thumbnails?.medium?.url ||
                item.snippet.thumbnails?.default?.url ||
                `https://i.ytimg.com/vi/${item.id.videoId}/mqdefault.jpg`
        }));
}

let apiPromise = null;
let playerPromise = null;
let player = null;
let loadedId = null;
let isPlaying = false;

function loadYouTubeAPI() {
    if (window.YT?.Player) return Promise.resolve();

    apiPromise ??= new Promise(resolve => {
        const previous = window.onYouTubeIframeAPIReady;

        window.onYouTubeIframeAPIReady = () => {
            previous?.();
            resolve();
        };

        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
    });

    return apiPromise;
}

function markPlaying() {
    list.querySelectorAll(".song-item").forEach(item => {
        const playing = isPlaying && item.dataset.id === loadedId;

        item.classList.toggle("playing", playing);

        const previewButton = item.querySelector(".song-preview");

        if (previewButton) previewButton.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
    });
}

function onPlayerState(event) {
    const states = window.YT.PlayerState;

    if (event.data === states.PLAYING) {
        isPlaying = true;
        markPlaying();
    } else if (event.data === states.PAUSED || event.data === states.ENDED) {
        isPlaying = false;
        markPlaying();
    }
}

function ensurePlayer() {
    playerPromise ??= (async () => {
        await loadYouTubeAPI();

        const holder = document.createElement("div");

        holder.setAttribute("aria-hidden", "true");
        holder.style.cssText =
            "position: fixed; left: -9999px; top: 0; width: 200px; height: 200px; overflow: hidden; pointer-events: none;";

        const mount = document.createElement("div");

        holder.appendChild(mount);
        document.body.appendChild(holder);

        await new Promise(resolve => {
            player = new window.YT.Player(mount, {
                width: 200,
                height: 200,
                playerVars: { playsinline: 1, controls: 0, disablekb: 1, fs: 0, rel: 0 },
                events: { onReady: resolve, onStateChange: onPlayerState }
            });
        });
    })();

    return playerPromise;
}

async function togglePreview(id) {
    await ensurePlayer();

    if (loadedId === id) {
        if (isPlaying) player.pauseVideo();
        else player.playVideo();

        return;
    }

    loadedId = id;
    isPlaying = false;
    markPlaying();

    player.loadVideoById(id);
}

function stopPreview() {
    if (player) player.stopVideo?.();

    loadedId = null;
    isPlaying = false;
    markPlaying();
}

function renderMessage(html) {
    list.innerHTML = `<div class="list-empty">${html}</div>`;
}

function renderResults() {
    const songs = draft && !results.some(song => song.id === draft.id)
        ? [draft, ...results]
        : results;

    if (!songs.length) return;

    list.innerHTML = songs.map(song => `
        <div class="song-item${draft?.id === song.id ? " selected" : ""}" data-id="${escapeHTML(song.id)}">
            <div class="song-cover">
                <img src="${escapeHTML(song.thumb)}" alt="" loading="lazy">
            </div>
            <div class="song-info">
                <div class="song-title">${escapeHTML(song.title)}</div>
                <div class="song-author">${escapeHTML(song.author)}</div>
            </div>
            <button class="song-preview" type="button" aria-label="Ouvir prévia">${PLAY_ICON}</button>
        </div>
    `).join("");

    markPlaying();
}

async function runSearch() {
    const term = searchInput.value.trim();

    searchController?.abort();

    if (term.length < MIN_QUERY_LENGTH) {
        results = [];

        if (draft) renderResults();
        else renderMessage("Pesquise uma música pelo nome ou artista.");

        return;
    }

    searchController = new AbortController();

    renderMessage('<img src="/public/img/loading.gif">');

    try {
        results = await searchSongs(term, searchController.signal);
    } catch (error) {
        if (error.name === "AbortError") return;

        results = [];

        if (error.message === "NO_KEY") {
        } else if (error.message === "HTTP_403") {
            renderMessage("Limite de buscas do YouTube atingido. Cole o link da música ou tente mais tarde.");
        } else {
            console.error("Erro ao buscar músicas:", error);
            renderMessage("Não foi possível buscar músicas agora.");
        }

        return;
    }

    if (!results.length && !draft) {
        renderMessage("Nenhuma música encontrada.");
        return;
    }

    renderResults();
}

function updateButton() {
    if (!button) return;
    button.classList.toggle("has-value", Boolean(confirmed));
}

function notifyChange() {
    changeListeners.forEach(callback => callback());
}

if (button && searchInput && list) {
    setupBottomMenu({
        trigger: button,
        content: list,
        onOpen() {
            draft = confirmed;
            results = [];
            searchInput.value = "";

            if (draft) renderResults();
            else renderMessage("Pesquise uma música pelo nome ou artista.");
        },
        onConfirm() {
            confirmed = draft;
            updateButton();
            notifyChange();
        },
        onClose: stopPreview
    });

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, SEARCH_DELAY);
    });

    list.addEventListener("click", event => {
        const item = event.target.closest(".song-item");

        if (!item) return;

        const id = item.dataset.id;

        if (event.target.closest(".song-preview")) {
            togglePreview(id);
            return;
        }

        const song = [draft, ...results].find(candidate => candidate?.id === id);

        draft = draft?.id === id ? null : song;

        list.querySelectorAll(".song-item").forEach(element => {
            element.classList.toggle("selected", element.dataset.id === draft?.id);
        });
    });
}

export function getSelectedMusicUrl() {
    return confirmed ? `https://www.youtube.com/watch?v=${confirmed.id}` : "";
}

export function clearMusic() {
    confirmed = null;
    draft = null;
    updateButton();
    notifyChange();
}

export function onMusicChanged(callback) {
    changeListeners.push(callback);
}