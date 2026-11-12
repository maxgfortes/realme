import { db } from "./firebase.js";
import {
  doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit, startAfter,
} from "./firestore.js";
import { openProfileTimeline, closeProfileTimeline } from "./timeline.js";
import { $, select, cloneTemplate } from "./dom.js";
import { state } from "./state.js";
import { POSTS_PER_PAGE } from "./constants.js";
import { createPostPreview } from "./postPreview.js";
import { fetchProfileContent, revive } from "./profileApi.js";

let gridUserId = null;
let gridSession = 0;
let lastSnapshot = null;
let pagePromise = null;
let finished = false;
let observer = null;
let loadedPosts = [];
let liveUnsubscribe = null;
let serverCursor = undefined;

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
  return data.visible !== false && (!data.wallTo || data.wallTo === data.creatorid);
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

function appendPosts(posts) {
  const fresh = posts.filter(post => isProfilePost(post.data) && !loadedPosts.some(loaded => loaded.id === post.id));
  const grid = $("muralPosts");

  grid.querySelectorAll(":scope > :not([data-post-id])").forEach(element => element.remove());
  fresh.forEach(post => grid.appendChild(createGridItem(post)));
  loadedPosts.push(...fresh);

  return fresh;
}

function afterPage() {
  if (!loadedPosts.length && finished) renderEmptyState();
  if (!finished) watchSentinel();
}

function applyServerPage(page) {
  const posts = (page.posts || []).map(post => ({ id: post.id, userid: gridUserId, data: revive(post.data) }));
  serverCursor = page.nextCursor || null;
  finished = !serverCursor;

  const added = appendPosts(posts);
  afterPage();

  return added;
}

async function fetchServerPage() {
  const session = gridSession;
  const cursor = serverCursor;

  try {
    const page = await fetchProfileContent({ uid: gridUserId, section: "posts", cursor });
    if (session !== gridSession) return [];
    return applyServerPage(page);
  } catch (error) {
    if (session !== gridSession) return [];
    console.warn("Perfil pelo servidor indisponível:", error);
    serverCursor = undefined;
    lastSnapshot = cursor ? await getDoc(doc(db, "posts", cursor)).catch(() => null) : null;
    return fetchFirestorePage();
  }
}

export function seedPostsGrid(uid, seedPromise) {
  if (uid !== gridUserId) return;

  const session = gridSession;

  pagePromise = seedPromise
    .then(page => {
      if (session !== gridSession) return [];
      if (!page) throw new Error("NO_SEED");
      return applyServerPage(page);
    })
    .catch(() => {
      if (session !== gridSession) return [];
      serverCursor = undefined;
      return fetchFirestorePage();
    })
    .finally(() => {
      if (session === gridSession) pagePromise = null;
    });
}

export function refreshFirstPage(uid, page) {
  if (uid !== gridUserId || !page) return;

  const ids = (page.posts || []).map(post => post.id);
  const shown = loadedPosts.slice(0, ids.length).map(post => post.id);

  if (ids.join() === shown.join() || loadedPosts.length > ids.length) return;

  loadedPosts = [];
  $("muralPosts").replaceChildren();
  applyServerPage(page);
}

function fetchNextPage() {
  return serverCursor !== undefined ? fetchServerPage() : fetchFirestorePage();
}

async function fetchFirestorePage() {
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

  appendPosts(newPosts);

  lastSnapshot = result.docs.at(-1) ?? lastSnapshot;
  finished = result.size < POSTS_PER_PAGE;

  afterPage();

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
  serverCursor = undefined;
  finished = false;
  loadedPosts = [];

  $("muralPosts").replaceChildren();
  startObserver();
  startLiveGrid(uid);
}