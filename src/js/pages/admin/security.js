import { db } from "/src/config/config.js";
import {
  collection, doc, getDoc, onSnapshot, query, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { api, can, session, ROLE_LABEL } from "./api.js";
import { getPerson } from "./people.js";
import { $, esc, fmtAgo, toast, confirmAction, emptyState, errorState, DEFAULT_PFP } from "./ui.js";
import { openUserSheet } from "./users.js";

const ACTION_LABEL = {
  "user.ban": "baniu",
  "user.unban": "desbaniu",
  "user.verify": "verificou",
  "user.unverify": "removeu o verificado de",
  "user.revokeSessions": "derrubou as sessões de",
  "user.setPhoto": "trocou a foto de perfil de",
  "user.removePhoto": "removeu a foto de perfil de",
  "content.hide": "ocultou um post",
  "content.show": "reexibiu um post",
  "content.delete": "apagou um conteúdo",
  "content.autoHide": "ocultou automaticamente um post denunciado",
  "report.resolved": "resolveu uma denúncia",
  "report.dismissed": "ignorou uma denúncia",
  "admin.setRole": "alterou o cargo de",
  "config.update": "alterou os controles do app",
  "errors.clear": "limpou os erros"
};

let config = {};
let unsubscribeConfig = null;
let unsubscribeAudit = null;

function renderConfig() {
  document.querySelectorAll("[data-config]").forEach(button => {
    const key = button.dataset.config;
    const value = key === "maintenance" ? config.maintenance === true : config[key] !== false;
    button.setAttribute("aria-checked", String(value));
  });

  if (document.activeElement !== $("maintenanceMessage")) {
    $("maintenanceMessage").value = config.maintenanceMessage || "";
  }

  if (document.activeElement !== $("maintenanceTitle")) {
    $("maintenanceTitle").value = config.maintenanceTitle || "";
  }
}

async function toggleConfig(button) {
  const key = button.dataset.config;
  const next = button.getAttribute("aria-checked") !== "true";

  if (key === "maintenance" && next) {
    const { ok } = await confirmAction({
      title: "Ativar modo manutenção?",
      text: "Todos os usuários fora da equipe vão ver a tela de manutenção na hora.",
      confirmLabel: "Ativar"
    });
    if (!ok) return;
  }

  if (key !== "maintenance" && !next) {
    const { ok } = await confirmAction({
      title: key === "signupsEnabled" ? "Pausar novos cadastros?" : "Pausar publicações?",
      text: key === "signupsEnabled" ? "Ninguém consegue criar conta enquanto estiver desligado." : "Ninguém consegue postar enquanto estiver desligado.",
      confirmLabel: "Pausar"
    });
    if (!ok) return;
  }

  button.disabled = true;

  try {
    await api.setConfig({ [key]: next });
    toast("Controle atualizado.");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function renderTeam() {
  try {
    const team = await api.listAdmins();
    const order = { owner: 0, admin: 1, moderator: 2 };

    team.sort((a, b) => order[a.role] - order[b.role]);

    $("adminsList").innerHTML = team.map(member => `
      <div class="team-row" data-uid="${esc(member.uid)}">
        <img class="rank-pfp" src="${esc(member.photo || DEFAULT_PFP)}" alt="">
        <div class="rank-name" data-open-user>${esc(member.name)} ${member.uid === session.uid ? `<span class="status-pill">você</span>` : ""}</div>
        ${can("owner") && member.uid !== session.uid ? `
          <select data-role>
            ${Object.entries(ROLE_LABEL).map(([value, label]) => `<option value="${value}" ${member.role === value ? "selected" : ""}>${label}</option>`).join("")}
            <option value="">Remover</option>
          </select>` : `<span class="status-pill ok">${esc(ROLE_LABEL[member.role])}</span>`}
      </div>`).join("");
  } catch (error) {
    $("adminsList").innerHTML = errorState(error);
  }

  $("addAdmin").hidden = !can("owner");
}

function describe(entry, actorName, targetName) {
  const verb = ACTION_LABEL[entry.action] || entry.action;
  const details = entry.details || {};
  const target = targetName ? ` ${targetName}` : "";
  const extra = [];

  if (entry.action === "admin.setRole") extra.push(details.role ? `→ ${ROLE_LABEL[details.role]}` : "→ removido");
  if (entry.action === "config.update") extra.push(Object.entries(details).map(([key, value]) => `${key}: ${value}`).join(", "));
  if (details.reason) extra.push(`motivo: ${details.reason}`);
  if (details.path) extra.push(details.path);

  return { title: `${actorName} ${verb}${target}`, detail: extra.filter(Boolean).join(" · ") };
}

function watchAudit() {
  unsubscribeAudit?.();

  unsubscribeAudit = onSnapshot(
    query(collection(db, "adminAudit"), orderBy("createdAt", "desc"), limit(60)),
    async snap => {
      if (snap.empty) {
        $("auditList").innerHTML = `<div class="chart-empty">Nenhuma ação registrada ainda</div>`;
        return;
      }

      const rows = await Promise.all(snap.docs.map(async docSnap => {
        const entry = docSnap.data();
        const actor = entry.actorUid === "system" ? { name: "Sistema" } : await getPerson(entry.actorUid);
        const targetUid = entry.details?.uid;
        const target = targetUid ? await getPerson(targetUid) : null;
        const text = describe(entry, actor.name, target?.name);

        return `
          <div class="audit-row">
            <div class="audit-main">
              <div class="audit-action">${esc(text.title)}</div>
              ${text.detail ? `<div class="audit-detail">${esc(text.detail)}</div>` : ""}
            </div>
            <div class="audit-time">${esc(fmtAgo(entry.createdAt))}</div>
          </div>`;
      }));

      $("auditList").innerHTML = rows.join("");
    },
    error => {
      $("auditList").innerHTML = errorState(error);
    }
  );
}

async function addMember() {
  const username = $("addAdminUsername").value.trim().replace(/^@/, "").toLowerCase();
  const role = $("addAdminRole").value;

  if (!username) return toast("Digite o @username.");

  $("addAdminBtn").disabled = true;

  try {
    const snap = await getDoc(doc(db, "usernames", username));
    const uid = snap.exists() ? snap.data().uid : null;

    if (!uid) {
      toast("Username não encontrado.");
      return;
    }

    await api.setRole({ uid, role });
    $("addAdminUsername").value = "";
    toast(`Adicionado como ${ROLE_LABEL[role]}.`);
    renderTeam();
  } catch (error) {
    toast(error.message);
  } finally {
    $("addAdminBtn").disabled = false;
  }
}

document.querySelectorAll("[data-config]").forEach(button =>
  button.addEventListener("click", () => toggleConfig(button)));

$("saveMaintenanceMessage").addEventListener("click", async () => {
  $("saveMaintenanceMessage").disabled = true;

  try {
    await api.setConfig({
      maintenanceTitle: $("maintenanceTitle").value,
      maintenanceMessage: $("maintenanceMessage").value
    });
    toast("Tela de manutenção salva.");
  } catch (error) {
    toast(error.message);
  } finally {
    $("saveMaintenanceMessage").disabled = false;
  }
});

$("addAdminBtn").addEventListener("click", addMember);

$("adminsList").addEventListener("change", async event => {
  const select = event.target.closest("[data-role]");
  const row = event.target.closest("[data-uid]");
  if (!select || !row) return;

  const role = select.value || null;

  if (!role) {
    const { ok } = await confirmAction({ title: "Remover da equipe?", text: "A pessoa perde o acesso ao painel.", confirmLabel: "Remover" });
    if (!ok) {
      renderTeam();
      return;
    }
  }

  try {
    await api.setRole({ uid: row.dataset.uid, role });
    toast(role ? `Cargo alterado para ${ROLE_LABEL[role]}.` : "Removido da equipe.");
  } catch (error) {
    toast(error.message);
  }

  renderTeam();
});

$("adminsList").addEventListener("click", event => {
  if (!event.target.closest("[data-open-user]")) return;
  openUserSheet(event.target.closest("[data-uid]")?.dataset.uid);
});

export function loadSecurity() {
  if (!unsubscribeConfig) {
    unsubscribeConfig = onSnapshot(doc(db, "config", "app"), snap => {
      config = snap.exists() ? snap.data() : {};
      renderConfig();
    }, () => {});
  }

  $("adminsList").innerHTML = `<div class="skeleton" style="height:48px"></div>`;
  renderTeam();
  watchAudit();
}
