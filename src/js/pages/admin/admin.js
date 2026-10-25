import { auth } from "/src/config/config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { api, can, session, ROLE_LABEL } from "./api.js";
import { $, esc } from "./ui.js";
import { loadOverview } from "./overview.js";
import { loadFunctions } from "./functions.js";
import { loadReports, watchOpenCount } from "./reports.js";
import { loadContent } from "./content.js";
import { loadUsers } from "./users.js";
import { loadMessages } from "./messages.js";
import { loadSecurity } from "./security.js";
import { loadErrors } from "./errors.js";

const TAB_KEY = "realme.adminTab";

const loaders = {
  overview: loadOverview,
  functions: loadFunctions,
  reports: loadReports,
  content: loadContent,
  users: loadUsers,
  messages: loadMessages,
  security: loadSecurity,
  errors: loadErrors
};

const refreshable = new Set(["overview", "functions", "content", "messages", "errors", "security"]);

let activeTab = null;

function allowedTabs() {
  return [...document.querySelectorAll(".admin-tabs .tab")].filter(tab => !tab.dataset.minRole || can(tab.dataset.minRole));
}

function setTab(tab) {
  const allowed = allowedTabs().map(button => button.dataset.tab);
  if (!allowed.includes(tab)) tab = allowed[0];

  activeTab = tab;

  try {
    localStorage.setItem(TAB_KEY, tab);
  } catch {}

  document.querySelectorAll(".admin-tabs .tab").forEach(button => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    if (active) button.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  });

  document.querySelectorAll(".panel").forEach(panel => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });

  $("btnNew").hidden = tab !== "messages";
  $("btnRefresh").hidden = !refreshable.has(tab);

  loaders[tab]?.();
}

function deny(text) {
  $("tabs").hidden = true;
  $("btnNew").hidden = true;
  document.querySelectorAll(".panel").forEach(panel => { panel.hidden = true; });
  $("gate").hidden = false;
  $("gate").innerHTML = `<strong>Acesso restrito</strong>${esc(text)}`;
}

$("tabs").addEventListener("click", event => {
  const tab = event.target.closest(".tab")?.dataset.tab;
  if (tab && tab !== activeTab) setTab(tab);
});

$("btnRefresh").addEventListener("click", () => {
  $("btnRefresh").classList.add("spinning");
  setTimeout(() => $("btnRefresh").classList.remove("spinning"), 450);
  loaders[activeTab]?.(true);
});

onAuthStateChanged(auth, async user => {
  if (!user) return deny("Entre na sua conta para continuar.");

  try {
    const me = await api.whoAmI();

    session.uid = me.uid;
    session.role = me.role;
  } catch {
    return deny("Sua conta não tem permissão de administrador.");
  }

  $("gate").hidden = true;
  $("tabs").hidden = false;
  $("roleBadge").hidden = false;
  $("roleBadge").textContent = ROLE_LABEL[session.role] || session.role;

  document.querySelectorAll(".admin-tabs .tab").forEach(tab => {
    tab.hidden = Boolean(tab.dataset.minRole) && !can(tab.dataset.minRole);
  });

  watchOpenCount();

  let saved = "overview";
  try {
    saved = localStorage.getItem(TAB_KEY) || saved;
  } catch {}

  setTab(saved);
});
