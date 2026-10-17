import { db } from "../../../../config/config.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import "./deletePost.js";
import "./openComments.js";
import { openLikes } from "./openLikes.js";
import { listenPostCount } from "./postCounters.js";
import { likePost, unlikePost, hasLikedPost, updateLikeIcon } from "./likePost.js";

const creatorCache = new Map();
const userNameCache = new Map();
const boundContainers = new WeakSet();
const trackedListeners = new Map();

const SWEEP_MS = 4000;

export function trackListeners(element, ...unsubscribers) {
    if (!element) return;

    const list = trackedListeners.get(element) || [];

    list.push(...unsubscribers.filter(unsubscribe => typeof unsubscribe === "function"));
    trackedListeners.set(element, list);
}

export function releaseListeners(element) {
    trackedListeners.get(element)?.forEach(unsubscribe => {
        try {
            unsubscribe();
        } catch {
            return;
        }
    });

    trackedListeners.delete(element);
}

function sweepDisconnected() {
    trackedListeners.forEach((_, element) => {
        if (!element.isConnected) releaseListeners(element);
    });

    musicControllers.forEach((controller, element) => {
        if (element.isConnected) return;

        controller.destroy?.();
        musicControllers.delete(element);
        soundControllers.delete(element);
        musicVisibility.delete(element);
        musicObserver?.unobserve(element);
    });

    videoVisibility.forEach((_, video) => {
        if (video.isConnected) return;

        video.pause();
        videoVisibility.delete(video);
        videoObserver?.unobserve(video);
    });
}

setInterval(sweepDisconnected, SWEEP_MS);

const MENTION_NAMES_SHOWN = 2;

export function clearPostCaches() {
    creatorCache.clear();
    userNameCache.clear();
}

export function getCachedCreator(uid) {
    if (!creatorCache.has(uid)) {
        creatorCache.set(uid, getCreator(uid));
    }

    return creatorCache.get(uid);
}

async function getCreator(creatorid) {
    const defaultCreator = {
        name: "Name Surname",
        photo: "/src/public/img/default.jpg"
    };

    if (!creatorid) return defaultCreator;

    try {
        const userRef = doc(db, "users", creatorid);
        const userSnapshot = await getDoc(userRef);

        if (!userSnapshot.exists()) return defaultCreator;

        const userData = userSnapshot.data();
        const name = userData.name || "";
        const surname = userData.surname || "";
        const alias = `${name} ${surname}`.trim();

        const mediaRef = doc(
            db,
            "users",
            creatorid,
            "user-infos",
            "user-media"
        );

        const mediaSnapshot = await getDoc(mediaRef);

        let photo = defaultCreator.photo;

        if (mediaSnapshot.exists()) {
            const mediaData = mediaSnapshot.data();
            photo = mediaData.userphoto || defaultCreator.photo;
        }

        return {
            name: alias || "Usuário",
            photo
        };
    } catch (error) {
        return defaultCreator;
    }
}

export function getUserName(uid) {
    if (!userNameCache.has(uid)) {
        userNameCache.set(
            uid,
            getDoc(doc(db, "users", uid))
                .then(snap => {
                    if (!snap.exists()) return "Usuário";

                    const data = snap.data();
                    const fullName = `${data.name || ""} ${data.surname || ""}`.trim();

                    return fullName || "Usuário";
                })
                .catch(() => "Usuário")
        );
    }

    return userNameCache.get(uid);
}

