export const THEMES = [
  { id: "default", name: "Padrão", description: "Escuro, o visual atual do RealMe", color: "#0f0f0f", swatches: ["#0f0f0f", "#272727", "#4a59e2"] },
  { id: "skeuomorphism", name: "Facebook 2012", description: "Skeuomorphism clássico, claro e em relevo", color: "#3b5998", swatches: ["#e9ebee", "#ffffff", "#3b5998"] }
];

export const RADII = [
  { id: "early", name: "2px" },
  { id: "none", name: "Nenhuma" },
  { id: "small", name: "Pequena" },
  { id: "medium", name: "Média" },
  { id: "large", name: "Grande" }
];

const THEME_KEY = "realme.theme";
const RADIUS_KEY = "realme.radius";
const listeners = new Set();
const root = document.documentElement;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

function validTheme(id) {
  return THEMES.some(theme => theme.id === id) ? id : "default";
}

function validRadius(id) {
  return RADII.some(radius => radius.id === id) ? id : "medium";
}

export function getTheme() {
  return validTheme(read(THEME_KEY));
}

export function getRadius() {
  return validRadius(read(RADIUS_KEY));
}

function applyTheme(id) {
  const theme = THEMES.find(item => item.id === id) || THEMES[0];

  if (theme.id === "default") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme.id);

  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.content = theme.color;
  });
}

function applyRadius(id) {
  root.setAttribute("data-radius", id);
}

function notify() {
  const state = { theme: getTheme(), radius: getRadius() };
  listeners.forEach(listener => listener(state));
}

export function setTheme(id) {
  const theme = validTheme(id);

  write(THEME_KEY, theme);
  applyTheme(theme);
  notify();
}

export function setRadius(id) {
  const radius = validRadius(id);

  write(RADIUS_KEY, radius);
  applyRadius(radius);
  notify();
}

export function onThemeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

window.addEventListener("storage", event => {
  if (event.key === THEME_KEY) applyTheme(getTheme());
  if (event.key === RADIUS_KEY) applyRadius(getRadius());
  if (event.key === THEME_KEY || event.key === RADIUS_KEY) notify();
});

applyTheme(getTheme());
applyRadius(getRadius());
