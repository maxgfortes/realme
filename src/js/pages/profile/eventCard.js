import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  getCountFromServer,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { getUserName } from "/src/js/pages/feed/render/postCard.js";

const GOING_SAMPLE_SIZE = 30;

export const EVENT_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http\://www\.w3.org/2000/svg">\<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>\<path d="M3 10H21" fill="none" stroke="currentColor" stroke-width="2"/>\<path d="M8 2V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>\<path d="M16 2V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>\<text x="12" y="17.5" font-family="system-ui, -apple-system, sans-serif" font-size="7.5" font-weight="600" fill="currentColor" text-anchor="middle">\</text>\</svg>`

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function joinNames(parts) {
  if (parts.length <= 1) return parts.join("");
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

function shuffle(list) {
  const array = [...list];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function eventCardHTML({ eventId, title }) {
  return `
    <div class="event-card-area" data-event-id="${escapeHTML(eventId)}">
      <div class="event-card">
        <div class="event-card-top">
          <div class="event-card-icon-area">${EVENT_ICON_SVG}</div>
          <div class="event-card-info">
            <div class="event-card-label">Evento</div>
            <div class="event-card-title">${escapeHTML(title)}</div>
          </div>
        </div>
        <div class="event-card-bottom">
          <div class="event-card-graph"></div>
        </div>
      </div>
    </div>`;
}

export async function loadEventGoing(eventId, graph) {
  if (!graph) return;

  try {
    const goingRef = collection(db, "events", eventId, "going");

    const [countSnap, sampleSnap] = await Promise.all([
      getCountFromServer(goingRef),
      getDocs(query(goingRef, limit(GOING_SAMPLE_SIZE)))
    ]);

    const total = countSnap.data().count;

    if (total === 0) {
      graph.textContent = "Ninguém ainda vai";
      return;
    }

    const picked = shuffle(sampleSnap.docs).slice(0, 2);

    const names = await Promise.all(
      picked.map(d => getUserName(d.data().uid || d.id))
    );

    const parts = names.map(name => `<span>${escapeHTML(name)}</span>`);
    const others = total - names.length;

    if (others > 0) {
      const text = others === 1 ? "outra pessoa" : `outras ${others} pessoas`;
      parts.push(`<span>${text}</span>`);
    }

    graph.innerHTML = `${joinNames(parts)} ${total === 1 ? "vai" : "vão"}`;
  } catch (error) {
    console.error("Erro ao carregar quem vai:", error);
  }
}