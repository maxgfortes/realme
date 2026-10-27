export const PROFILE_THEMES = [
  { id: "", label: null, color: null },
  { id: "midnight", label: "Midnight", color: "#0b1026" },
  { id: "sweetie", label: "Sweetie", color: "#ffe6f0" },
  { id: "darkness", label: "Darkness", color: "#000000" },
  { id: "sunset", label: "Sunset", color: "#2a1320" },
  { id: "cute", label: "Cute", color: "#f4eaff" },
  { id: "dark-florest", label: "Dark Florest", color: "#0d1a11" },
  { id: "deep-ocean", label: "Deep Ocean", color: "#03131e" },
  { id: "pure-white", label: "Pure White", color: "#ffffff" },
  { id: "red-velvet", label: "Red Velvet", color: "#1e0407" }
];

const VALID = new Set(PROFILE_THEMES.map(theme => theme.id).filter(Boolean));

let defaultThemeColor = null;

export function isProfileTheme(id) {
  return VALID.has(id);
}

export function applyProfileTheme(id) {
  const root = document.documentElement;
  const meta = document.querySelector('meta[name="theme-color"]');

  if (meta && defaultThemeColor === null) defaultThemeColor = meta.content;

  if (!isProfileTheme(id)) {
    root.removeAttribute("data-profile-theme");
    if (meta && defaultThemeColor) meta.content = defaultThemeColor;
    return;
  }

  root.setAttribute("data-profile-theme", id);

  const theme = PROFILE_THEMES.find(item => item.id === id);
  if (meta && theme?.color) meta.content = theme.color;
}
