import { db } from "/src/config/config.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { api, can, session, ROLE_LABEL } from "./api.js";
import { getPerson, forgetPerson, fullName } from "./people.js";
import { $, esc, num, toast, toDate, fmtDate, fmtAgo, confirmAction, emptyState, errorState, DEFAULT_PFP } from "./ui.js";

const INACTIVE_MS = 30 * 24 * 60 * 60 * 1000;

let users = [];
let filter = "all";
let unsubscribe = null;
let sheetUid = null;

function matchesFilter(user) {
  if (filter === "verified") return user.verified;
  if (filter === "banned") return user.banned;
  if (filter === "inactive") return !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > INACTIVE_MS;
  return true;
}

function filteredUsers() {
  const term = $("userSearch").value.trim().toLowerCase().replace(/^@/, "");

  return users.filter(user =>
    matchesFilter(user) &&
    (!term || user.name.toLowerCase().includes(term) || user.username.toLowerCase().includes(term)));
}

function rowHTML(user) {
  return `
    <div class="user-row" data-uid="${esc(user.id)}">
      <img class="user-pfp" src="${DEFAULT_PFP}" alt="" loading="lazy">
      <div class="user-info">
        <div class="user-name">
          <span>${esc(user.name)}</span>
          ${user.verified ? `<span class="verified-mark" title="Verificado"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ""}
        </div>
        <div class="user-username">@${esc(user.username || "sem-username")}</div>
        <div class="user-badges">
          ${user.banned ? `<span class="status-pill bad">banido</span>` : ""}
          <span class="status-pill">${user.lastActiveAt ? `ativo ${esc(fmtAgo(user.lastActiveAt))}` : `entrou ${esc(fmtAgo(user.joinedAt))}`}</span>
        </div>
      </div>
    </div>`;
}

function renderUsers() {
  const list = filteredUsers();

  $("usersCount").textContent = list.length === users.length
    ? `${num(users.length)} usuários`
    : `${num(list.length)} de ${num(users.length)} usuários`;

  if (!list.length) {
    $("usersList").innerHTML = emptyState("Nenhum usuário", "Nada encontrado para esse filtro.");
    return;
  }

  $("usersList").innerHTML = list.slice(0, 300).map(rowHTML).join("");

  $("usersList").querySelectorAll(".user-row").forEach(row => {
    const image = row.querySelector(".user-pfp");
    getPerson(row.dataset.uid).then(person => {
      if (image.isConnected) image.src = person.photo;
    });
  });
}

export function loadUsers() {
  if (unsubscribe) return;

  $("usersList").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;

  unsubscribe = onSnapshot(collection(db, "users"), snap => {
    users = snap.docs.map(docSnap => {
      const data = docSnap.data();

      return {
        id: docSnap.id,
        name: fullName(data),
        username: data.username || "",
        verified: data.verified === true,
        banned: data.banned === true,
        joinedAt: toDate(data.criadoem || data.createdAt),
        lastActiveAt: toDate(data.lastActiveAt)
      };
    }).sort((a, b) => (b.joinedAt?.getTime() || 0) - (a.joinedAt?.getTime() || 0));

    renderUsers();
    if (sheetUid) refreshSheet();
  }, error => {
    $("usersList").innerHTML = errorState(error);
  });
}

function detailItem(label, value) {
  return `<div class="detail-item"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
}

