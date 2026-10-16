import { select, cloneTemplate } from "./dom.js";

export function showProfileNotFound() {
  select(".full-profile-container").replaceChildren(cloneTemplate("profileNotFoundTemplate"));
}
