import { db } from "/src/config/config.js";
import {
  collection, query, where, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { api } from "./api.js";
import { getPerson } from "./people.js";
import { $, esc, num, fmtAgo, toast, confirmAction, emptyState, errorState, skeleton, toDate } from "./ui.js";
import { openUserSheet } from "./users.js";

const REASON_LABEL = { outro: "Outro", spam: "Spam", ofensivo: "Ofensivo", nudez: "Nudez", violencia: "Violência", golpe: "Golpe" };

let status = "open";
let unsubscribe = null;
let unsubscribeCount = null;
let targets = [];

function isPost(path) {
  return /^(posts\/[^/]+|users\/[^/]+\/wall\/[^/]+)$/.test(path || "");
}

function cardHTML(target) {
  const post = isPost(target.path);
  const reasons = (target.reasons || []).map(reason => REASON_LABEL[reason] || reason).join(", ");
  const open = target.status === "open";

  return `
    <div class="item report-card" data-target="${esc(target.id)}">
      <div class="meta" style="margin-top:0">
        <span class="badge ${open ? "soon" : "off"}">${post ? "Post" : "Evento"}</span>
        <span class="report-count">${num(target.count)} denúncia${target.count === 1 ? "" : "s"}</span>
        ${target.autoHidden ? `<span class="status-pill bad">oculto automaticamente</span>` : ""}
        <span>${esc(fmtAgo(target.lastAt))}</span>
      </div>
      <div class="meta" data-owner="${esc(target.ownerUid || "")}">Autor: carregando…</div>
      ${target.preview ? `<div class="report-preview">${esc(target.preview)}</div>` : ""}
      ${target.image ? `<img class="report-image" src="${esc(target.image)}" alt="" loading="lazy">` : ""}
      ${reasons ? `<div class="meta">Motivos: ${esc(reasons)}</div>` : ""}
      ${!open && target.note ? `<div class="meta">Nota: ${esc(target.note)}</div>` : ""}
      ${open ? `
        <div class="actions wrap">
          ${post ? `<button class="btn warn" data-action="hide">Ocultar</button>` : ""}
          <button class="btn danger" data-action="delete">Apagar</button>
          <button class="btn ghost" data-action="dismiss">Ignorar</button>
          ${target.ownerUid ? `<button class="btn ghost" data-action="author">Ver autor</button>` : ""}
        </div>` : ""}
    </div>`;
}

function fillOwners() {
  $("reportsList").querySelectorAll("[data-owner]").forEach(element => {
    const uid = element.dataset.owner;

    if (!uid) {
      element.textContent = "Autor: desconhecido";
      return;
    }

    getPerson(uid).then(person => {
      if (!element.isConnected) return;
      element.innerHTML = `Autor: <strong>${esc(person.name)}</strong> ${person.username ? `@${esc(person.username)}` : ""} ${person.banned ? `<span class="status-pill bad">banido</span>` : ""}`;
    });
  });
}

function render() {
  if (!targets.length) {
    $("reportsList").innerHTML = emptyState(
      status === "open" ? "Nenhuma denúncia aberta" : "Nada por aqui",
      status === "open" ? "Quando alguém denunciar um post ou evento, aparece aqui." : ""
    );
    return;
  }

  $("reportsList").innerHTML = targets.map(cardHTML).join("");
  fillOwners();
}

function watch() {
  unsubscribe?.();
  skeleton($("reportsList"), 3);

  unsubscribe = onSnapshot(
    query(collection(db, "reportTargets"), where("status", "==", status), limit(100)),
    snap => {
      targets = snap.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => (toDate(b.lastAt)?.getTime() || 0) - (toDate(a.lastAt)?.getTime() || 0));
      render();
    },
    error => {
      $("reportsList").innerHTML = errorState(error);
    }
  );
}

export function watchOpenCount() {
  if (unsubscribeCount) return;

  unsubscribeCount = onSnapshot(
    query(collection(db, "reportTargets"), where("status", "==", "open"), limit(99)),
    snap => {
      $("reportsCount").hidden = snap.size === 0;
      $("reportsCount").textContent = snap.size >= 99 ? "99+" : String(snap.size);
    },
    () => {}
  );
}

async function handleAction(target, action) {
  if (action === "author") {
    openUserSheet(target.ownerUid);
    return;
  }

  if (action === "dismiss") {
    const { ok, reason } = await confirmAction({
      title: "Ignorar denúncia?",
      text: "O conteúdo continua no ar.",
      confirmLabel: "Ignorar",
      withReason: true,
      danger: false
    });
    if (!ok) return;

    await api.resolveReport({ targetId: target.id, status: "dismissed", note: reason });
    toast(target.autoHidden ? "Denúncia ignorada e post reexibido." : "Denúncia ignorada.");
    return;
  }

  const hide = action === "hide";
  const { ok, reason } = await confirmAction({
    title: hide ? "Ocultar este post?" : "Apagar este conteúdo?",
    text: hide ? "Some do feed e do perfil, mas pode ser reexibido." : "Essa ação não pode ser desfeita.",
    confirmLabel: hide ? "Ocultar" : "Apagar",
    withReason: true
  });
  if (!ok) return;

  await api.moderateContent({ path: target.path, action, reason });
  toast(hide ? "Post ocultado." : "Conteúdo apagado.");
}

$("reportsList").addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  const card = event.target.closest("[data-target]");
  if (!button || !card) return;

  const target = targets.find(item => item.id === card.dataset.target);
  if (!target) return;

  button.disabled = true;

  try {
    await handleAction(target, button.dataset.action);
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
});

$("reportsFilter").addEventListener("click", event => {
  const button = event.target.closest("[data-status]");
  if (!button || button.dataset.status === status) return;

  status = button.dataset.status;
  $("reportsFilter").querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
  watch();
});

export function loadReports() {
  if (!unsubscribe) watch();
}
