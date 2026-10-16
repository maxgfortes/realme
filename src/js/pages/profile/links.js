import { $, cloneTemplate } from "./dom.js";
import { capitalize } from "./format.js";
import { networks, linkOrder } from "./socialNetworks.js";

function buildHref(network, value) {
  if (value.startsWith("http")) return value;
  return network ? network.base + value : "https://" + value;
}

function getPosition(key) {
  const position = linkOrder.indexOf(key.toLowerCase());
  return position === -1 ? linkOrder.length : position;
}

function createLinkItem(key, value) {
  const network = networks[key.toLowerCase()];
  const item = cloneTemplate("linkItemTemplate");
  item.href = buildHref(network, value);
  item.querySelector("i").className = network ? network.icon : "fas fa-external-link-alt";
  item.querySelector(".link-title").textContent = network ? network.label : capitalize(key);
  item.querySelector(".link-username").textContent = value;
  return item;
}

export function renderLinks(data) {
  const container = $("linksTab");
  const source = data.links && typeof data.links === "object" ? data.links : data;
  const entries = Object.entries(source)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .sort(([firstKey], [secondKey]) => getPosition(firstKey) - getPosition(secondKey));

  container.replaceChildren();

  if (!entries.length) {
    container.appendChild(cloneTemplate("emptyLinksTemplate"));
    return;
  }

  entries.forEach(([key, value]) => container.appendChild(createLinkItem(key, value.trim())));
}