export function joinNames(parts) {
    if (parts.length <= 1) return parts[0] || "";

    return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function getMentionUids(data, creatorid) {
    const raw = Array.isArray(data.mentions) ? data.mentions : [];

    return [...new Set(raw.filter(uid => typeof uid === "string" && uid))]
        .filter(uid => uid !== creatorid);
}

function mentionLink(uid, name) {
    return `<a class="post-author-name post-profile-link" href="profile.html?uid=${encodeURIComponent(uid)}" data-profile-uid="${escapeHTML(uid)}">${escapeHTML(name)}</a>`;
}

async function buildWallHTML(data) {
    const wallTo = typeof data.wallTo === "string" ? data.wallTo : "";

    if (!wallTo || wallTo === data.creatorid) return "";

    const name = await getUserName(wallTo);

    return ` escreveu no mural de ${mentionLink(wallTo, name)}`;
}

async function buildMentionsHTML(mentionUids) {
    if (!mentionUids.length) return "";

    const shownUids = mentionUids.slice(0, MENTION_NAMES_SHOWN);
    const names = await Promise.all(shownUids.map(uid => getUserName(uid)));

    const parts = shownUids.map((uid, i) => mentionLink(uid, names[i]));
    const others = mentionUids.length - shownUids.length;

    if (others > 0) {
        const othersText = others === 1 ? "outra pessoa" : `outras ${others} pessoas`;
        parts.push(`<span class="post-mentions-others">${othersText}</span>`);
    }

    return ` estava com ${joinNames(parts)}`;
}

export function normalizeImgs(post) {
    if (Array.isArray(post.imgs) && post.imgs.length) {
        return post.imgs
            .map(img => (typeof img === "string" ? { url: img } : img))
            .filter(img => img && typeof img.url === "string" && img.url);
    }

    if (typeof post.imgs === "string" && post.imgs) {
        return [{ url: post.imgs }];
    }

    if (typeof post.img === "string" && post.img) {
        return [{ url: post.img }];
    }

    return [];
}

const MIN_VIDEO_RATIO = 4 / 5;

function isVideoItem(item) {
    return item?.type === "video" || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(item?.url || "");
}

function renderVideo(item) {
    const url = escapeHTML(String(item.url || ""));
    const poster = item.poster ? ` poster="${escapeHTML(String(item.poster))}"` : "";
    const ratio = Number(item.aspectRatio) || (item.width && item.height ? item.width / item.height : 9 / 16);
    const aspectRatio = Math.max(ratio, MIN_VIDEO_RATIO);

    return `
        <div class="img-card video-card" style="aspect-ratio: ${aspectRatio};">
            <video
                class="post-video"
                src="${url}"${poster}
                muted
                loop
                playsinline
                webkit-playsinline
                preload="metadata"
                disablepictureinpicture
                disableremoteplayback
            ></video>
        </div>
    `;
}

function renderImage(img) {
    if (isVideoItem(img)) return renderVideo(img);

    const url = img.url || "";

    const aspectRatio =
        img.aspectRatio ||
        (img.width && img.height
            ? `${img.width} / ${img.height}`
            : "28 / 29");

    return `
        <div class="img-card" style="aspect-ratio: ${aspectRatio};">
            <img src="${escapeHTML(String(url))}" alt="" loading="lazy">
        </div>
    `;
}

const RELOAD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" aria-label="Ícone" fill="currentColor" height="24" role="img" viewBox="0 0 44.107421875 53.796875" width="24"><title>Ícone</title><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-53.796875)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M 20.173828125,27.9296875 C 20.345703125,27.9296875 20.453125,27.97265625 20.560546875,28.080078125 L 30.29296875,38.11328125 C 30.658203125,38.5 30.744140625,38.671875 30.744140625,38.822265625 C 30.744140625,39.015625 30.63671875,39.1875 30.29296875,39.53125 L 20.58203125,49.54296875 C 20.474609375,49.650390625 20.388671875,49.71484375 20.15234375,49.71484375 C 19.80859375,49.71484375 19.63671875,49.478515625 19.63671875,49.220703125 C 19.63671875,49.02734375 19.6796875,48.8984375 19.80859375,48.76953125 L 28.7890625,39.57421875 C 27.134765625,40.025390625 24.6640625,40.412109375 22.064453125,40.412109375 C 11.837890625,40.412109375 3.845703125,32.484375 3.845703125,22.34375 C 3.845703125,12.1171875 11.837890625,4.08203125 22.064453125,4.08203125 C 32.26953125,4.08203125 40.26171875,12.1171875 40.26171875,22.34375 C 40.26171875,22.64453125 40.046875,22.859375 39.74609375,22.859375 C 39.423828125,22.859375 39.208984375,22.64453125 39.208984375,22.34375 C 39.208984375,12.697265625 31.689453125,5.134765625 22.064453125,5.134765625 C 12.41796875,5.134765625 4.8984375,12.697265625 4.8984375,22.34375 C 4.8984375,31.904296875 12.41796875,39.359375 22.064453125,39.359375 C 24.685546875,39.359375 27.37109375,39.037109375 29.240234375,38.478515625 L 19.80859375,28.875 C 19.6796875,28.74609375 19.63671875,28.6171875 19.63671875,28.423828125 C 19.63671875,28.166015625 19.830078125,27.9296875 20.173828125,27.9296875 Z"/></g></svg>`;

const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" aria-label="Ícone" fill="currentColor" height="24" role="img" viewBox="3 -6 44 52" width="24"><title>Ícone</title><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-40.17578125)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1.6" d="M 6.91796875,2.298828125 C 7.34765625,2.298828125 7.669921875,2.40625 8.20703125,2.728515625 L 35.083984375,18.583984375 C 35.8359375,18.9921875 36.287109375,19.400390625 36.287109375,20.087890625 C 36.287109375,20.75390625 35.8359375,21.162109375 35.083984375,21.591796875 L 8.20703125,37.447265625 C 7.669921875,37.76953125 7.34765625,37.876953125 6.91796875,37.876953125 C 6.05859375,37.876953125 5.478515625,37.25390625 5.478515625,36.1796875 L 5.478515625,3.99609375 C 5.478515625,2.921875 6.05859375,2.298828125 6.91796875,2.298828125 Z"/></g></svg>`;

const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" aria-label="Ícone" fill="currentColor" height="24" role="img" viewBox="0 0 40 40" width="24"><title>Ícone</title><g fill-rule="nonzero" transform="translate(3.5 3) scale(0.85,-0.85) translate(0,-34.2890625)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1.5" d="M 7.390625,0.81640625 L 11.880859375,0.81640625 C 13.234375,0.81640625 13.771484375,1.375 13.771484375,2.728515625 L 13.771484375,31.560546875 C 13.771484375,32.935546875 13.234375,33.47265625 11.880859375,33.47265625 L 7.390625,33.47265625 C 6.015625,33.47265625 5.478515625,32.935546875 5.478515625,31.560546875 L 5.478515625,2.728515625 C 5.478515625,1.375 6.015625,0.81640625 7.390625,0.81640625 Z M 20.8828125,0.81640625 L 25.373046875,0.81640625 C 26.748046875,0.81640625 27.28515625,1.375 27.28515625,2.728515625 L 27.28515625,31.560546875 C 27.28515625,32.935546875 26.748046875,33.47265625 25.373046875,33.47265625 L 20.8828125,33.47265625 C 19.529296875,33.47265625 18.9921875,32.935546875 18.9921875,31.560546875 L 18.9921875,2.728515625 C 18.9921875,1.375 19.529296875,0.81640625 20.8828125,0.81640625 Z"/></g></svg>`;

const SOUND_OFF_SVG = `<svg width="16" height="16" viewBox="0 0 41.29296875 48.146484375" xmlns="http://www.w3.org/2000/svg"><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-48.146484375)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1" d="M 31.173828125,41.958984375 C 31.173828125,42.775390625 30.744140625,43.419921875 29.86328125,43.419921875 C 29.283203125,43.419921875 28.7890625,43.09765625 28.380859375,42.732421875 L 18.154296875,32.7421875 C 17.91796875,32.52734375 17.638671875,32.419921875 17.251953125,32.419921875 L 13.40625,32.419921875 L 31.173828125,14.65234375 Z M 37.060546875,4.94140625 C 37.275390625,4.7265625 37.619140625,4.7265625 37.833984375,4.94140625 C 38.0703125,5.177734375 38.048828125,5.5 37.833984375,5.71484375 L 4.189453125,39.359375 C 4.017578125,39.53125 3.673828125,39.595703125 3.416015625,39.359375 C 3.22265625,39.14453125 3.22265625,38.80078125 3.416015625,38.5859375 Z M 10.0546875,17.23046875 L 17.2734375,17.23046875 C 17.66015625,17.23046875 17.91796875,17.123046875 18.17578125,16.908203125 L 28.380859375,7.21875 C 28.7890625,6.83203125 29.283203125,6.509765625 29.86328125,6.509765625 C 30.744140625,6.509765625 31.173828125,7.17578125 31.173828125,7.9921875 C 31.173828125,8.185546875 31.173828125,8.37890625 31.173828125,8.572265625 L 8.03515625,31.689453125 C 7.26171875,31.087890625 6.7890625,30.1640625 6.7890625,29.17578125 L 6.7890625,20.49609375 C 6.7890625,18.712890625 8.271484375,17.23046875 10.0546875,17.23046875 Z"/></g></svg>`;

const SOUND_ON_SVG = `<svg width="55.064453125px" height="42.796875px" viewBox="0 0 55.064453125 42.796875" xmlns="http://www.w3.org/2000/svg" version="1.1"><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-42.796875)"><path fill=currentColor" stroke="currentColor" fill-opacity="1.0" stroke-width="1.0" d="M 25.65234375,2.943359375 C 26.51171875,2.943359375 26.94140625,3.587890625 26.94140625,4.404296875 L 26.94140625,38.392578125 C 26.94140625,39.208984375 26.51171875,39.853515625 25.65234375,39.853515625 C 25.05078125,39.853515625 24.556640625,39.53125 24.169921875,39.166015625 L 13.943359375,29.197265625 C 13.70703125,28.9609375 13.427734375,28.853515625 13.041015625,28.853515625 L 5.84375,28.853515625 C 4.060546875,28.853515625 2.578125,27.392578125 2.578125,25.609375 L 2.578125,16.9296875 C 2.578125,15.146484375 4.060546875,13.6640625 5.84375,13.6640625 L 13.041015625,13.6640625 C 13.427734375,13.6640625 13.70703125,13.556640625 13.943359375,13.341796875 L 24.169921875,3.65234375 C 24.556640625,3.265625 25.05078125,2.943359375 25.65234375,2.943359375 Z M 47.201171875,6.939453125 C 47.458984375,6.74609375 47.73828125,6.83203125 47.931640625,7.068359375 C 50.896484375,10.87109375 52.486328125,15.8125 52.486328125,21.3984375 C 52.486328125,27.005859375 50.896484375,31.92578125 47.931640625,35.728515625 C 47.759765625,35.96484375 47.458984375,36.05078125 47.201171875,35.857421875 C 46.943359375,35.685546875 46.943359375,35.384765625 47.115234375,35.10546875 C 49.5859375,31.23828125 51.43359375,26.76953125 51.43359375,21.3984375 C 51.43359375,16.005859375 49.88671875,11.30078125 47.072265625,7.6484375 C 46.87890625,7.412109375 46.943359375,7.111328125 47.201171875,6.939453125 Z M 38.865234375,12.6328125 C 39.1015625,12.4609375 39.423828125,12.50390625 39.595703125,12.740234375 C 41.25,14.845703125 42.41015625,17.939453125 42.41015625,21.3984375 C 42.41015625,24.87890625 41.25,27.951171875 39.595703125,30.056640625 C 39.423828125,30.29296875 39.123046875,30.357421875 38.865234375,30.1640625 C 38.62890625,29.970703125 38.5859375,29.669921875 38.779296875,29.369140625 C 40.240234375,27.37109375 41.357421875,24.599609375 41.357421875,21.3984375 C 41.357421875,18.154296875 40.21875,15.318359375 38.71484375,13.3203125 C 38.54296875,13.10546875 38.62890625,12.826171875 38.865234375,12.6328125 Z"/></g></svg>`;

const VIDEO_PLAY_RATIO = 0.5;

let apiPromise = null;
let currentController = null;
let autoplayMusic = false;
const infoCache = new Map();
const musicControllers = new Map();
const soundControllers = new Map();
const videoVisibility = new Map();

const videoObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(onVideoVisibility, { threshold: [0, 0.25, VIDEO_PLAY_RATIO, 0.75, 1] })
    : null;

function playVideoElement(video) {
    const attempt = video.play?.();

    if (!attempt?.catch) return;

    attempt.catch(() => {
        if (video.muted) return;

        video.muted = true;
        soundControllers.get(video.closest(".post-card-new"))?.markMuted?.();
        video.play?.().catch(() => {});
    });
}

function onVideoVisibility(entries) {
    entries.forEach(entry => {
        const video = entry.target;
        const ratio = entry.isIntersecting ? entry.intersectionRatio : 0;

        videoVisibility.set(video, ratio);

        if (ratio < VIDEO_PLAY_RATIO) {
            video.pause();
            return;
        }

        const controller = soundControllers.get(video.closest(".post-card-new"));

        if (controller && controller === currentController && controller.isPlaying() && video.muted) {
            controller.play();
            return;
        }

        playVideoElement(video);
    });
}

function initVideos(postElement) {
    postElement.querySelectorAll("video.post-video").forEach(video => {
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;

        if (videoObserver) videoObserver.observe(video);
        else playVideoElement(video);
    });
}

function soundToggleHTML() {
    return `
        <button class="post-music-toggle post-sound-toggle" type="button" aria-label="Ativar som">
            <span class="post-music-icon play">${SOUND_OFF_SVG}</span>
            <span class="post-music-icon pause">${SOUND_ON_SVG}</span>
        </button>
    `;
}

function initVideoSound(postElement) {
    const button = postElement.querySelector(".post-sound-toggle");

    if (!button || button.dataset.soundReady) return;

    button.dataset.soundReady = "1";

    let playing = false;

    const videos = () => [...postElement.querySelectorAll("video.post-video")];

    function setPlaying(value) {
        playing = value;
        button.classList.toggle("playing", value);
        button.setAttribute("aria-label", value ? "Desativar som" : "Ativar som");
    }

    function activeVideo() {
        let best = null;
        let bestRatio = -1;

        videos().forEach(video => {
            const ratio = videoVisibility.get(video) || 0;

            if (ratio > bestRatio) {
                best = video;
                bestRatio = ratio;
            }
        });

        return best;
    }

    function mute() {
        videos().forEach(video => {
            video.muted = true;
        });

        setPlaying(false);
    }

    async function play() {
        if (currentController && currentController !== controller) currentController.pause();

        currentController = controller;

        const target = activeVideo();

        if (!target) return;

        videos().forEach(video => {
            if (video !== target) video.muted = true;
        });

        target.muted = false;

        try {
            await target.play();
            setPlaying(true);
        } catch {
            target.muted = true;
            target.play?.().catch(() => {});
            setPlaying(false);
        }
    }

    const controller = {
        play: () => play(),
        pause: mute,
        destroy: mute,
        isPlaying: () => playing,
        markMuted: () => setPlaying(false)
    };

    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        if (playing) {
            autoplayMusic = false;
            mute();
            return;
        }

        autoplayMusic = true;
        play();
    });

    soundControllers.set(postElement, controller);
    registerMusic(postElement, controller);
}
const musicVisibility = new Map();

