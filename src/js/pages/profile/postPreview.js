import { cloneTemplate, createImage } from "./dom.js";
import { getPostImages } from "./postImages.js";

const MAX_PREVIEW_TEXT = 80;

const MULTI_IMAGE_ICON = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 3C1 1.89543 1.89543 1 3 1H10C11.1046 1 12 1.89543 12 3V10C12 11.1046 11.1046 12 10 12H3C1.89543 12 1 11.1046 1 10V3Z" fill="white"/><path d="M15 4.5C15 3.67157 14.3284 3 13.5 3V10.5C13.5 12.1569 12.1569 13.5 10.5 13.5H3C3 14.3284 3.67157 15 4.5 15H11C13.2091 15 15 13.2091 15 11V4.5Z" fill="white"/></svg>`;

const MUSIC_ICON = `<svg class="x1lliihq x1n2onr6 xyb1xck" fill="currentColor" height="16" role="img" viewBox="3 3 50 48" width="24"><title>Ícone</title><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-53.49609375)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1.6" d="M29.133 5.801C32.248 5.801 36.824 8.035 36.824 14.137V32.807C36.824 33.967 37.039 34.203 38.113 34.461L48.361 36.717C49.135 36.867 49.629 37.469 49.629 38.242V45.697C49.629 46.9 48.662 47.695 47.48 47.438L36.158 45.010C34.783 44.709 34.117 44.021 34.117 42.883L34.246 20.023C34.246 18.949 33.730 18.240 32.764 18.047L29.391 17.338C25.201 16.457 23.246 14.352 23.246 11.193C23.246 8.014 25.695 5.801 29.133 5.801ZM6.037 37.533H26.512C26.834 37.533 27.070 37.770 27.070 38.070C27.070 38.371 26.834 38.607 26.512 38.607H6.037C5.715 38.607 5.479 38.371 5.479 38.070C5.479 37.770 5.715 37.533 6.037 37.533ZM6.037 30.422H26.512C26.834 30.422 27.070 30.658 27.070 30.959C27.070 31.238 26.834 31.475 26.512 31.475H6.037C5.715 31.475 5.479 31.238 5.479 30.959C5.479 30.658 5.715 30.422 5.479 30.422ZM6.037 23.289H26.512C26.834 23.289 27.070 23.547 27.070 23.826C27.070 24.127 26.834 24.363 26.512 24.363H6.037C5.715 24.363 5.479 24.127 5.479 23.826C5.479 23.547 5.715 23.805 5.479 23.826Z"/></g></svg>`;

/* ---------- música ---------- */
function getYouTubeId(url = "") {
  const match = String(url).match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/
  );

  return match ? match[1] : null;
}

function getMusicUrl(post) {
  const music = post.music;

  if (!music) return "";

  return typeof music === "string" ? music : music.url || "";
}

function getMusicCover(post) {
  const id = getYouTubeId(getMusicUrl(post));

  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/* ---------- badges ---------- */
function createBadge(svg, extraClass = "") {
  const badge = document.createElement("span");

  badge.className = `post-preview-multi ${extraClass}`.trim();
  badge.innerHTML = svg;

  return badge;
}

/* ---------- previews ---------- */
function createImagePreview(source, badge, extraClass = "") {
  const preview = cloneTemplate("postImageTemplate");
  const image = createImage(source, "post-preview-img");

  image.loading = "lazy";

  if (extraClass) {
    image.classList.add(extraClass);
  }

  preview.appendChild(image);

  if (badge) {
    preview.appendChild(badge);
  }

  return preview;
}

function createTextPreview(content = "") {
  const preview = cloneTemplate("postTextTemplate");

  const text =
    content.length > MAX_PREVIEW_TEXT
      ? content.slice(0, MAX_PREVIEW_TEXT) + "…"
      : content;

  preview.querySelector(".post-preview-text").textContent = text;

  return preview;
}

/* ---------- post preview ---------- */

export function createPostPreview(post) {
  const images = getPostImages(post);

  if (images.length) {
    return createImagePreview(
      images[0],
      images.length > 1 ? createBadge(MULTI_IMAGE_ICON) : null
    );
  }

  const cover = getMusicCover(post);

  if (cover) {
    const preview = createImagePreview(
      cover,
      createBadge(MUSIC_ICON, "post-preview-music"),
      "bg-music"
    );

    preview.querySelector("img")?.addEventListener(
      "error",
      () => {
        preview.replaceWith(createTextPreview(post.content));
      },
      { once: true }
    );

    return preview;
  }

  return createTextPreview(post.content);
}