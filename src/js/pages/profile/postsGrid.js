import { db } from "./firebase.js";
import { getDocs, collection, query, where, orderBy, limit, startAfter } from "./firestore.js";
import { openProfileTimeline, closeProfileTimeline } from "./timeline.js";
import { $, select, cloneTemplate } from "./dom.js";
import { state } from "./state.js";
import { POSTS_PER_PAGE } from "./constants.js";
import { createPostPreview } from "./postPreview.js";

let gridUserId = null;
let gridSession = 0;
let lastSnapshot = null;
let pagePromise = null;
let finished = false;
let observer = null;
let loadedPosts = [];
let timelineSent = 0; // quantos posts de loadedPosts a timeline já recebeu

function buildQuery() {
  const constraints = [
    where("creatorid", "==", gridUserId),
    orderBy("create", "desc"),
  ];

  if (lastSnapshot) constraints.push(startAfter(lastSnapshot));
  constraints.push(limit(POSTS_PER_PAGE));

  return query(collection(db, "posts"), ...constraints);
}

function createGridItem(post) {
  const item = createPostPreview(post.data);
  item.addEventListener("click", () => openTimeline(post.id));
  return item;
}

function renderEmptyState() {
  $("muralPosts").appendChild(cloneTemplate("emptyPostsTemplate"));
}

function watchSentinel() {
  const sentinel = $("postsSentinel");
  observer.unobserve(sentinel);
  observer.observe(sentinel);
}

async function fetchNextPage() {
  const session = gridSession;
  const result = await getDocs(buildQuery());

  // o perfil mudou enquanto buscava
  if (session !== gridSession) return [];

  const newPosts = result.docs.map(postDoc => ({
    id: postDoc.id,
    userid: gridUserId,
    data: postDoc.data(),
  }));

  newPosts.forEach(post => $("muralPosts").appendChild(createGridItem(post)));
  loadedPosts.push(...newPosts);

  lastSnapshot = result.docs.at(-1) ?? lastSnapshot;
  finished = result.size < POSTS_PER_PAGE;

  if (!loadedPosts.length) renderEmptyState();
  if (!finished) watchSentinel();

  return newPosts;
}

// quem chamar durante uma busca em andamento recebe a mesma busca
function loadNextPage() {
  if (finished) return Promise.resolve([]);

  pagePromise ??= fetchNextPage().finally(() => {
    pagePromise = null;
  });

  return pagePromise;
}

// entrega à timeline tudo que ela ainda não recebeu (inclusive o que o grid
// carregou sozinho enquanto a timeline estava aberta)
async function loadMoreForTimeline() {
  await loadNextPage();

  const fresh = loadedPosts.slice(timelineSent);
  timelineSent = loadedPosts.length;

  return fresh.length ? fresh : null;
}

function openTimeline(postId) {
  const startIndex = loadedPosts.findIndex(post => post.id === postId);

  timelineSent = loadedPosts.length;

  openProfileTimeline([...loadedPosts], startIndex, state.profileUsername, loadMoreForTimeline);
}

function startObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    entries => {
      if (entries[0].isIntersecting) loadNextPage();
    },
    { root: select(".full-profile-container"), rootMargin: "300px" }
  );
  observer.observe($("postsSentinel"));
}

export function loadPostsGrid(uid) {
  closeProfileTimeline();

  gridUserId = uid;
  gridSession++;
  lastSnapshot = null;
  pagePromise = null;
  finished = false;
  loadedPosts = [];
  timelineSent = 0;

  $("muralPosts").replaceChildren();
  startObserver();
}