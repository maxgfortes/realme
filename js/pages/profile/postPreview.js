import { cloneTemplate, createImage } from "./dom.js";
import { getPostImages } from "./postImages.js";

const MAX_PREVIEW_TEXT = 80;

function createImagePreview(source) {
  const preview = cloneTemplate("postImageTemplate");
  const image = createImage(source, "post-preview-img");
  image.loading = "lazy";
  preview.appendChild(image);
  return preview;
}

function createTextPreview(content = "") {
  const preview = cloneTemplate("postTextTemplate");
  const text = content.length > MAX_PREVIEW_TEXT ? content.slice(0, MAX_PREVIEW_TEXT) + "…" : content;
  preview.querySelector(".post-preview-text").textContent = text;
  return preview;
}

export function createPostPreview(post) {
  const images = getPostImages(post);
  return images.length ? createImagePreview(images[0]) : createTextPreview(post.content);
}