const AUTOPLAY_RATIO = 0.6;
const KEEP_PLAYING_RATIO = 0.3;

const musicObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(onMusicVisibility, { threshold: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1] })
    : null;

function registerMusic(postElement, controller) {
    if (!postElement) return;

    controller.element = postElement;
    musicControllers.set(postElement, controller);
    musicObserver?.observe(postElement);
}

function onMusicVisibility(entries) {
    entries.forEach(entry => {
        musicVisibility.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
    });

    if (!autoplayMusic) return;

    const currentRatio = currentController?.element
        ? musicVisibility.get(currentController.element) || 0
        : 0;

    if (currentController && currentRatio >= AUTOPLAY_RATIO) return;

    let best = null;
    let bestRatio = 0;

    musicVisibility.forEach((ratio, element) => {
        if (element.isConnected && ratio > bestRatio) {
            best = element;
            bestRatio = ratio;
        }
    });

    const next = best && bestRatio >= AUTOPLAY_RATIO ? musicControllers.get(best) : null;

    if (next && next !== currentController) {
        next.play();
        return;
    }

    if (currentController && currentRatio < KEEP_PLAYING_RATIO) currentController.pause();
}

function createHiddenPlayer(holder, videoId, events) {
    return loadYouTubeAPI().then(() => new Promise((resolve, reject) => {
        const mount = document.createElement("div");
        holder.appendChild(mount);

        const player = new window.YT.Player(mount, {
            videoId,
            width: 200,
            height: 200,
            playerVars: {
                playsinline: 1,
                controls: 0,
                disablekb: 1,
                fs: 0,
                rel: 0,
                modestbranding: 1
            },
            events: {
                onReady: () => resolve(player),
                onStateChange: events.onStateChange,
                onError: event => {
                    events.onError?.(event);
                    reject(new Error("Falha ao carregar o vídeo"));
                }
            }
        });
    }));
}

