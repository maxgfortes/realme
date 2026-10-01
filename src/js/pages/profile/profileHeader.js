import { $, select, setImage } from "./dom.js";
import { getDisplayName } from "./format.js";
import { DEFAULT_PHOTO } from "./constants.js";

export function renderUsername(user) {
  $("headernameText").textContent = user.username || "";
}

export function renderName(user) {
  const name = getDisplayName(user);
  $("displayname").textContent = name;
  $("viewMoreDisplayname").textContent = name;
  select(".input-send-wall").textContent = `Escreva para ${name}...`;
}

export function renderVerified(user) {
  select(".verificado").classList.toggle("active", Boolean(user.verified));
}

export function renderPronouns(about) {
  const pronouns = [about.pronom1, about.pronom2].filter(Boolean);
  select(".pronom").textContent = pronouns.join("/");
}

export function renderPfp(media) {
  const photo = media.pfp || media.userphoto || DEFAULT_PHOTO;
  const border = select(".pfp-border");
  setImage(border, photo, "profile-pic", "Foto de perfil");
  border.style.backgroundImage = `url(${photo})`;
}

export function renderBanner(media) {
  const banner = media.banner || media.headerphoto;
  select(".pf-banner-area").classList.toggle("hidden", !banner);
  if (banner) setImage(select(".profile-banner"), banner, "", "Banner");
}

export function renderBio(moreInfos) {
  $("bio").textContent = moreInfos.bio || "";
}