function sheetHTML(detail) {
  const isSelf = detail.uid === session.uid;
  const roleSelect = can("owner") && !isSelf ? `
    <div class="switch-row">
      <div><strong>Cargo na equipe</strong><span>Dá acesso a este painel.</span></div>
      <select id="sheetRole" class="role-select">
        <option value="">Nenhum</option>
        ${Object.entries(ROLE_LABEL).map(([value, label]) => `<option value="${value}" ${detail.role === value ? "selected" : ""}>${label}</option>`).join("")}
      </select>
    </div>` : "";

  return `
    <div class="detail-head">
      <img src="${esc(detail.photo || DEFAULT_PFP)}" alt="">
      <div style="min-width:0">
        <div class="detail-name">${esc(detail.name)} ${detail.verified ? `<span class="verified-mark"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>` : ""}</div>
        <div class="user-username">@${esc(detail.username || "sem-username")}</div>
        ${detail.role ? `<span class="status-pill ok">${esc(ROLE_LABEL[detail.role])}</span>` : ""}
      </div>
    </div>

    ${detail.banned ? `<div class="detail-banner">Banido ${detail.bannedAt ? esc(fmtAgo(detail.bannedAt)) : ""}${detail.banReason ? ` · ${esc(detail.banReason)}` : ""}</div>` : ""}

    <div class="detail-grid">
      ${detailItem("E-mail", detail.email || "—")}
      ${detailItem("E-mail verificado", detail.emailVerified ? "Sim" : "Não")}
      ${detailItem("Conta criada", fmtDate(detail.createdAt))}
      ${detailItem("Último login", fmtDate(detail.lastSignInAt))}
      ${detailItem("Última atividade", fmtAgo(detail.lastActiveAt))}
      ${detailItem("Login bloqueado", detail.disabled ? "Sim" : "Não")}
      ${detailItem("Posts", num(detail.stats.posts))}
      ${detailItem("Amigos", num(detail.stats.friends))}
      ${detailItem("Conteúdos denunciados", num(detail.stats.reports))}
      ${detailItem("Login via", (detail.providers || []).join(", ") || "—")}
    </div>

    ${roleSelect}

    <div class="actions wrap">
      <a class="btn ghost" style="text-align:center;font-size:inherit" href="/profile.html?uid=${encodeURIComponent(detail.uid)}" target="_blank" rel="noopener">Ver perfil</a>
      <button class="btn ghost" data-sheet="verify">${detail.verified ? "Remover verificado" : "Verificar"}</button>
      ${can("admin") ? `<button class="btn ghost" data-sheet="revoke">Derrubar sessões</button>` : ""}
      ${isSelf ? "" : `<button class="btn ${detail.banned ? "" : "danger"}" data-sheet="ban">${detail.banned ? "Desbanir" : "Banir"}</button>`}
    </div>`;
}

async function refreshSheet() {
  if (!sheetUid) return;

  try {
    const detail = await api.userDetail({ uid: sheetUid });
    if (detail.uid !== sheetUid) return;
    $("userSheetBody").innerHTML = sheetHTML(detail);
    $("userSheetBody").dataset.detail = JSON.stringify({ banned: detail.banned, verified: detail.verified, name: detail.name });
  } catch (error) {
    $("userSheetBody").innerHTML = errorState(error);
  }
}

export function openUserSheet(uid) {
  if (!uid) return;

  sheetUid = uid;
  $("userSheetBody").innerHTML = `<div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:160px"></div>`;
  $("userSheet").classList.add("open");
  refreshSheet();
}

function closeSheet() {
  $("userSheet").classList.remove("open");
  sheetUid = null;
}

$("userSheet").addEventListener("click", event => {
  if (event.target.closest("[data-close-sheet]")) closeSheet();
});

$("userSheetBody").addEventListener("change", async event => {
  if (event.target.id !== "sheetRole") return;

  const role = event.target.value || null;
  event.target.disabled = true;

  try {
    await api.setRole({ uid: sheetUid, role });
    toast(role ? `Cargo alterado para ${ROLE_LABEL[role]}.` : "Removido da equipe.");
    refreshSheet();
  } catch (error) {
    toast(error.message);
    refreshSheet();
  }
});

$("userSheetBody").addEventListener("click", async event => {
  const button = event.target.closest("[data-sheet]");
  if (!button || !sheetUid) return;

  const uid = sheetUid;
  const detail = JSON.parse($("userSheetBody").dataset.detail || "{}");
  const action = button.dataset.sheet;

  button.disabled = true;

  try {
    if (action === "verify") {
      await api.setVerified({ uid, verified: !detail.verified });
      toast(detail.verified ? "Verificado removido." : "Usuário verificado.");
    }

    if (action === "revoke") {
      const { ok } = await confirmAction({
        title: "Derrubar todas as sessões?",
        text: `${detail.name} vai precisar entrar de novo em todos os aparelhos.`,
        confirmLabel: "Derrubar"
      });
      if (!ok) return;
      await api.revokeSessions({ uid });
      toast("Sessões derrubadas.");
    }

    if (action === "ban") {
      const banning = !detail.banned;
      const { ok, reason } = await confirmAction({
        title: banning ? `Banir ${detail.name}?` : `Desbanir ${detail.name}?`,
        text: banning ? "A conta é desconectada e não consegue mais entrar." : "A pessoa volta a conseguir entrar.",
        confirmLabel: banning ? "Banir" : "Desbanir",
        withReason: banning,
        danger: banning
      });
      if (!ok) return;
      await api.banUser({ uid, banned: banning, reason });
      toast(banning ? "Usuário banido." : "Usuário desbanido.");
    }

    forgetPerson(uid);
    refreshSheet();
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("usersList").addEventListener("click", event => {
  const row = event.target.closest(".user-row");
  if (row) openUserSheet(row.dataset.uid);
});

$("usersFilter").addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;

  filter = button.dataset.filter;
  $("usersFilter").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  renderUsers();
});

$("userSearch").addEventListener("input", renderUsers);