function getYouTubeId(url) {
    try {
        const parsed = new URL(String(url ?? "").trim());
        const host = parsed.hostname.replace(/^(www|m|music)\./, "");

        let id = null;

        if (host === "youtu.be") {
            id = parsed.pathname.slice(1).split("/")[0];
        } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
            if (parsed.pathname === "/watch") {
                id = parsed.searchParams.get("v");
            } else {
                id = parsed.pathname.match(/^\/(?:embed|shorts|live|v)\/([^/?]+)/)?.[1];
            }
        }

        return /^[\w-]{11}$/.test(id ?? "") ? id : null;
    } catch {
        return null;
    }
}

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

function fetchMusicInfo(videoId) {
    if (!infoCache.has(videoId)) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;

        infoCache.set(
            videoId,
            fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`)
                .then(response => (response.ok ? response.json() : null))
                .then(data => (data ? { title: data.title, author: data.author_name } : null))
                .catch(() => null)
        );
    }

    return infoCache.get(videoId);
}

function formatName(title = "", author = "") {
    const cleanAuthor = author.replace(/\s*-\s*Topic$/i, "").trim();

    if (!cleanAuthor || title.toLowerCase().includes(cleanAuthor.toLowerCase())) {
        return title;
    }

    return `${title} - ${cleanAuthor}`;
}

const META_ROTATE_MS = 6000;

const LOCATION_SVG = `<svg aria-label="Ícone" class="x1lliihq x1n2onr6 xyb1xck" fill="currentColor" height="24" role="img" viewBox="1.5 3.5 44.5 45.5" width="24"><title>Ícone</title><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-51.283203125)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1.6" d="M4.555 25.803L23.203 25.76C23.354 25.76 23.461 25.652 23.461 25.502L23.504 6.854C23.504 6.145 23.934 5.586 24.535 5.586C25.072 5.586 25.438 5.951 25.674 6.488L43.248 43.721C43.398 44.064 43.484 44.387 43.484 44.666C43.484 45.139 43.098 45.697 42.389 45.697C42.152 45.697 41.809 45.654 41.443 45.482L4.189 27.973C3.674 27.736 3.287 27.328 3.287 26.834C3.287 26.254 3.781 25.803 4.555 25.803Z"/></g></svg>`;

const MUSIC_SVG = `<svg aria-label="Ícone" class="x1lliihq x1n2onr6 xyb1xck" fill="currentColor" height="24" role="img" viewBox="3 3 50 48" width="24"><title>Ícone</title><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-53.49609375)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1.6" d="M29.133 5.801C32.248 5.801 36.824 8.035 36.824 14.137V32.807C36.824 33.967 37.039 34.203 38.113 34.461L48.361 36.717C49.135 36.867 49.629 37.469 49.629 38.242V45.697C49.629 46.9 48.662 47.695 47.48 47.438L36.158 45.010C34.783 44.709 34.117 44.021 34.117 42.883L34.246 20.023C34.246 18.949 33.730 18.240 32.764 18.047L29.391 17.338C25.201 16.457 23.246 14.352 23.246 11.193C23.246 8.014 25.695 5.801 29.133 5.801ZM6.037 37.533H26.512C26.834 37.533 27.070 37.770 27.070 38.070C27.070 38.371 26.834 38.607 26.512 38.607H6.037C5.715 38.607 5.479 38.371 5.479 38.070C5.479 37.770 5.715 37.533 6.037 37.533ZM6.037 30.422H26.512C26.834 30.422 27.070 30.658 27.070 30.959C27.070 31.238 26.834 31.475 26.512 31.475H6.037C5.715 31.475 5.479 31.238 5.479 30.959C5.479 30.658 5.715 30.422 6.037 30.422ZM6.037 23.289H26.512C26.834 23.289 27.070 23.547 27.070 23.826C27.070 24.127 26.834 24.363 26.512 24.363H6.037C5.715 24.363 5.479 24.127 5.479 23.826C5.479 23.547 5.715 23.289 6.037 23.289Z"/></g></svg>`;

function buildPostMeta({ dateText, location, headerMusicId }) {
    const locationHTML = location
        ? `
            <div class="post-location-area">
                <div class="post-date-area-icon">${LOCATION_SVG}</div>
                <div class="post-location-area-name">${escapeHTML(location)}</div>
            </div>
        `
        : "";

    const musicHTML = headerMusicId
        ? `
            <div class="post-music-area">
                <div class="post-music-area-icon">${MUSIC_SVG}</div>
                <div class="post-music-area-name">Música</div>
            </div>
        `
        : "";

    return `
        <div class="post-meta-new">
            <div class="post-date-new active">${dateText}</div>
            ${locationHTML}
            ${musicHTML}
        </div>
    `;
}

function initHeaderMusic(postElement, videoId) {
    if (!videoId) return;

    const nameElement = postElement.querySelector(".post-music-area-name");

    if (!nameElement) return;

    fetchMusicInfo(videoId).then(info => {
        const text = info ? formatName(info.title, info.author) : "";

        if (text) nameElement.textContent = text;
    });
}

function rotatePostMeta() {
    if (document.hidden) return;

    document.querySelectorAll(".post-meta-new").forEach(meta => {
        const items = [...meta.children];

        if (items.length < 2) return;

        const current = items.findIndex(item => item.classList.contains("active"));

        items[current]?.classList.remove("active");
        items[(current + 1) % items.length].classList.add("active");
    });
}

setInterval(rotatePostMeta, META_ROTATE_MS);

function musicCardHTML(videoId) {
    const cover = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    return `
        <div class="music-card-area">
            <div class="music-card" data-music-id="${videoId}">
                <div class="music-card-body">
                    <div class="music-card-top">
                        <div class="music-cover-area">
                            <div
                                class="music-cover"
                                style="background-image: url('${cover}'); background-size: cover; background-position: center;"
                            ></div>
                        </div>

                        <div class="music-info">
                            <div class="music-name">Carregando…</div>
                        </div>

                        <div class="music-controls-top">
                            <button class="music-control" data-music-action="reload" type="button" aria-label="Recomeçar">${RELOAD_SVG}</button>
                            <button class="music-control" data-music-action="play" type="button" aria-label="Tocar">${PLAY_SVG}</button>
                            <button class="music-control hidden" data-music-action="pause" type="button" aria-label="Pausar">${PAUSE_SVG}</button>
                        </div>
                    </div>

                    <div class="music-card-bottom">
                        <div class="music-controls">
                            <div class="music-controls-bottom">
                                <div class="music-track">
                                    <div class="music-tracker"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div
                    class="music-player"
                    aria-hidden="true"
                    style="position: absolute; left: -9999px; top: 0; width: 200px; height: 200px; overflow: hidden; pointer-events: none;"
                ></div>
            </div>
        </div>
    `;
}

function initMusicCard(card) {
    if (card.dataset.musicReady) return;

    card.dataset.musicReady = "1";

    const videoId = card.dataset.musicId;
    const nameElement = card.querySelector(".music-name");
    const holder = card.querySelector(".music-player");
    const track = card.querySelector(".music-track");
    const tracker = card.querySelector(".music-tracker");
    const reloadButton = card.querySelector('[data-music-action="reload"]');
    const playButton = card.querySelector('[data-music-action="play"]');
    const pauseButton = card.querySelector('[data-music-action="pause"]');

    let player = null;
    let readyPromise = null;
    let ready = false;
    let playing = false;
    let dragging = false;
    let timer = null;
    let pendingFraction = null;
    let lastFraction = 0;
    let infoLoaded = false;

    const controller = {
        pause() {
            player?.pauseVideo?.();
        },
        play: () => play(),
        destroy: () => destroy()
    };

    function setName(title, author) {
        const text = formatName(title, author);

        if (!text) return;

        nameElement.textContent = text;
        infoLoaded = true;
    }

    function setTracker(fraction) {
        tracker.style.width = `${Math.min(1, Math.max(0, fraction)) * 100}%`;
    }

    function tick() {
        if (!card.isConnected) {
            destroy();
            return;
        }

        if (dragging || !ready) return;

        const duration = player.getDuration();

        if (duration) setTracker(player.getCurrentTime() / duration);
    }

    function startTimer() {
        timer ??= setInterval(tick, 250);
    }

    function stopTimer() {
        clearInterval(timer);
        timer = null;
    }

    function setPlaying(value) {
        playing = value;

        playButton.classList.toggle("hidden", value);
        pauseButton.classList.toggle("hidden", !value);

        if (value) startTimer();
        else stopTimer();
    }

    function destroy() {
        stopTimer();

        try {
            player?.destroy();
        } catch {
        }

        player = null;

        if (currentController === controller) currentController = null;
    }

    function onStateChange(event) {
        const states = window.YT.PlayerState;

        if (event.data === states.PLAYING) {
            setPlaying(true);
        } else if (event.data === states.PAUSED) {
            setPlaying(false);
        } else if (event.data === states.ENDED) {
            setPlaying(false);
            setTracker(0);
        }
    }

    function ensurePlayer() {
        readyPromise ??= (async () => {
            await loadYouTubeAPI();

            await new Promise((resolve, reject) => {
                const mount = document.createElement("div");
                holder.appendChild(mount);

                player = new window.YT.Player(mount, {
                    videoId,
                    width: 200,
                    height: 200,
                    playerVars: {
                        playsinline: 1,
                        controls: 0,
                        disablekb: 1,
                        fs: 0,
                        rel: 0,
                        modestbranding: 1
                    },
                    events: {
                        onReady: () => {
                            ready = true;

                            const data = player.getVideoData?.();

                            if (!infoLoaded && data?.title) setName(data.title, data.author);

                            resolve();
                        },
                        onStateChange,
                        onError: event => {
                            const reasons = {
                                2: "link inválido",
                                5: "erro no player do YouTube",
                                100: "vídeo removido ou privado",
                                101: "o dono não permite tocar fora do YouTube",
                                150: "o dono não permite tocar fora do YouTube"
                            };

                            const reason = reasons[event.data] || "erro desconhecido";

                            console.warn(`Música indisponível (${videoId}): erro ${event.data} - ${reason}`);

                            setPlaying(false);
                            card.classList.add("music-unavailable");
                            nameElement.textContent = "Música indisponível";
                            nameElement.title = reason;
                            reject(new Error("Falha ao carregar o vídeo"));
                        }
                    }
                });
            });
        })();

        return readyPromise;
    }

    function seek(fraction) {
        const duration = player.getDuration();

        if (duration) player.seekTo(fraction * duration, true);
    }

    async function play() {
        if (currentController && currentController !== controller) currentController.pause();

        currentController = controller;

        try {
            await ensurePlayer();
        } catch {
            return;
        }

        if (currentController !== controller) return;

        if (pendingFraction !== null) {
            seek(pendingFraction);
            pendingFraction = null;
        } else if (player.getPlayerState() === window.YT.PlayerState.ENDED) {
            player.seekTo(0, true);
        }

        player.playVideo();
    }

    function pause() {
        player?.pauseVideo?.();
    }

    function reload() {
        pendingFraction = null;
        setTracker(0);

        if (ready) player.seekTo(0, true);

        play();
    }

    function commitSeek() {
        dragging = false;

        if (!ready) {
            pendingFraction = lastFraction;
            return;
        }

        seek(lastFraction);

        if (!playing) player.pauseVideo();
    }

    function fractionAt(event) {
        const rect = track.getBoundingClientRect();

        if (!rect.width) return 0;

        return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    }

    track.style.touchAction = "none";

    track.addEventListener("pointerdown", event => {
        dragging = true;
        track.setPointerCapture(event.pointerId);

        lastFraction = fractionAt(event);
        setTracker(lastFraction);
    });

    track.addEventListener("pointermove", event => {
        if (!dragging) return;

        lastFraction = fractionAt(event);
        setTracker(lastFraction);
    });

    track.addEventListener("pointerup", event => {
        if (!dragging) return;

        lastFraction = fractionAt(event);
        setTracker(lastFraction);
        commitSeek();
    });

    track.addEventListener("pointercancel", () => {
        if (dragging) commitSeek();
    });

    playButton.addEventListener("click", () => {
        autoplayMusic = true;
        play();
    });

    pauseButton.addEventListener("click", () => {
        autoplayMusic = false;
        pause();
    });

    reloadButton.addEventListener("click", () => {
        autoplayMusic = true;
        reload();
    });

    registerMusic(card.closest(".post-card-new"), controller);

    fetchMusicInfo(videoId).then(info => {
        if (info) setName(info.title, info.author);
        else if (!infoLoaded) nameElement.textContent = "Música";
    });
}

function initMusicCards(root) {
    root?.querySelectorAll(".music-card[data-music-id]").forEach(initMusicCard);
}

function musicToggleHTML(videoId) {
    return `
        <button class="post-music-toggle" type="button" data-music-id="${videoId}" aria-label="Tocar música">
            <span class="post-music-icon play">${PLAY_SVG}</span>
            <span class="post-music-icon pause">${PAUSE_SVG}</span>
        </button>
        <div
            class="post-music-holder"
            aria-hidden="true"
            style="position: absolute; left: -9999px; top: 0; width: 200px; height: 200px; overflow: hidden; pointer-events: none;"
        ></div>
    `;
}

function initMusicToggle(postElement) {
    const button = postElement.querySelector(".post-music-toggle");
    const holder = postElement.querySelector(".post-music-holder");

    if (!button || !holder || button.dataset.musicReady) return;

    button.dataset.musicReady = "1";

    const videoId = button.dataset.musicId;

    let player = null;
    let readyPromise = null;
    let playing = false;

    function setPlaying(value) {
        playing = value;
        button.classList.toggle("playing", value);
        button.setAttribute("aria-label", value ? "Pausar música" : "Tocar música");
    }

    function destroy() {
        try {
            player?.destroy();
        } catch {
            player = null;
        }

        player = null;
        readyPromise = null;
        setPlaying(false);

        if (currentController === controller) currentController = null;
    }

    function ensurePlayer() {
        readyPromise ??= createHiddenPlayer(holder, videoId, {
            onStateChange: event => {
                const states = window.YT.PlayerState;

                if (event.data === states.PLAYING) {
                    setPlaying(true);
                } else if (event.data === states.PAUSED) {
                    setPlaying(false);
                } else if (event.data === states.ENDED) {
                    setPlaying(false);
                    player?.seekTo?.(0, true);
                    player?.pauseVideo?.();
                }
            },
            onError: () => {
                setPlaying(false);
                button.classList.add("music-unavailable");
            }
        }).then(created => {
            player = created;
            return created;
        });

        return readyPromise;
    }

    async function play() {
        if (currentController && currentController !== controller) currentController.pause();

        currentController = controller;

        try {
            await ensurePlayer();
        } catch {
            return;
        }

        if (currentController !== controller || !player) return;

        player.playVideo();
    }

    const controller = {
        play: () => play(),
        pause() {
            player?.pauseVideo?.();
        },
        destroy
    };

    button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();

        if (playing) {
            autoplayMusic = false;
            controller.pause();
            return;
        }

        autoplayMusic = true;
        play();
    });

    registerMusic(postElement, controller);
}

