import { api } from "./api.js";
import { $, esc, num, kpi, fmtAgo, errorState, DEFAULT_PFP } from "./ui.js";

const TYPES = {
  friend: { label: "Amizade", color: "#5c6aeb", weight: 3, text: () => "amigos" },
  dm: { label: "Mensagens", color: "#3d8bfd", weight: 2.5, text: n => `${num(n)} ${n === 1 ? "mensagem" : "mensagens"}` },
  comment: { label: "Comentários", color: "#f5a623", weight: 1.6, text: n => `${num(n)} ${n === 1 ? "comentário" : "comentários"}` },
  mention: { label: "Menções", color: "#a78bfa", weight: 1.4, text: n => `${num(n)} ${n === 1 ? "menção" : "menções"}` },
  wall: { label: "Mural", color: "#4cd964", weight: 1.4, text: n => `${num(n)} no mural` },
  event: { label: "Eventos", color: "#f5d04a", weight: 1.2, text: n => `${num(n)} ${n === 1 ? "evento junto" : "eventos juntos"}` },
  like: { label: "Curtidas", color: "#ff3040", weight: 1, text: n => `${num(n)} ${n === 1 ? "curtida" : "curtidas"}` }
};

const COMMUNITY_COLORS = ["#5c6aeb", "#3d8bfd", "#ff3040", "#4cd964", "#f5a623", "#a78bfa", "#f5d04a", "#2ec4b6", "#ff7a59", "#8e8e93"];

const graph = {
  raw: null,
  nodes: [],
  edges: [],
  byId: new Map(),
  enabled: new Set(Object.keys(TYPES)),
  minStrength: 0,
  showLabels: false,
  showIsolated: false,
  selected: null,
  hovered: null,
  alpha: 0,
  frame: null,
  view: { x: 0, y: 0, k: 1 },
  images: new Map(),
  bound: false
};

let canvas;
let ctx;
let stage;
let tooltip;

function strengthOf(counts) {
  let total = 0;
  for (const [type, count] of Object.entries(counts)) {
    if (!graph.enabled.has(type) || !count) continue;
    total += TYPES[type].weight * Math.log2(1 + count);
  }
  return total;
}

function dominantType(counts) {
  let best = null;
  let bestValue = 0;
  for (const [type, count] of Object.entries(counts)) {
    if (!graph.enabled.has(type) || !count) continue;
    const value = TYPES[type].weight * Math.log2(1 + count);
    if (value > bestValue) {
      best = type;
      bestValue = value;
    }
  }
  return best;
}

function breakdown(counts) {
  return Object.keys(TYPES)
    .filter(type => counts[type])
    .map(type => `<span class="graph-chip" style="--chip:${TYPES[type].color}">${esc(TYPES[type].text(counts[type]))}</span>`)
    .join("");
}

