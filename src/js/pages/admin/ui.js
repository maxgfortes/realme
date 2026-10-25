export const $ = id => document.getElementById(id);

export const DEFAULT_PFP = "/public/img/default.jpg";

export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function toast(text) {
  const element = $("toast");
  element.textContent = text;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2600);
}

export function num(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("pt-BR");
}

export function toDate(value) {
  if (!value) return null;
  if (value.toDate) return value.toDate();
  if (typeof value === "number") return new Date(value);
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);

  const date = new Date(value);
  return isNaN(date) ? null : date;
}

export function fmtDate(value) {
  const date = toDate(value);
  if (!date) return "—";
  return date.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function fmtAgo(value) {
  const date = toDate(value);
  if (!date) return "—";

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

  if (seconds < 60) return "agora";
  if (seconds < 3600) return rtf.format(-Math.round(seconds / 60), "minute");
  if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), "hour");
  if (seconds < 86400 * 30) return rtf.format(-Math.round(seconds / 86400), "day");
  return fmtDate(date);
}

export function kpi(label, value, { sub = "", tone = "" } = {}) {
  return `
    <div class="kpi ${tone}">
      <div class="kpi-label">${esc(label)}</div>
      <div class="kpi-value">${esc(value)}</div>
      ${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ""}
    </div>`;
}

export function skeleton(container, count = 3) {
  container.innerHTML = Array.from({ length: count }, () => `<div class="skeleton"></div>`).join("");
}

export function emptyState(title, text = "") {
  return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`;
}

export function errorState(error) {
  return `<div class="inline-error">${esc(error?.message || "Algo deu errado.")}</div>`;
}

export function barChart(container, points, { value = "count", error = null, first = "", last = "" } = {}) {
  if (!points?.length || points.every(point => !point[value])) {
    container.innerHTML = `<div class="chart-empty">Sem dados no período</div>`;
    return;
  }

  const width = 300;
  const height = 120;
  const max = Math.max(...points.map(point => point[value] || 0), 1);
  const step = width / points.length;
  const barWidth = Math.max(step - 2, 1);

  const bars = points.map((point, index) => {
    const total = point[value] || 0;
    const barHeight = Math.max((total / max) * (height - 4), total ? 2 : 0);
    const x = index * step + 1;
    const y = height - barHeight;
    const errorHeight = error && point[error] ? Math.max((point[error] / max) * (height - 4), 2) : 0;

    return `
      <rect class="chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="1.5"><title>${esc(point.label || "")}: ${num(total)}</title></rect>
      ${errorHeight ? `<rect class="chart-bar error" x="${x}" y="${height - errorHeight}" width="${barWidth}" height="${errorHeight}" rx="1.5"></rect>` : ""}`;
  }).join("");

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${bars}</svg>
    <div class="chart-axis"><span>${esc(first)}</span><span>máx ${num(max)}</span><span>${esc(last)}</span></div>`;
}

let confirmResolver = null;

export function confirmAction({ title, text = "", confirmLabel = "Confirmar", hint = "", withReason = false, danger = true }) {
  $("confirmTitle").textContent = title;
  $("delName").textContent = text;
  $("confirmHint").textContent = hint;
  $("confirmHint").hidden = !hint;
  $("confirmReason").hidden = !withReason;
  $("confirmReason").value = "";
  $("delYes").textContent = confirmLabel;
  $("delYes").classList.toggle("danger", danger);
  $("delOv").classList.add("open");

  return new Promise(resolve => {
    confirmResolver = resolve;
  });
}

function closeConfirm(ok) {
  $("delOv").classList.remove("open");
  confirmResolver?.({ ok, reason: $("confirmReason").value.trim() });
  confirmResolver = null;
}

$("delNo").addEventListener("click", () => closeConfirm(false));
$("delYes").addEventListener("click", () => closeConfirm(true));
$("delOv").addEventListener("click", event => {
  if (event.target.id === "delOv") closeConfirm(false);
});

export function userLink(uid, label) {
  return `<a class="inline-link" href="/profile.html?uid=${encodeURIComponent(uid)}" target="_blank" rel="noopener">${esc(label)}</a>`;
}
