import { LANGUAGES, getLanguage, setLanguage, t } from "./i18n.js";

const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function choose(code) {
  if (code !== getLanguage()) setLanguage(code);
}

export function mountLanguageSelect() {
  if (document.querySelector(".lang-select")) return;

  const wrapper = document.createElement("div");
  wrapper.className = "lang-select";

  const select = document.createElement("select");
  select.setAttribute("aria-label", t("language.change"));

  LANGUAGES.forEach(language => {
    const option = new Option(language.name, language.code, false, language.code === getLanguage());
    option.lang = language.locale;
    select.add(option);
  });

  select.addEventListener("change", () => choose(select.value));

  wrapper.appendChild(select);

  const footer = [...document.querySelectorAll("footer")].find(element => element.getClientRects().length);
  const target = footer || document.querySelector("[data-language-slot]");
  if (!target) wrapper.classList.add("floating");
  (target || document.body).appendChild(wrapper);
}

function buildPanelList(list) {
  list.innerHTML = "";

  LANGUAGES.forEach(language => {
    const item = document.createElement("a");
    item.href = "#";
    item.className = "menu-item-link lang-item";
    item.lang = language.locale;
    item.setAttribute("role", "radio");

    const active = language.code === getLanguage();
    item.classList.toggle("active", active);
    item.setAttribute("aria-checked", String(active));

    const name = document.createElement("span");
    name.textContent = language.name;

    const check = document.createElement("span");
    check.className = "lang-item-check";
    check.innerHTML = CHECK;

    item.append(name, check);
    item.addEventListener("click", event => {
      event.preventDefault();
      choose(language.code);
    });

    list.appendChild(item);
  });
}

export function bindLanguageTriggers(root = document) {
  const panel = document.querySelector("[data-language-panel]");
  if (!panel || panel.dataset.languageBound) return;
  panel.dataset.languageBound = "1";

  const list = panel.querySelector("[data-language-list]");
  if (list) buildPanelList(list);

  const parentMenus = () => document.querySelectorAll(".side-menu.active:not([data-language-panel])");

  const close = () => {
    panel.classList.remove("active");
    parentMenus().forEach(menu => menu.classList.remove("behind"));
  };

  panel.querySelectorAll("[data-language-close]").forEach(button => button.addEventListener("click", close));

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && panel.classList.contains("active")) close();
  });

  root.querySelectorAll("[data-language-trigger]").forEach(trigger => {
    trigger.addEventListener("click", event => {
      event.preventDefault();
      parentMenus().forEach(menu => menu.classList.add("behind"));
      panel.classList.add("active");
    });
  });
}
