import { api } from "./api.js";
import { $, esc, num, kpi, barChart, fmtAgo, errorState } from "./ui.js";

function hourLabel(hour) {
  if (!hour) return "";
  const date = new Date(`${hour}:00:00Z`);
  return isNaN(date) ? "" : date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function latencyTone(ms) {
  if (ms === null || ms === undefined) return "";
  if (ms >= 3000) return "bad";
  if (ms >= 1000) return "warn";
  return "";
}

function render(data) {
  const { totals, services, hourly } = data;

  $("functionsUpdated").textContent = `atualizado ${fmtAgo(data.generatedAt)}`;

  const slowest = services.reduce((worst, item) => (item.p95Ms || 0) > (worst?.p95Ms || 0) ? item : worst, null);

  $("kpiFunctions").innerHTML = [
    kpi("Chamadas", num(totals.calls)),
    kpi("Erros (5xx)", num(totals.errors), { tone: totals.errors ? "bad" : "good" }),
    kpi("Taxa de erro", `${totals.errorRate}%`, { tone: totals.errorRate >= 1 ? "bad" : "good" }),
    kpi("Mais lenta (p95)", slowest?.p95Ms ? `${num(slowest.p95Ms)} ms` : "—", { sub: slowest?.name || "" })
  ].join("");

  const points = hourly.map(point => ({ ...point, count: point.calls, label: hourLabel(point.hour) }));

  barChart($("chartFunctions"), points, {
    error: "errors",
    first: points[0]?.label || "",
    last: points.at(-1)?.label || ""
  });

  $("functionsTable").innerHTML = services.length
    ? `<div class="fn-row head"><span>Função</span><span class="fn-num">Chamadas</span><span class="fn-num">Erros</span><span class="fn-num">p95</span></div>` +
      services.map(item => {
        const errorRate = item.calls ? (item.errors / item.calls) * 100 : 0;

        return `
          <div class="fn-row">
            <span class="fn-name" title="${esc(item.name)}">${esc(item.name)}</span>
            <span class="fn-num">${num(item.calls)}</span>
            <span class="fn-num ${item.errors ? (errorRate >= 5 ? "bad" : "warn") : ""}">${num(item.errors)}</span>
            <span class="fn-num ${latencyTone(item.p95Ms)}">${item.p95Ms === null ? "—" : `${num(item.p95Ms)}ms`}</span>
          </div>`;
      }).join("")
    : `<div class="chart-empty">Nenhuma chamada nas últimas 24h</div>`;
}

export async function loadFunctions(force = false) {
  if (!$("kpiFunctions").innerHTML) {
    $("kpiFunctions").innerHTML = Array.from({ length: 4 }, () => `<div class="kpi"><div class="skeleton" style="height:42px;margin:0"></div></div>`).join("");
  }

  try {
    render(await api.functionMetrics({ force }));
  } catch (error) {
    $("kpiFunctions").innerHTML = errorState(error);
    $("functionsTable").innerHTML = "";
    $("chartFunctions").innerHTML = "";
  }
}