export function renderPost({ container, postId, content, imgs, creator, dateText, creatorid, mentionsHTML = "", music = "", location = "", before = null }) {
    const safeCreatorId = escapeHTML(String(creatorid || ""));
    const profileUrl = `profile.html?uid=${encodeURIComponent(creatorid || "")}`;

    const contentHTML = content
        ? `
            <div class="post-content-text">
                ${escapeHTML(content)}
            </div>
        `
        : "";

    const videoId = getYouTubeId(music);
    const toggleHTML = videoId && imgs.length
        ? musicToggleHTML(videoId)
        : imgs.some(isVideoItem)
            ? soundToggleHTML()
            : "";

    const mediaHTML =
        imgs.length === 1
            ? `
                <div class="post-content-media">
                    ${renderImage(imgs[0])}
                    ${toggleHTML}
                </div>
            `
            : imgs.length > 1
                ? `
                    <div class="post-content-media carousel">
                        <div class="carousel-track">
                            ${imgs.map(img => renderImage(img)).join("")}
                        </div>
                        ${toggleHTML}
                    </div>
                `
                : "";

    const hasMedia = imgs.length > 0;

    const musicId = !hasMedia ? videoId : null;

    const headerMusicId = hasMedia ? videoId : null;

    const musicHTML = musicId ? musicCardHTML(musicId) : "";

    const metaHTML = buildPostMeta({
        dateText,
        location: String(location || "").trim(),
        headerMusicId
    });

    const postHTML = `
        <div class="post-card-new" data-post-id="${escapeHTML(postId)}">
            <div class="post-header-new">
                <div class="post-pfp-area post-owner-link" data-profile-uid="${safeCreatorId}">
                    <div class="post-pfp">
                        <img src="${escapeHTML(creator.photo)}" alt="">
                    </div>
                </div>

                <div class="post-header-infos">
                    <div class="post-author-name-area">
                        <a
                            class="post-author-name post-profile-link"
                            href="${profileUrl}"
                            data-profile-uid="${safeCreatorId}"
                        >
                            ${escapeHTML(creator.name)}
                        </a>${mentionsHTML}
                    </div>

                    ${metaHTML}
                </div>

                <div class="post-more-actions">
                    <button
                        class="post-more"
                        data-post-id="${escapeHTML(postId)}"
                        data-creator-id="${safeCreatorId}"
                    >
                        <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <rect x="2" y="7" width="20" height="2.5" rx="1.25"/>
                            <rect x="2" y="15" width="15" height="2.5" rx="1.25"/>
                        </svg>
                    </button>
                </div>
            </div>

            <div class="post-content-new">
                ${contentHTML}
                ${mediaHTML}
                ${musicHTML}
            </div>

            <div class="post-bottom">
                <div class="post-actions-area">
                    <div class="post-actions-left">
                        <button class="post-action-btn like-btn" type="button">
                            <svg
                                class="heart-outline"
                                aria-label="Curtir"
                                fill="currentColor"
                                height="24"
                                viewBox="0 0 24 24"
                                width="24"
                            >
                                <title>Curtir</title>
                                <path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"/>
                            </svg>

                            <svg
                                aria-label="Descurtir"
                                class="heart-fill"
                                fill="currentColor"
                                height="24"
                                role="img"
                                viewBox="0 0 48 48"
                                width="24"
                            >
                                <title>Descurtir</title>
                                <path d="M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6-2.7-3.7-6.1-5.5-10.6-5.5C6 3.1 0 9.6 0 17.6c0 7.3 5.4 12 10.6 16.5.6.5 1.3 1.1 1.9 1.7l2.3 2c4.4 3.9 6.6 5.9 7.6 6.5.5.3 1.1.5 1.6-.5c1-.6 2.8-2.2 7.8-6.8l2-1.8c.7-.6 1.3-1.2 2-1.7C42.7 29.6 48 25 48 17.6c0-8-6-14.5-13.4-14.5z"/>
                            </svg>

                            <span class="like-count">0</span>
                        </button>

                        <button class="post-action-btn comment-btn" type="button">
                            <svg
                                viewBox="0 0 122.97 122.88"
                                class="comment-outline"
                                fill="currentColor"
                            >
                                <path d="M61.44,0a61.46,61.46,0,0,1,54.91,89l6.44,25.74a5.83,5.83,0,0,1-7.25,7L91.62,115A61.43,61.43,0,1,1,61.44,0ZM96.63,26.25a49.78,49.78,0,1,0-9,77.52A5.83,5.83,0,0,1,92.4,103L109,107.77l-4.5-18a5.86,5.86,0,0,1,.51-4.34,49.06,49.06,0,0,0,4.62-11.58,50,50,0,0,0-13-47.62Z"/>
                            </svg>

                            <span class="comment-count">0</span>
                        </button>
                    </div>
                </div>

                <div class="post-graph-box">
                    <div class="post-graph-item likers-preview">
                        <div class="post-graph-text"></div>
                    </div>
                    <div class="comments-preview"></div>
                </div>
            </div>
        </div>
    `;

    let postElement;

    if (before && before.parentNode === container) {
        before.insertAdjacentHTML("beforebegin", postHTML);
        postElement = before.previousElementSibling;
    } else {
        container.insertAdjacentHTML("beforeend", postHTML);
        postElement = container.lastElementChild;
    }

    initMusicCards(postElement);
    initMusicToggle(postElement);
    initVideos(postElement);
    initVideoSound(postElement);
    initHeaderMusic(postElement, headerMusicId);

    return postElement;
}

