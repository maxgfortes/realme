import { getTheme, getRadius, setTheme, setRadius, onThemeChange } from "/src/shared/theme.js";

const EARLY_THEME = "skeuomorphism";
const EARLY_RADIUS = "early";

const toggle = document.getElementById("early2012Toggle");

function render({ theme }) {
  const active = theme === EARLY_THEME;

  toggle?.classList.toggle("active", active);
  toggle?.setAttribute("aria-checked", String(active));
}

function toggleEarly2012(event) {
  event.preventDefault();

  if (getTheme() === EARLY_THEME) {
    setTheme("default");
    if (getRadius() === EARLY_RADIUS) setRadius("medium");
    return;
  }

  setTheme(EARLY_THEME);
  setRadius(EARLY_RADIUS);
}

if (toggle) {
  toggle.addEventListener("click", toggleEarly2012);
  onThemeChange(render);
  render({ theme: getTheme() });
}
