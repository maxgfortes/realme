import { t } from "/src/i18n/i18n.js";
import { db } from "./firebase.js";
import {
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  deleteDoc,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { addTab, removeTab } from "./profileTabs.js";
import { EVENT_ICON_SVG, eventCardHTML, loadEventGoing } from "./eventCard.js";

let panel = null;
let renderedKey = null;
let lastArgs = null;
let lastHtml = "";

const EVENTS_REFRESH_MS = 60 * 1000;

const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

const HOLD_MS = 1200;
const HOLD_TOLERANCE = 10;
const REMOVE_MS = 450;

function isActive(data) {
  const start = data.eventDate?.toMillis?.();
  return !start || start + ACTIVE_WINDOW_MS > Date.now();
}

async function fetchCreated(uid) {
  try {
    const snap = await getDocs(
      query(
        collection(db, "events"),
        where("creatorId", "==", uid),
        orderBy("createAt", "desc")
      )
    );

    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(isActive);
  } catch (error) {
    if (error.code !== "permission-denied") console.error("Erro ao buscar eventos criados:", error);
    return [];
  }
}

async function fetchGoing(uid) {
  let snap;

  try {
    snap = await getDocs(
      query(collectionGroup(db, "going"), where("uid", "==", uid))
    );
  } catch (error) {
    console.error("Erro ao buscar eventos que você vai:", error);
    return [];
  }

  const confirmed = snap.docs.filter(d => d.data().status !== "maybe");

  const events = await Promise.all(
    confirmed.map(async going => {
      try {
        const eventId = going.ref.parent.parent.id;
        const eventSnap = await getDoc(doc(db, "events", eventId));
        return eventSnap.exists() ? { id: eventSnap.id, ...eventSnap.data() } : null;
      } catch {
        return null;
      }
    })
  );

  return events
    .filter(Boolean)
    .filter(event => event.creatorId !== uid)
    .filter(isActive);
}

function openEventLayer(eventId) {
  if (!eventId) return;

  document.dispatchEvent(
    new CustomEvent("realme:open-event", { detail: { eventId } })
  );
}

function collapse(card) {
  card.style.height = `${card.offsetHeight}px`;
  void card.offsetHeight;
  card.classList.add("event-removing");

  return new Promise(resolve => setTimeout(resolve, REMOVE_MS));
}

async function deleteCard(area) {
  const eventId = area.dataset.eventId;
  const section = area.closest(".events-section");
  const card = area.closest(".events-list > *") || area;

  area.classList.add("deleting");

  try {
    await deleteDoc(doc(db, "events", eventId));
  } catch (error) {
    console.error("Erro ao apagar evento:", error);

    area.classList.remove("deleting");
    area.classList.add("delete-failed");
    area.addEventListener(
      "animationend",
      () => area.classList.remove("delete-failed"),
      { once: true }
    );

    return;
  }

  await collapse(card);
  card.remove();

  if (section && !section.querySelector(".event-card-area")) section.remove();

  if (panel && !panel.querySelector(".event-card-area")) {
    removeTab(panel);
    panel = null;
    renderedKey = null;
  }
}

function bindEventCards(root) {
  let hold = null;

  function cancelHold() {
    if (!hold) return;

    clearTimeout(hold.timer);
    hold.area.classList.remove("holding");
    hold = null;
  }

  root.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button > 0) return;

    const area = event.target.closest(".event-card-area");

    if (!area || !area.closest("[data-deletable]")) return;
    if (area.classList.contains("deleting")) return;

    cancelHold();
    delete area.dataset.held;

    area.style.setProperty("--hold-ms", `${HOLD_MS}ms`);
    area.classList.add("holding");

    hold = {
      area,
      x: event.clientX,
      y: event.clientY,
      timer: setTimeout(() => {
        hold = null;

        area.classList.remove("holding");
        area.dataset.held = "1";

        deleteCard(area);
      }, HOLD_MS)
    };
  });

  root.addEventListener("pointermove", event => {
    if (!hold) return;

    const moved = Math.hypot(event.clientX - hold.x, event.clientY - hold.y);

    if (moved > HOLD_TOLERANCE) cancelHold();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach(type =>
    root.addEventListener(type, cancelHold)
  );

  root.addEventListener("contextmenu", event => {
    if (event.target.closest("[data-deletable] .event-card-area")) {
      event.preventDefault();
    }
  });

  root.addEventListener("click", event => {
    const area = event.target.closest(".event-card-area");

    if (!area) return;

    if (area.dataset.held) {
      delete area.dataset.held;
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (area.classList.contains("deleting")) return;

    openEventLayer(area.dataset.eventId);
  });
}

function sectionHTML(title, events, { deletable = false } = {}) {
  if (!events.length) return "";

  return `
    <section class="events-section"${deletable ? " data-deletable" : ""}>
      <h3 class="events-section-title">${title}</h3>
      <div class="events-list">
        ${events
          .map(e => eventCardHTML({ eventId: e.id, title: e.eventTitle || "" }))
          .join("")}
      </div>
      ${deletable ? `<p class="events-section-hint">${t("events.holdToDelete")}</p>` : ""}
    </section>`;
}

export async function initProfileEvents({ profileUid, isOwner, force = false }) {
  lastArgs = { profileUid, isOwner };

  const key = `${profileUid}:${isOwner}`;
  if (renderedKey === key) return;
  renderedKey = key;

  const [created, going] = await Promise.all([
    fetchCreated(profileUid),
    isOwner ? fetchGoing(profileUid) : []
  ]);

  if (renderedKey !== key) return;

  if (!created.length && !going.length) {
    if (panel) {
      removeTab(panel);
      panel = null;
    }

    return;
  }

  const html =
    sectionHTML("Criados", created, { deletable: isOwner }) +
    sectionHTML("Entrados", going);

  if (!panel) {
    panel = document.createElement("div");
    panel.className = "profile-tab";
    panel.innerHTML = html;
    addTab(EVENT_ICON_SVG, panel);
    bindEventCards(panel);
  } else if (html !== lastHtml || force) {
    panel.innerHTML = html;
  }

  lastHtml = html;

  panel.querySelectorAll(".event-card-area").forEach(area => {
    loadEventGoing(area.dataset.eventId, area.querySelector(".event-card-graph"));
  });
}

function refreshProfileEvents(force = false) {
  if (!lastArgs) return;

  renderedKey = null;
  initProfileEvents({ ...lastArgs, force });
}

document.addEventListener("realme:event-going-changed", () => refreshProfileEvents(true));

setInterval(() => {
  if (!document.hidden) refreshProfileEvents();
}, EVENTS_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshProfileEvents();
});