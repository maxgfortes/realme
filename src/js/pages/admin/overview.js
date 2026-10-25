import { api } from "./api.js";
import { $, esc, num, kpi, barChart, fmtAgo, errorState, DEFAULT_PFP } from "./ui.js";

function dayLabel(day) {
  if (!day) return "";
  const [, month, date] = day.split("-");
  return `${date}/${month}`;
}

function sum(points) {
  return (points || []).reduce((total, point) => total + (point.count || 0), 0);
}

function render(data) {
  const { totals, activity, series, topCreators } = data;
  const stickiness = activity.stickiness;

  $("overviewUpdated").textContent = `atualizado ${fmtAgo(data.generatedAt)}`;

  $("kpiActivity").innerHTML = [
    kpi("Ativos hoje (DAU)", num(activity.dau)),
    kpi("Ativos 7 dias (WAU)", num(activity.wau)),
    kpi("Ativos 30 dias (MAU)", num(activity.mau)),
    kpi("Retenção DAU/MAU", stickiness === null ? "—" : `${stickiness}%`, {
      sub: "acima de 20% é saudável",
      tone: stickiness === null ? "" : stickiness >= 20 ? "good" : "bad"
    }),
    kpi("Novos usuários 7d", num(activity.newUsers7)),
    kpi("Posts 24h", num(activity.posts1)),
    kpi("Posts 7d", num(activity.posts7)),
    kpi("Posts por ativo (7d)", activity.postsPerActive ?? "—")
  ].join("");

  const signups = series.signups.map(point => ({ ...point, label: dayLabel(point.day) }));
  const posts = series.posts.map(point => ({ ...point, label: dayLabel(point.day) }));

  barChart($("chartSignups"), signups, {
    first: dayLabel(signups[0]?.day),
    last: `${num(sum(signups))} no período`
  });

  barChart($("chartPosts"), posts, {
    first: dayLabel(posts[0]?.day),
    last: `${num(sum(posts))} no período`
  });

  $("kpiTotals").innerHTML = [
    kpi("Usuários", num(totals.users)),
    kpi("Posts", num(totals.posts)),
    kpi("Comentários", num(totals.comments)),
    kpi("Mensagens", num(totals.messages)),
    kpi("Conversas", num(totals.chats)),
    kpi("Amizades", num(totals.friendships)),
    kpi("Eventos", num(totals.events)),
    kpi("Notas", num(totals.notes)),
    kpi("Spotify conectado", num(totals.spotify)),
    kpi("Denúncias abertas", num(totals.openReports), { tone: totals.openReports ? "bad" : "" }),
    kpi("Banidos", num(totals.bannedUsers))
  ].join("");

  $("topCreators").innerHTML = topCreators.length
    ? topCreators.map((creator, index) => `
        <div class="rank-row">
          <span class="rank-pos">${index + 1}</span>
          <img class="rank-pfp" src="${esc(creator.photo || DEFAULT_PFP)}" alt="" loading="lazy">
          <a class="rank-name" href="/profile.html?uid=${encodeURIComponent(creator.uid)}" target="_blank" rel="noopener">${esc(creator.name)}</a>
          <span class="rank-value">${num(creator.posts)} posts</span>
        </div>`).join("")
    : `<div class="chart-empty">Ninguém postou nos últimos 7 dias</div>`;
}

export async function loadOverview(force = false) {
  if (!$("kpiActivity").innerHTML) {
    $("kpiActivity").innerHTML = Array.from({ length: 4 }, () => `<div class="kpi"><div class="skeleton" style="height:42px;margin:0"></div></div>`).join("");
  }

  try {
    render(await api.overview({ force }));
  } catch (error) {
    $("kpiActivity").innerHTML = errorState(error);
  }
}
