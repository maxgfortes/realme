(function () {
  var THEMES = { "default": "#0f0f0f", "skeuomorphism": "#3b5998" };
  var RADII = ["early", "none", "small", "medium", "large"];
  var root = document.documentElement;
  var theme = "default";
  var radius = "medium";

  try {
    theme = localStorage.getItem("realme.theme") || theme;
    radius = localStorage.getItem("realme.radius") || radius;
  } catch (error) {
    theme = "default";
  }

  if (!Object.prototype.hasOwnProperty.call(THEMES, theme)) theme = "default";
  if (RADII.indexOf(radius) === -1) radius = "medium";

  if (theme === "default") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  root.setAttribute("data-radius", radius);

  var meta = document.querySelector('meta[name="theme-color"]');

  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }

  meta.content = THEMES[theme];
})();
