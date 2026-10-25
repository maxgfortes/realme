import { db } from "/src/config/config.js";
import {
  collection, query, orderBy, limit, startAfter, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { api } from "./api.js";
import { getPerson } from "./people.js";
import { $, esc, num, fmtAgo, toast, confirmAction, emptyState, errorState, skeleton } from "./ui.js";
import { openUserSheet } from "./users.js";

const PAGE = 20;

let posts = [];
let cursor = null;
let loaded = false;
let loading = false;

function postHTML(post) {
  const hidden = post.visible === false;
  const media = post.imgs?.length ? `<span>${num(post.imgs.length)} mídia${post.imgs.length === 1 ? "" : "s"}</span>` : "";
  const thumb = post.imgs?.[0]?.url;

  return `
    <div class="item" data-post="${esc(post.id)}">
      <div class="item-top">
        <img class="thumb" src="/public/img/default.jpg" alt="" data-author-photo="${esc(post.creatorid || "")}">
        <div style="min-width:0;flex:1">
          <h3 data-author-name="${esc(post.creatorid || "")}">…</h3>
          <p>${esc(post.content || (thumb ? "(só mídia)" : "(sem texto)"))}</p>
        </div>
      </div>
      ${thumb && post.imgs[0].type !== "video" ? `<img class="report-image" src="${esc(thumb)}" alt="" loading="lazy">` : ""}
      <div class="meta">
        ${hidden ? `<span class="status-pill bad">oculto</span>` : `<span class="status-pill ok">no ar</span>`}
        <span>${esc(fmtAgo(post.create))}</span>
        <span>${num(post.likes || 0)} curtidas</span>
        ${media}
      </div>
      <div class="actions wrap">
        <button class="btn ${hidden ? "" : "warn"}" data-action="${hidden ? "show" : "hide"}">${hidden ? "Reexibir" : "Ocultar"}</button>
        <button class="btn danger" data-action="delete">Apagar</button>
        <button class="btn ghost" data-action="author">Autor</button>
      </div>
    </div>`;
}

function fillAuthors(root) {
  root.querySelectorAll("[data-author-name]").forEach(element => {
    getPerson(element.dataset.authorName).then(person => {
      if (element.isConnected) element.textContent = person.name;
    });
  });

  root.querySelectorAll("[data-author-photo]").forEach(element => {
    getPerson(element.dataset.authorPhoto).then(person => {
      if (element.isConnected) element.src = person.photo;
    });
  });
}

function render() {
  if (!posts.length) {
    $("contentList").innerHTML = emptyState("Nenhum post ainda");
    return;
  }

  $("contentList").innerHTML = posts.map(postHTML).join("");
  fillAuthors($("contentList"));
}

async function loadPage() {
  if (loading) return;
  loading = true;
  $("contentMore").disabled = true;

  try {
    const constraints = [orderBy("create", "desc"), limit(PAGE)];
    if (cursor) constraints.splice(1, 0, startAfter(cursor));

    const snap = await getDocs(query(collection(db, "posts"), ...constraints));

    posts.push(...snap.docs.map(docSnap => ({ id: docSnap.id, path: `posts/${docSnap.id}`, ...docSnap.data() })));
    cursor = snap.docs.at(-1) || cursor;
    $("contentMore").hidden = snap.size < PAGE;
    render();
  } catch (error) {
    $("contentList").innerHTML = errorState(error);
  } finally {
    loading = false;
    $("contentMore").disabled = false;
  }
}

$("contentMore").addEventListener("click", loadPage);

$("contentList").addEventListener("click", async event => {
  const button = event.target.closest("[data-action]");
  const card = event.target.closest("[data-post]");
  if (!button || !card) return;

  const post = posts.find(item => item.id === card.dataset.post);
  if (!post) return;

  const action = button.dataset.action;

  if (action === "author") {
    openUserSheet(post.creatorid);
    return;
  }

  if (action !== "show") {
    const { ok, reason } = await confirmAction({
      title: action === "hide" ? "Ocultar este post?" : "Apagar este post?",
      text: action === "hide" ? "Some do feed e do perfil, mas pode ser reexibido." : "Apaga o post, comentários e curtidas. Não pode ser desfeito.",
      confirmLabel: action === "hide" ? "Ocultar" : "Apagar",
      withReason: true
    });
    if (!ok) return;
    post.reason = reason;
  }

  button.disabled = true;

  try {
    await api.moderateContent({ path: post.path, action, reason: post.reason || "" });

    if (action === "delete") posts = posts.filter(item => item.id !== post.id);
    else post.visible = action === "show";

    render();
    toast(action === "delete" ? "Post apagado." : action === "hide" ? "Post ocultado." : "Post reexibido.");
  } catch (error) {
    toast(error.message);
    button.disabled = false;
  }
});

export function loadContent(force = false) {
  if (loaded && !force) return;

  loaded = true;
  posts = [];
  cursor = null;
  skeleton($("contentList"), 4);
  loadPage();
}
