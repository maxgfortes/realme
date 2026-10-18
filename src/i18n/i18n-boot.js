(function () {
  var language = "pt";

  try {
    language = localStorage.getItem("realme.lang") || "pt";
  } catch (error) {
    language = "pt";
  }

  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(language) || language === "pt") return;

  document.documentElement.lang = language;

  var style = document.createElement("style");
  style.id = "i18n-pending";
  style.textContent = "body{visibility:hidden}";
  document.head.appendChild(style);

  setTimeout(function () {
    var pending = document.getElementById("i18n-pending");
    if (pending) pending.remove();
  }, 2500);
})();
