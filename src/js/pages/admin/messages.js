import { db } from "/src/config/config.js";
import {
  collection, getDocs, addDoc, setDoc, deleteDoc, doc, query, orderBy, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { $, esc, toast, confirmAction, emptyState, errorState } from "./ui.js";

let messages = [];
let editingId = null;
let loaded = false;

function pad(n) {
  return String(n).padStart(2, "0");
}

function toInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fmt(date) {
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function getStatus(message) {
  const now = new Date();
  if (now < message.startAt) return { label: "Agendada", cls: "soon" };
  if (now > message.endAt) return { label: "Expirada", cls: "off" };
  return { label: "No ar", cls: "on" };
}

function renderList() {
  if (!messages.length) {
    $("list").innerHTML = emptyState("Nenhuma mensagem", "Toque em “Nova mensagem” para criar a primeira.");
    return;
  }

  $("list").innerHTML = messages.map(message => {
    const status = getStatus(message);
    const icon = message.icon
      ? `<img class="thumb" src="${esc(message.icon)}" alt="">`
      : `<div class="thumb"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></div>`;

    return `
      <div class="item">
        <div class="item-top">
          ${icon}
          <div>
            <h3>${esc(message.title)}</h3>
            <p>${esc(message.body)}</p>
          </div>
        </div>
        <div class="meta">
          <span class="badge ${status.cls}">${status.label}</span>
          <span>${fmt(message.startAt)} → ${fmt(message.endAt)}</span>
          ${message.buttonText ? `<span>Botão: ${esc(message.buttonText)}</span>` : ""}
        </div>
        <div class="actions">
          <button class="btn ghost" data-edit="${esc(message.id)}">Editar</button>
          <button class="btn ghost" data-del="${esc(message.id)}">Apagar</button>
        </div>
      </div>`;
  }).join("");
}

async function fetchMessages() {
  try {
    const snap = await getDocs(query(collection(db, "serverMessages"), orderBy("startAt", "desc")));

    messages = snap.docs.map(docSnap => {
      const data = docSnap.data();
      return { ...data, id: docSnap.id, startAt: data.startAt.toDate(), endAt: data.endAt.toDate() };
    });

    renderList();
  } catch (error) {
    $("list").innerHTML = errorState(error);
  }
}

function renderPreview() {
  const title = $("fTitle").value.trim();
  const body = $("fBody").value.trim();
  const icon = $("fIcon").value.trim();
  const button = $("fBtn").value.trim();

  $("count").textContent = `${$("fBody").value.length} / 400`;

  if (!title && !body) {
    $("preview").innerHTML = `<div class="pv-empty">Preencha título e texto para ver como fica.</div>`;
    return;
  }

  $("preview").innerHTML = `
    <div class="serverMessageArea">
      <button class="closeMessage" type="button">×</button>
      ${icon ? `<div class="messageIconArea"><img src="${esc(icon)}" alt=""></div>` : ""}
      <div class="textMessageArea">
        <div class="messageTitle">${esc(title)}</div>
        <div class="messageBody">${esc(body)}</div>
      </div>
      ${button ? `<div class="messageAction"><button class="messageBtn" type="button">${esc(button)}</button></div>` : ""}
    </div>`;
}

function openEditor(message) {
  editingId = message ? message.id : null;

  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  $("editorTitle").textContent = message ? "Editar mensagem" : "Nova mensagem";
  $("editHint").hidden = !message;
  $("fTitle").value = message ? message.title : "";
  $("fBody").value = message ? message.body : "";
  $("fIcon").value = message?.icon || "";
  $("fBtn").value = message?.buttonText || "";
  $("fStart").value = toInput(message ? message.startAt : now);
  $("fEnd").value = toInput(message ? message.endAt : nextWeek);

  renderPreview();
  $("editor").classList.add("open");
  $("editor").querySelector(".editor-body").scrollTop = 0;
}

function closeEditor() {
  $("editor").classList.remove("open");
}

["fTitle", "fBody", "fIcon", "fBtn"].forEach(id => $(id).addEventListener("input", renderPreview));
$("btnNew").addEventListener("click", () => openEditor(null));
$("btnCancel").addEventListener("click", closeEditor);

$("list").addEventListener("click", async event => {
  const editId = event.target.dataset.edit;
  const deleteId = event.target.dataset.del;

  if (editId) openEditor(messages.find(message => message.id === editId));

  if (deleteId) {
    const message = messages.find(item => item.id === deleteId);
    const { ok } = await confirmAction({
      title: "Apagar mensagem?",
      text: message?.title || "",
      hint: "Essa ação não pode ser desfeita.",
      confirmLabel: "Apagar"
    });
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "serverMessages", deleteId));
      toast("Mensagem apagada.");
      await fetchMessages();
    } catch (error) {
      console.error(error);
      toast("Erro ao apagar.");
    }
  }
});

$("form").addEventListener("submit", async event => {
  event.preventDefault();

  const title = $("fTitle").value.trim();
  const body = $("fBody").value.trim();
  const icon = $("fIcon").value.trim();
  const buttonText = $("fBtn").value.trim();
  const start = new Date($("fStart").value);
  const end = new Date($("fEnd").value);

  if (!title || !body) return toast("Preencha título e texto.");
  if (isNaN(start) || isNaN(end)) return toast("Defina início e fim.");
  if (end <= start) return toast("O fim precisa ser depois do início.");

  const data = { title, body, startAt: Timestamp.fromDate(start), endAt: Timestamp.fromDate(end) };
  if (icon) data.icon = icon;
  if (buttonText) data.buttonText = buttonText;

  $("btnSave").disabled = true;

  try {
    if (editingId) await setDoc(doc(db, "serverMessages", editingId), data);
    else await addDoc(collection(db, "serverMessages"), data);

    closeEditor();
    toast(editingId ? "Mensagem atualizada." : "Mensagem criada.");
    await fetchMessages();
  } catch (error) {
    console.error(error);
    toast("Erro ao salvar. Verifique as regras.");
  }

  $("btnSave").disabled = false;
});

export function loadMessages(force = false) {
  if (loaded && !force) return;
  loaded = true;
  $("list").innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
  fetchMessages();
}