export async function hydratePost(postElement, postId) {
    const liked = await hasLikedPost(postId);

    updateLikeIcon(postElement, liked);
    trackListeners(postElement, listenPostCount(postId, postElement));
}

export function getPostMentionsHTML(data) {
    return Promise.all([
        buildWallHTML(data).catch(() => ""),
        buildMentionsHTML(getMentionUids(data, data.creatorid || "")).catch(() => "")
    ]).then(parts => parts.join(""));
}

export function appendPost(container, { postId, data, creator, mentionsHTML = "", before = null }) {
    const created = data.create?.toDate?.();

    const postElement = renderPost({
        container,
        postId,
        content: data.content || "",
        imgs: normalizeImgs(data),
        creator,
        dateText: created ? formatPostDate(created) : "",
        creatorid: data.creatorid || "",
        mentionsHTML,
        music: data.music || "",
        location: data.location || "",
        before
    });

    hydratePost(postElement, postId)
        .catch(error => console.error("Erro ao carregar post:", error));

    return postElement;
}

export function formatPostDate(date) {
    const now = new Date();
    const difference = Math.floor((now - date) / 1000);

    if (difference < 60) return "Agora mesmo";

    const minutes = Math.floor(difference / 60);

    if (minutes < 60) {
        return `Há ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `Há ${hours} ${hours === 1 ? "hora" : "horas"}`;
    }

    const days = Math.floor(hours / 24);

    if (days < 7) {
        return `Há ${days} ${days === 1 ? "dia" : "dias"}`;
    }

    const weeks = Math.floor(days / 7);

    if (weeks < 4) {
        return `Há ${weeks} ${weeks === 1 ? "semana" : "semanas"}`;
    }

    const months = Math.floor(days / 30);

    if (months < 12) {
        return `Há ${months} ${months === 1 ? "mês" : "meses"}`;
    }

    const years = Math.floor(days / 365);

    return `Há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

export function bindPostInteractions(container) {
    if (!container || boundContainers.has(container)) return;

    boundContainers.add(container);

    container.addEventListener("click", async event => {
        const profileElement = event.target.closest(
            ".post-owner-link, .post-profile-link"
        );

        if (profileElement) {
            event.preventDefault();
            event.stopPropagation();

            const uid = profileElement.dataset.profileUid;

            if (!uid) return;

            window.location.href =
                `profile.html?uid=${encodeURIComponent(uid)}`;

            return;
        }

        const likersTrigger = event.target.closest(".likers-preview");

        if (likersTrigger) {
            const postElement =
                likersTrigger.closest(".post-card-new");

            if (!postElement) return;

            const postId = postElement.dataset.postId;

            if (!postId) return;

            await openLikes(postId);

            return;
        }

        const likeButton = event.target.closest(".like-btn");

        if (!likeButton) return;

        const postElement = likeButton.closest(".post-card-new");

        if (!postElement) return;

        const postId = postElement.dataset.postId;

        if (!postId) return;

        const liked = await hasLikedPost(postId);

        if (liked) {
            updateLikeIcon(postElement, false);

            try {
                await unlikePost(postId);
            } catch {
                updateLikeIcon(postElement, true);
            }
        } else {
            updateLikeIcon(postElement, true);

            try {
                await likePost(postId);
            } catch {
                updateLikeIcon(postElement, false);
            }
        }
    });
}