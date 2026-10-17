import { app, auth } from "/src/config/config.js";
import {
  getStorage,
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

export const MAX_MEDIA = 12;
export const MAX_VIDEO_SECONDS = 30;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

const METADATA_TIMEOUT_MS = 15000;
const POSTER_MAX_WIDTH = 720;
const DURATION_TOLERANCE = 0.5;
const NOTICE_MS = 3200;

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|3gp)$/i;

let noticeTimer = null;

export function isVideoFile(file) {
  return Boolean(file) && (String(file.type).startsWith("video/") || VIDEO_EXTENSIONS.test(file.name || ""));
}

export function isVideoMedia(item) {
  return item?.type === "video" || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(item?.url || "");
}

export function showMediaNotice(text) {
  let notice = document.getElementById("mediaNotice");

  if (!notice) {
    notice = document.createElement("div");
    notice.id = "mediaNotice";
    notice.className = "media-notice";
    document.body.appendChild(notice);
  }

  notice.textContent = text;
  notice.classList.add("active");

  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => notice.classList.remove("active"), NOTICE_MS);
}

function loadVideoElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");

    const cleanup = () => clearTimeout(timer);

    const timer = setTimeout(() => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler o vídeo"));
    }, METADATA_TIMEOUT_MS);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");

    video.onloadedmetadata = () => {
      cleanup();
      resolve({ video, url });
    };

    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error("Formato de vídeo não suportado"));
    };

    video.src = url;
    video.load();
  });
}

export async function readVideoInfo(file) {
  const { video, url } = await loadVideoElement(file);

  const info = {
    duration: Number.isFinite(video.duration) ? video.duration : 0,
    width: video.videoWidth || 0,
    height: video.videoHeight || 0
  };

  video.removeAttribute("src");
  video.load();
  URL.revokeObjectURL(url);

  return info;
}

export async function validateVideo(file) {
  if (file.size > MAX_VIDEO_BYTES) {
    return { ok: false, reason: "Vídeo muito grande (máx. 100 MB)" };
  }

  try {
    const info = await readVideoInfo(file);

    if (!info.duration || info.duration > MAX_VIDEO_SECONDS + DURATION_TOLERANCE) {
      return { ok: false, reason: `Vídeos podem ter no máximo ${MAX_VIDEO_SECONDS} segundos` };
    }

    return { ok: true, info };
  } catch (error) {
    return { ok: false, reason: error.message || "Não foi possível ler o vídeo" };
  }
}

export function selectMediaFiles(currentCount) {
  const remaining = MAX_MEDIA - currentCount;

  if (remaining <= 0) {
    showMediaNotice(`Máximo de ${MAX_MEDIA} fotos ou vídeos por post`);
    return Promise.resolve([]);
  }

  return new Promise(resolve => {
    const input = document.createElement("input");

    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;

    input.onchange = async () => {
      const picked = Array.from(input.files || [])
        .filter(file => String(file.type).startsWith("image/") || isVideoFile(file));

      if (picked.length > remaining) {
        showMediaNotice(`Máximo de ${MAX_MEDIA} fotos ou vídeos por post`);
      }

      const accepted = [];

      for (const file of picked.slice(0, remaining)) {
        if (!isVideoFile(file)) {
          accepted.push(file);
          continue;
        }

        const check = await validateVideo(file);

        if (check.ok) accepted.push(file);
        else showMediaNotice(check.reason);
      }

      resolve(accepted);
    };

    input.click();
  });
}

export function createMediaPreview(file) {
  if (isVideoFile(file)) {
    const video = document.createElement("video");

    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("muted", "");
    video.preload = "metadata";
    video.play?.().catch(() => {});

    return video;
  }

  const image = document.createElement("img");

  image.alt = "Preview";
  image.src = URL.createObjectURL(file);

  return image;
}

export function revokeMediaPreview(element) {
  const source = element?.getAttribute?.("src");

  if (source?.startsWith("blob:")) URL.revokeObjectURL(source);
}

function waitFor(target, eventName) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), METADATA_TIMEOUT_MS);

    target.addEventListener(eventName, () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

async function capturePoster(file) {
  const { video, url } = await loadVideoElement(file);

  try {
    video.preload = "auto";

    try {
      await video.play();
      video.pause();
    } catch {
      video.pause();
    }

    const time = Math.min(0.2, (video.duration || 1) / 2);

    if (Math.abs(video.currentTime - time) > 0.01) {
      const seeked = waitFor(video, "seeked");
      video.currentTime = time;
      await seeked;
    }

    if (video.readyState < 2) await waitFor(video, "loadeddata");

    const scale = Math.min(1, POSTER_MAX_WIDTH / (video.videoWidth || POSTER_MAX_WIDTH));
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round((video.videoWidth || POSTER_MAX_WIDTH) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || POSTER_MAX_WIDTH) * scale));
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);

    return await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.75));
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

function videoExtension(file) {
  const fromName = (file.name || "").match(/\.([a-z0-9]+)$/i)?.[1];

  if (fromName) return fromName.toLowerCase();
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/webm") return "webm";

  return "mp4";
}

function contentTypeOf(file) {
  if (String(file.type).startsWith("video/")) return file.type;

  const extension = videoExtension(file);

  if (extension === "mov") return "video/quicktime";
  if (extension === "webm") return "video/webm";

  return "video/mp4";
}

export async function uploadVideo(file, onProgress) {
  const user = auth.currentUser;

  if (!user) throw new Error("Usuário não autenticado");

  const check = await validateVideo(file);

  if (!check.ok) throw new Error(check.reason);

  const storage = getStorage(app);
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const contentType = contentTypeOf(file);
  const videoRef = ref(storage, `posts/${user.uid}/${id}.${videoExtension(file)}`);

  const task = uploadBytesResumable(videoRef, file, {
    contentType,
    cacheControl: "public,max-age=31536000"
  });

  await new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      snapshot => onProgress?.(snapshot.bytesTransferred / (snapshot.totalBytes || 1)),
      reject,
      resolve
    );
  });

  const url = await getDownloadURL(videoRef);

  let poster = "";

  try {
    const posterBlob = await capturePoster(file);

    if (posterBlob) {
      const posterRef = ref(storage, `posts/${user.uid}/${id}-poster.jpg`);

      await uploadBytes(posterRef, posterBlob, {
        contentType: "image/jpeg",
        cacheControl: "public,max-age=31536000"
      });

      poster = await getDownloadURL(posterRef);
    }
  } catch (error) {
    console.warn("Não foi possível gerar a capa do vídeo:", error);
  }

  const { width, height, duration } = check.info;

  return {
    url,
    type: "video",
    poster,
    width,
    height,
    aspectRatio: width && height ? width / height : 9 / 16,
    duration: Math.round(duration * 10) / 10,
    fileSize: file.size,
    contentType
  };
}
