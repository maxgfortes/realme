export const $ = id => document.getElementById(id);

export const select = selector => document.querySelector(selector);

export function cloneTemplate(id) {
  return $(id).content.firstElementChild.cloneNode(true);
}

export function createImage(source, className = "", alt = "") {
  const image = new Image();
  image.className = className;
  image.alt = alt;
  image.src = source;
  return image;
}

export function setImage(container, source, className = "", alt = "") {
  const current = container.querySelector("img");
  if (current && current.getAttribute("src") === source) return;
  container.replaceChildren(createImage(source, className, alt));
}
