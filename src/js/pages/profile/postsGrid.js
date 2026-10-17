import { db } from "./firebase.js";
import {
  doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit, startAfter,
} from "./firestore.js";
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
let liveUnsubscribe = null;

function buildQuery() {
  const constraints = [
    where("creatorid", "==", gridUserId),
    orderBy("create", "desc"),
  ];

  if (lastSnapshot) constraints.push(startAfter(lastSnapshot));
  constraints.push(limit(POSTS_PER_PAGE));

  return query(collection(db, "posts"), ...constraints);
}

export function isProfilePost(data) {
  return !data.wallTo || data.wallTo === data.creatorid;
}

function createGridItem(post) {
  const item = createPostPreview(post.data);
  item.dataset.postId = post.id;
  item.addEventListener("click", () => openTimeline(post.id));
  return item;
}

function postTime(data) {
  return data.create?.toMillis ? data.create.toMillis() : Date.now();
}

function prependLivePost(postDoc) {
  const data = postDoc.data({ serverTimestamps: "estimate" });

  if (!isProfilePost(data) || loadedPosts.some(post => post.id === postDoc.id)) return;

  const newest = loadedPosts[0];

  if (newest && postTime(data) < postTime(newest.data)) return;

  const post = { id: postDoc.id, userid: gridUserId, data };
  const grid = $("muralPosts");

  grid.querySelectorAll(":scope > :not([data-post-id])").forEach(element => element.remove());

  loadedPosts.unshift(post);
  grid.prepend(createGridItem(post));
}

async function removeLivePost(postId) {
  if (!loadedPosts.some(post => post.id === postId)) return;

  const snapshot = await getDoc(doc(db, "posts", postId)).catch(() => null);

  if (snapshot?.exists()) return;

  loadedPosts = loadedPosts.filter(post => post.id !== postId);
  $("muralPosts").querySelector(`[data-post-id="${CSS.escape(postId)}"]`)?.remove();

  if (!loadedPosts.length && finished) renderEmptyState();
}

function startLiveGrid(uid) {
  liveUnsubscribe?.();

  let firstSnapshot = true;
  const session = gridSession;

  liveUnsubscribe = onSnapshot(
    query(collection(db, "posts"), where("creatorid", "==", uid), orderBy("create", "desc"), limit(POSTS_PER_PAGE)),
    snapshot => {
      if (session !== gridSession) return;

      if (firstSnapshot) {
        firstSnapshot = false;
        return;
      }

      snapshot.docChanges().forEach(change => {
        if (change.type === "added") prependLivePost(change.doc);
        else if (change.type === "removed") removeLivePost(change.doc.id);
      });
    },
    error => console.error("Erro ao observar posts do perfil:", error)
  );
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

  if (session !== gridSession) return [];

  const newPosts = result.docs
    .map(postDoc => ({
      id: postDoc.id,
      userid: gridUserId,
      data: postDoc.data(),
    }))
    .filter(post => isProfilePost(post.data) && !loadedPosts.some(loaded => loaded.id === post.id));

  newPosts.forEach(post => $("muralPosts").appendChild(createGridItem(post)));
  loadedPosts.push(...newPosts);

  lastSnapshot = result.docs.at(-1) ?? lastSnapshot;
  finished = result.size < POSTS_PER_PAGE;

  if (!loadedPosts.length && finished) renderEmptyState();
  if (!finished) watchSentinel();

  return newPosts;
}

function loadNextPage() {
  if (finished) return Promise.resolve([]);

  pagePromise ??= fetchNextPage().finally(() => {
    pagePromise = null;
  });

  return pagePromise;
}

function openTimeline(postId) {
  const startIndex = loadedPosts.findIndex(post => post.id === postId);

  openProfileTimeline([...loadedPosts], startIndex, state.profileUsername);
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

  $("muralPosts").replaceChildren();
  startObserver();
  startLiveGrid(uid);
}