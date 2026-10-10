import { db } from "./firebase.js";
import { getDocs, collection, query, where, orderBy, limit, startAfter } from "./firestore.js";
import { openProfileTimeline } from "../../../components/posts.js";
import { $, select, cloneTemplate } from "./dom.js";
import { state } from "./state.js";
import { POSTS_PER_PAGE } from "./constants.js";
import { createPostPreview } from "./postPreview.js";

let gridUserId = null;
let lastSnapshot = null;
let loading = false;
let finished = false;
let observer = null;
let loadedPosts = [];

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

async function loadNextPage() {
  if (loading || finished) return [];
  loading = true;

  const result = await getDocs(buildQuery());
  const newPosts = result.docs.map(postDoc => ({
    id: postDoc.id,
    userid: gridUserId,
    data: postDoc.data(),
  }));

  newPosts.forEach(post => $("muralPosts").appendChild(createGridItem(post)));
  loadedPosts.push(...newPosts);

  lastSnapshot = result.docs.at(-1) ?? lastSnapshot;
  finished = result.size < POSTS_PER_PAGE;
  loading = false;

  if (!loadedPosts.length) renderEmptyState();
  if (!finished) watchSentinel();

  return newPosts;
}

async function loadMoreForTimeline() {
  const newPosts = await loadNextPage();
  return newPosts.length ? newPosts : null;
}

function openTimeline(postId) {
  const startIndex = loadedPosts.findIndex(post => post.id === postId);
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
  gridUserId = uid;
  lastSnapshot = null;
  loading = false;
  finished = false;
  loadedPosts = [];

  $("muralPosts").replaceChildren();
  startObserver();
}