function loadImage(node) {
  if (!/^https:\/\//.test(node.photo || "") || graph.images.has(node.id)) return;
  const image = new Image();
  image.referrerPolicy = "no-referrer";
  image.onload = () => draw();
  image.src = node.photo;
  graph.images.set(node.id, image);
}

function detectCommunities(nodes, edges) {
  const label = new Map(nodes.map(node => [node.id, node.id]));
  const neighbors = new Map(nodes.map(node => [node.id, []]));

  edges.forEach(edge => {
    neighbors.get(edge.source.id).push([edge.target.id, edge.strength]);
    neighbors.get(edge.target.id).push([edge.source.id, edge.strength]);
  });

  for (let round = 0; round < 12; round++) {
    let changed = false;
    const order = [...nodes].sort(() => Math.random() - 0.5);

    order.forEach(node => {
      const scores = new Map();
      neighbors.get(node.id).forEach(([id, weight]) => {
        const key = label.get(id);
        scores.set(key, (scores.get(key) || 0) + weight);
      });

      let best = label.get(node.id);
      let bestScore = scores.get(best) || 0;
      scores.forEach((score, key) => {
        if (score > bestScore) {
          best = key;
          bestScore = score;
        }
      });

      if (best !== label.get(node.id)) {
        label.set(node.id, best);
        changed = true;
      }
    });

    if (!changed) break;
  }

  const sizes = new Map();
  label.forEach(value => sizes.set(value, (sizes.get(value) || 0) + 1));
  const ranking = [...sizes.entries()].filter(([, size]) => size > 1).sort((a, b) => b[1] - a[1]);
  const colorOf = new Map(ranking.map(([key], index) => [key, COMMUNITY_COLORS[index % COMMUNITY_COLORS.length]]));

  nodes.forEach(node => {
    node.color = colorOf.get(label.get(node.id)) || "#5b6170";
  });

  return ranking.length;
}

function rebuild({ keepPositions = true } = {}) {
  const previous = new Map(graph.nodes.map(node => [node.id, node]));
  const nodes = graph.raw.nodes.map(card => {
    const old = keepPositions ? previous.get(card.uid) : null;
    return {
      id: card.uid,
      name: card.name,
      username: card.username,
      photo: card.photo,
      verified: card.verified,
      banned: card.banned,
      x: old?.x ?? (Math.random() - 0.5) * 600,
      y: old?.y ?? (Math.random() - 0.5) * 600,
      vx: 0,
      vy: 0,
      degree: 0,
      strength: 0,
      fixed: false
    };
  });

  const byId = new Map(nodes.map(node => [node.id, node]));

  let edges = graph.raw.edges
    .map(edge => ({
      source: byId.get(edge.source),
      target: byId.get(edge.target),
      counts: edge.counts,
      strength: strengthOf(edge.counts)
    }))
    .filter(edge => edge.source && edge.target && edge.strength > 0);

  const max = edges.reduce((value, edge) => Math.max(value, edge.strength), 0) || 1;
  edges.forEach(edge => {
    edge.norm = edge.strength / max;
    edge.type = dominantType(edge.counts);
  });

  edges = edges.filter(edge => edge.norm * 100 >= graph.minStrength);

  edges.forEach(edge => {
    edge.source.degree++;
    edge.target.degree++;
    edge.source.strength += edge.strength;
    edge.target.strength += edge.strength;
  });

  graph.nodes = graph.showIsolated ? nodes : nodes.filter(node => node.degree > 0);
  graph.byId = new Map(graph.nodes.map(node => [node.id, node]));
  graph.edges = edges;

  const maxNode = graph.nodes.reduce((value, node) => Math.max(value, node.strength), 0) || 1;
  graph.nodes.forEach(node => {
    node.r = 5 + 13 * Math.sqrt(node.strength / maxNode);
    loadImage(node);
  });

  const communities = detectCommunities(graph.nodes, graph.edges);

  if (graph.selected && !graph.byId.has(graph.selected.id)) graph.selected = null;
  else if (graph.selected) graph.selected = graph.byId.get(graph.selected.id);

  renderStats(communities);
  renderTop();
  renderDetail();
  reheat(keepPositions ? 0.5 : 1);
}

function reheat(value = 0.6) {
  graph.alpha = Math.max(graph.alpha, value);
  if (!graph.frame) graph.frame = requestAnimationFrame(tick);
}

function step() {
  const nodes = graph.nodes;
  const count = nodes.length;
  const alpha = graph.alpha;
  const repulsion = 4200;

  for (let i = 0; i < count; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < count; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distance2 = dx * dx + dy * dy;
      if (distance2 < 0.01) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        distance2 = dx * dx + dy * dy;
      }
      if (distance2 > 360000) continue;
      const force = (repulsion * alpha) / distance2;
      const distance = Math.sqrt(distance2);
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  graph.edges.forEach(edge => {
    const a = edge.source;
    const b = edge.target;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = 36 + 230 * (1 - edge.norm) + a.r + b.r;
    const stiffness = (0.004 + 0.14 * Math.pow(edge.norm, 1.5)) * alpha;
    const pull = (distance - rest) * stiffness;
    const fx = (dx / distance) * pull;
    const fy = (dy / distance) * pull;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  });

  nodes.forEach(node => {
    node.vx -= node.x * 0.004 * alpha;
    node.vy -= node.y * 0.004 * alpha;

    if (node.fixed) {
      node.vx = 0;
      node.vy = 0;
      return;
    }

    node.vx *= 0.82;
    node.vy *= 0.82;
    node.x += Math.max(-40, Math.min(40, node.vx));
    node.y += Math.max(-40, Math.min(40, node.vy));
  });

  graph.alpha *= 0.99;
}

function tick() {
  graph.frame = null;
  if (!canvas?.isConnected || $("panel-graph").hidden) return;

  const steps = graph.nodes.length > 300 ? 1 : 2;
  for (let i = 0; i < steps && graph.alpha > 0.004; i++) step();
  draw();

  if (graph.alpha > 0.004) graph.frame = requestAnimationFrame(tick);
}

function resize() {
  if (!canvas) return;
  const rect = stage.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  draw();
}

function neighborsOf(node) {
  const set = new Set();
  if (!node) return set;
  graph.edges.forEach(edge => {
    if (edge.source === node) set.add(edge.target);
    if (edge.target === node) set.add(edge.source);
  });
  return set;
}

function draw() {
  if (!ctx) return;

  const ratio = window.devicePixelRatio || 1;
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  const { x, y, k } = graph.view;
  const focus = graph.selected || graph.hovered;
  const near = neighborsOf(focus);

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + x, height / 2 + y);
  ctx.scale(k, k);

  const sorted = [...graph.edges].sort((a, b) => a.norm - b.norm);

  sorted.forEach(edge => {
    const linked = focus && (edge.source === focus || edge.target === focus);
    const dim = focus && !linked;
    ctx.beginPath();
    ctx.moveTo(edge.source.x, edge.source.y);
    ctx.lineTo(edge.target.x, edge.target.y);
    ctx.strokeStyle = TYPES[edge.type]?.color || "#8fa3bf";
    ctx.globalAlpha = dim ? 0.05 : linked ? 0.95 : 0.12 + 0.7 * edge.norm;
    ctx.lineWidth = (0.6 + 6.5 * Math.pow(edge.norm, 0.8)) / Math.sqrt(k);
    ctx.stroke();
  });

  ctx.globalAlpha = 1;

  graph.nodes.forEach(node => {
    const dim = focus && node !== focus && !near.has(node);
    const image = graph.images.get(node.id);
    const usePhoto = image?.complete && image.naturalWidth && node.r * k > 8;

    ctx.globalAlpha = dim ? 0.18 : 1;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);

    if (usePhoto) {
      ctx.save();
      ctx.clip();
      ctx.drawImage(image, node.x - node.r, node.y - node.r, node.r * 2, node.r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = node.color;
      ctx.fill();
    }

    ctx.lineWidth = (node === focus ? 3 : 1.5) / k;
    ctx.strokeStyle = node === graph.selected ? "#ffffff" : node.banned ? "#ff3040" : node.color;
    ctx.stroke();

    const showLabel = graph.showLabels || node === focus || near.has(node) || k > 1.6 && node.r * k > 10;
    if (showLabel && !dim) {
      ctx.font = `${12 / k}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(node.name, node.x, node.y + node.r + 13 / k);
    }
  });

  ctx.restore();
  ctx.globalAlpha = 1;
}

function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const { x, y, k } = graph.view;
  return {
    x: (clientX - rect.left - rect.width / 2 - x) / k,
    y: (clientY - rect.top - rect.height / 2 - y) / k
  };
}

function hitTest(clientX, clientY) {
  const point = toWorld(clientX, clientY);
  let found = null;
  let best = Infinity;
  graph.nodes.forEach(node => {
    const distance = Math.hypot(node.x - point.x, node.y - point.y);
    const reach = node.r + 6 / graph.view.k;
    if (distance < reach && distance < best) {
      found = node;
      best = distance;
    }
  });
  return found;
}

function zoomAt(clientX, clientY, factor) {
  const rect = canvas.getBoundingClientRect();
  const view = graph.view;
  const next = Math.max(0.15, Math.min(6, view.k * factor));
  const px = clientX - rect.left - rect.width / 2;
  const py = clientY - rect.top - rect.height / 2;
  view.x = px - ((px - view.x) * next) / view.k;
  view.y = py - ((py - view.y) * next) / view.k;
  view.k = next;
  draw();
}

function fitView() {
  if (!graph.nodes.length || !stage) return;
  const rect = stage.getBoundingClientRect();
  const xs = graph.nodes.map(node => node.x);
  const ys = graph.nodes.map(node => node.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.max(0.15, Math.min(2.5, Math.min(rect.width / (maxX - minX + 120), rect.height / (maxY - minY + 120))));
  graph.view = { k, x: -((minX + maxX) / 2) * k, y: -((minY + maxY) / 2) * k };
  draw();
}

function centerOn(node) {
  const k = Math.max(graph.view.k, 1.2);
  graph.view = { k, x: -node.x * k, y: -node.y * k };
  draw();
}

function select(node, { center = false } = {}) {
  graph.selected = node;
  if (node && center) centerOn(node);
  renderDetail();
  draw();
}

function showTooltip(node, clientX, clientY) {
  if (!node) {
    tooltip.hidden = true;
    return;
  }
  const rect = stage.getBoundingClientRect();
  tooltip.innerHTML = `<strong>${esc(node.name)}</strong>${node.username ? `<span>@${esc(node.username)}</span>` : ""}<span>${num(node.degree)} ${node.degree === 1 ? "conexão" : "conexões"}</span>`;
  tooltip.style.left = `${Math.min(rect.width - 180, clientX - rect.left + 14)}px`;
  tooltip.style.top = `${clientY - rect.top + 14}px`;
  tooltip.hidden = false;
}

function bindPointer() {
  const pointers = new Map();
  let drag = null;
  let pinch = null;

  canvas.addEventListener("pointerdown", event => {
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), k: graph.view.k };
      if (drag?.node) drag.node.fixed = false;
      drag = null;
      return;
    }

    const node = hitTest(event.clientX, event.clientY);
    drag = { node, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false };
    if (node) node.fixed = true;
  });

  canvas.addEventListener("pointermove", event => {
    if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const centerX = (a.x + b.x) / 2;
      const centerY = (a.y + b.y) / 2;
      zoomAt(centerX, centerY, (pinch.k * (distance / pinch.distance)) / graph.view.k);
      return;
    }

    if (!drag) {
      const node = hitTest(event.clientX, event.clientY);
      if (node !== graph.hovered) {
        graph.hovered = node;
        canvas.style.cursor = node ? "pointer" : "grab";
        draw();
      }
      showTooltip(node, event.clientX, event.clientY);
      return;
    }

    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;

    if (drag.node) {
      const point = toWorld(event.clientX, event.clientY);
      drag.node.x = point.x;
      drag.node.y = point.y;
      reheat(0.25);
    } else {
      graph.view.x += event.clientX - drag.lastX;
      graph.view.y += event.clientY - drag.lastY;
      draw();
    }

    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    tooltip.hidden = true;
  });

  const end = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;

    if (drag.node) drag.node.fixed = false;
    if (!drag.moved) select(drag.node);
    drag = null;
  };

  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => {
    if (graph.hovered) {
      graph.hovered = null;
      draw();
    }
    tooltip.hidden = true;
  });

  canvas.addEventListener("wheel", event => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * 0.0015));
  }, { passive: false });
}

function renderStats(communities) {
  const total = graph.raw.nodes.length;
  const connected = graph.nodes.filter(node => node.degree > 0).length;
  const average = connected ? (graph.edges.length * 2) / connected : 0;

  $("graphStats").innerHTML = [
    kpi("Pessoas conectadas", num(connected), { sub: `de ${num(total)} usuários` }),
    kpi("Conexões", num(graph.edges.length)),
    kpi("Comunidades", num(communities)),
    kpi("Média por pessoa", average ? average.toFixed(1).replace(".", ",") : " ")
  ].join("");
}

function renderTop() {
  const top = [...graph.edges].sort((a, b) => b.strength - a.strength).slice(0, 10);

  $("graphTop").innerHTML = top.length
    ? top.map(edge => `
        <button type="button" class="graph-top-row" data-uid="${esc(edge.source.id)}">
          <div class="graph-top-names">${esc(edge.source.name)} <span>↔</span> ${esc(edge.target.name)}</div>
          <div class="graph-top-bar"><i style="width:${Math.max(4, Math.round(edge.norm * 100))}%;background:${TYPES[edge.type]?.color || "#8fa3bf"}"></i></div>
          <div class="graph-chips">${breakdown(edge.counts)}</div>
        </button>`).join("")
    : `<div class="empty">Nenhuma conexão com esses filtros.</div>`;
}

function renderDetail() {
  const box = $("graphDetail");
  const node = graph.selected;

  if (!node) {
    box.hidden = true;
    return;
  }

  const links = graph.edges
    .filter(edge => edge.source === node || edge.target === node)
    .map(edge => ({ other: edge.source === node ? edge.target : edge.source, edge }))
    .sort((a, b) => b.edge.strength - a.edge.strength);

  box.hidden = false;
  box.innerHTML = `
    <div class="graph-detail-head">
      <img src="${esc(/^https:\/\//.test(node.photo || "") ? node.photo : DEFAULT_PFP)}" alt="">
      <div>
        <div class="graph-detail-name">${esc(node.name)}${node.verified ? ' <span class="graph-badge">verificado</span>' : ""}${node.banned ? ' <span class="graph-badge bad">banido</span>' : ""}</div>
        <div class="graph-detail-sub">${node.username ? `@${esc(node.username)} · ` : ""}${num(links.length)} ${links.length === 1 ? "conexão" : "conexões"}</div>
      </div>
      <a class="graph-btn" href="/profile.html?uid=${encodeURIComponent(node.id)}" target="_blank" rel="noopener">Perfil</a>
      <button type="button" class="graph-btn graph-detail-close">Fechar</button>
    </div>
    <div class="graph-detail-list">
      ${links.slice(0, 25).map(({ other, edge }) => `
        <button type="button" class="graph-link-row" data-uid="${esc(other.id)}">
          <span class="graph-link-dot" style="background:${other.color}"></span>
          <span class="graph-link-name">${esc(other.name)}</span>
          <span class="graph-link-bar"><i style="width:${Math.max(4, Math.round(edge.norm * 100))}%;background:${TYPES[edge.type]?.color || "#8fa3bf"}"></i></span>
          <span class="graph-chips">${breakdown(edge.counts)}</span>
        </button>`).join("")}
    </div>`;
}

function renderControls() {
  $("graphTypes").innerHTML = Object.entries(TYPES).map(([type, info]) => `
    <button type="button" class="graph-type${graph.enabled.has(type) ? " active" : ""}" data-type="${type}" style="--chip:${info.color}">
      <i></i>${esc(info.label)}
    </button>`).join("");
}

function bindControls() {
  $("graphTypes").addEventListener("click", event => {
    const button = event.target.closest(".graph-type");
    if (!button) return;
    const type = button.dataset.type;
    if (graph.enabled.has(type)) graph.enabled.delete(type);
    else graph.enabled.add(type);
    renderControls();
    if (graph.raw) rebuild();
  });

  $("graphMin").addEventListener("input", event => {
    graph.minStrength = Number(event.target.value);
    $("graphMinValue").textContent = `${graph.minStrength}%`;
    if (graph.raw) rebuild();
  });

  $("graphLabels").addEventListener("change", event => {
    graph.showLabels = event.target.checked;
    draw();
  });

  $("graphIsolated").addEventListener("change", event => {
    graph.showIsolated = event.target.checked;
    if (graph.raw) rebuild();
  });

  $("graphRelayout").addEventListener("click", () => {
    if (!graph.raw) return;
    rebuild({ keepPositions: false });
    setTimeout(fitView, 1200);
  });

  $("graphFit").addEventListener("click", fitView);

  $("graphSearch").addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const term = event.target.value.trim().toLowerCase();
    if (!term) return;
    const match = graph.nodes.find(node => node.name.toLowerCase().includes(term) || node.username.toLowerCase().includes(term));
    if (match) select(match, { center: true });
  });

  const pick = event => {
    const row = event.target.closest("[data-uid]");
    if (!row) return;
    const node = graph.byId.get(row.dataset.uid);
    if (node) select(node, { center: true });
  };

  $("graphTop").addEventListener("click", pick);
  $("graphDetail").addEventListener("click", event => {
    if (event.target.closest(".graph-detail-close")) {
      select(null);
      return;
    }
    pick(event);
  });

  window.addEventListener("resize", resize);
}

function setup() {
  if (graph.bound) return;
  graph.bound = true;

  stage = $("graphStage");
  canvas = $("graphCanvas");
  tooltip = $("graphTooltip");
  ctx = canvas.getContext("2d");

  renderControls();
  bindControls();
  bindPointer();
}

export async function loadGraph(force = false) {
  setup();
  resize();

  if (graph.raw && !force) {
    reheat(0.2);
    return;
  }

  $("graphUpdated").textContent = "carregando…";
  stage.classList.add("loading");

  try {
    const data = await api.socialGraph({ force });
    const firstLoad = !graph.raw;
    graph.raw = data;
    $("graphUpdated").textContent = `atualizado ${fmtAgo(data.generatedAt)} · últimos ${num(data.limits?.posts)} posts e ${num(data.limits?.events)} eventos`;
    rebuild({ keepPositions: !firstLoad });
    if (firstLoad) setTimeout(fitView, 1400);
  } catch (error) {
    $("graphUpdated").textContent = "";
    $("graphTop").innerHTML = errorState(error);
  } finally {
    stage.classList.remove("loading");
  }
}
