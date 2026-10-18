import { DEFAULT_LANGUAGE, LANGUAGES, STORAGE_KEY } from "./languages.js";

function readStoredLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function resolveLanguage(code) {
  return LANGUAGES.some(language => language.code === code) ? code : DEFAULT_LANGUAGE;
}

async function loadMessages(code) {
  try {
    return (await import(`./locales/${code}.js`)).default || {};
  } catch (error) {
    console.error(`[i18n] não foi possível carregar o idioma "${code}"`, error);
    return {};
  }
}

const currentLanguage = resolveLanguage(readStoredLanguage());
const fallbackMessages = await loadMessages(DEFAULT_LANGUAGE);
const messages = currentLanguage === DEFAULT_LANGUAGE ? fallbackMessages : await loadMessages(currentLanguage);
const languageInfo = LANGUAGES.find(language => language.code === currentLanguage);
const pluralRules = new Map();

function pluralFor(code) {
  if (!pluralRules.has(code)) pluralRules.set(code, new Intl.PluralRules(LANGUAGES.find(l => l.code === code)?.locale || code));
  return pluralRules.get(code);
}

function lookup(key) {
  if (Object.prototype.hasOwnProperty.call(messages, key)) return { value: messages[key], code: currentLanguage };
  if (Object.prototype.hasOwnProperty.call(fallbackMessages, key)) return { value: fallbackMessages[key], code: DEFAULT_LANGUAGE };
  return { value: key, code: DEFAULT_LANGUAGE };
}

function interpolate(text, params) {
  return String(text).replace(/\{(\w+)\}/g, (match, name) => (params[name] ?? match));
}

export function t(key, params = {}) {
  const { value, code } = lookup(key);

  if (value && typeof value === "object") {
    const count = Number(params.count ?? 0);
    const form = pluralFor(code).select(count);
    return interpolate(value[form] ?? value.other ?? "", params);
  }

  return interpolate(value, params);
}

export function getLanguage() {
  return currentLanguage;
}

export function getLocale() {
  return languageInfo?.locale || "pt-BR";
}

export function setLanguage(code) {
  const next = resolveLanguage(code);

  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    return;
  }

  if (next !== currentLanguage) location.reload();
}

export function formatDate(date, options) {
  return new Intl.DateTimeFormat(getLocale(), options).format(date);
}

export function formatNumber(value, options) {
  return new Intl.NumberFormat(getLocale(), options).format(value);
}

function normalize(text) {
  return String(text ?? "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

function decode(text) {
  const area = document.createElement("textarea");
  area.innerHTML = text;
  return area.value;
}

function sourceText(key) {
  return normalize(decode(fallbackMessages[key] ?? ""));
}

function eachPair(spec, callback) {
  String(spec || "").split(";").forEach(pair => {
    const index = pair.indexOf(":");
    if (index > 0) callback(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  });
}

export function translateDocument(root = document) {
  document.documentElement.lang = getLocale();

  if (currentLanguage === DEFAULT_LANGUAGE) return;

  root.querySelectorAll("[data-i18n]").forEach(element => {
    const key = element.dataset.i18n;
    if (normalize(element.textContent) === sourceText(key)) element.textContent = decode(t(key));
  });

  root.querySelectorAll("[data-i18n-html]").forEach(element => {
    const key = element.dataset.i18nHtml;
    if (normalize(element.textContent) === sourceText(key)) element.innerHTML = t(key);
  });

  root.querySelectorAll("[data-i18n-nodes]").forEach(element => {
    eachPair(element.dataset.i18nNodes, (index, key) => {
      const node = element.childNodes[Number(index)];
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      if (normalize(node.nodeValue) !== sourceText(key)) return;
      const lead = node.nodeValue.match(/^\s*/)[0];
      const trail = node.nodeValue.match(/\s*$/)[0];
      node.nodeValue = lead + decode(t(key)) + trail;
    });
  });

  root.querySelectorAll("[data-i18n-attr]").forEach(element => {
    eachPair(element.dataset.i18nAttr, (attribute, key) => {
      if (normalize(element.getAttribute(attribute)) === sourceText(key)) element.setAttribute(attribute, decode(t(key)));
    });
  });
}

export { LANGUAGES };
