import { db } from "/src/config/config.js";
import {
  collection, query, orderBy, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { api } from "./api.js";
import { $, esc, num, fmtAgo, toast, confirmAction, emptyState, errorState, skeleton, toDate } from "./ui.js";

function group(docs) {
  const groups = new Map();

  docs.forEach(docSnap => {
    const data = docSnap.data();
    const key = data.message || "?";
    const entry = groups.get(key) || { message: key, count: 0, users: new Set(), pages: new Set(), last: null, stack: data.stack, source: data.source };

    entry.count += 1;
    if (data.uid) entry.users.add(data.uid);
    if (data.page) entry.pages.add(data.page);

    const at = toDate(data.createdAt);
    if (at && (!entry.last || at > entry.last)) {
      entry.last = at;
      entry.stack = data.stack || entry.stack;
      entry.source = data.source || entry.source;
    }

    groups.set(key, entry);
  });

  return [...groups.values()].sort((a, b) => b.count - a.count || (b.last?.getTime() || 0) - (a.last?.getTime() || 0));
}

export async function loadErrors() {
  skeleton($("errorsList"), 3);

  try {
    const snap = await getDocs(query(collection(db, "clientErrors"), orderBy("createdAt", "desc"), limit(300)));
    const groups = group(snap.docs);

    if (!groups.length) {
      $("errorsList").innerHTML = emptyState("Nenhum erro registrado", "Erros de JavaScript dos usuários aparecem aqui.");
      return;
    }

    $("errorsList").innerHTML = `<div class="card">${groups.map(entry => `
      <div class="error-row">
        <div class="error-message">${esc(entry.message)}</div>
        <div class="error-meta">${num(entry.count)}× · ${num(entry.users.size)} usuário${entry.users.size === 1 ? "" : "s"} · ${esc([...entry.pages].join(", "))} · último ${esc(fmtAgo(entry.last))}</div>
        ${entry.source ? `<div class="error-meta">${esc(entry.source)}</div>` : ""}
        ${entry.stack ? `<details><summary class="error-meta">stack</summary><div class="error-stack">${esc(entry.stack)}</div></details>` : ""}
      </div>`).join("")}</div>`;
  } catch (error) {
    $("errorsList").innerHTML = errorState(error);
  }
}

$("clearErrors").addEventListener("click", async () => {
  const { ok } = await confirmAction({ title: "Limpar erros?", text: "Apaga até 500 registros de erro.", confirmLabel: "Limpar" });
  if (!ok) return;

  try {
    const { deleted } = await api.clearErrors();
    toast(`${num(deleted)} registros apagados.`);
    loadErrors();
  } catch (error) {
    toast(error.message);
  }
});
