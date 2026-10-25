import { t } from "/src/i18n/i18n.js";
import { db } from "./firebase.js";
import {
  doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit,
} from "./firestore.js";
import { $, select, cloneTemplate, setImage } from "./dom.js";
import { state, unsubscribers } from "./state.js";
import { toDate } from "./format.js";
import { getUserPhoto } from "./userData.js";
import { createPostPreview } from "./postPreview.js";
import { openWallComposer } from "./wallComposer.js";
import { openProfileTimeline } from "./timeline.js";

const MAX_MENTIONS = 30;

let wallUid = null;
let wallItems = [];
let renderSession = 0;
let composerBound = false;

function getTime(value) {
  return toDate(value)?.getTime() || 0;
}

async function canWriteOnWall(uid) {
  if (state.isOwnProfile) return true;
  if (!state.currentUserId) return false;
  const friend = await getDoc(doc(db, "users", uid, "friends", state.currentUserId));
  return friend.exists();
}

function bindComposer() {
  if (composerBound) return;

  composerBound = true;

  select(".send-wall")?.addEventListener("click", () => {
    if (!wallUid) return;
    openWallComposer(wallUid);
  });
}

async function renderComposer(uid) {
  const composer = select(".send-wall");
  const canWrite = await canWriteOnWall(uid);

  if (uid !== wallUid) return;

  composer.classList.toggle("hidden", !canWrite);
  if (canWrite) setImage($("pfp-user"), await getUserPhoto(state.currentUserId), "", t("common.profilePhoto"));
}

async function wallDocToItem(wallDoc) {
  const wall = wallDoc.data({ serverTimestamps: "estimate" });
  const time = getTime(wall.createdAt);
  const fallback = {
    id: wallDoc.ref.path,
    time,
    data: {
      content: wall.content || wall.text || "",
      imgs: Array.isArray(wall.imgs) ? wall.imgs : [],
      creatorid: wall.authorId || "",
      create: wall.createdAt || null,
      wallTo: wallDoc.ref.parent.parent?.id || "",
    },
  };

  if (!wall.postId) return fallback;

  const post = await getDoc(doc(db, "posts", wall.postId));

  if (!post.exists()) return null;

  return { id: post.id, time, data: post.data() };
}

function mentionDocToItem(postDoc) {
  const post = postDoc.data();
  return { id: postDoc.id, time: getTime(post.create), data: post };
}

async function fetchMentions(uid) {
  const mentionsQuery = query(
    collection(db, "posts"),
    where("mentions", "array-contains", uid),
    orderBy("create", "desc"),
    limit(MAX_MENTIONS)
  );
  const snapshot = await getDocs(mentionsQuery);
  return snapshot.docs.map(mentionDocToItem);
}

function uniqueById(items) {
  const seen = new Set();

  return items.filter(item => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function openWallTimeline(postId) {
  const startIndex = wallItems.findIndex(item => item.id === postId);

  openProfileTimeline(
    wallItems.map(item => ({ id: item.id, userid: wallUid, data: item.data })),
    Math.max(startIndex, 0),
    state.profileUsername,
    "Mural"
  );
}

function createWallItem(item) {
  const preview = createPostPreview(item.data);

  preview.dataset.postId = item.id;
  preview.classList.add("wall-item");
  preview.addEventListener("click", () => openWallTimeline(item.id));

  return preview;
}

async function renderWallFeed(uid, wallSnapshot) {
  const session = ++renderSession;

  const [wallEntries, mentionItems] = await Promise.all([
    Promise.all(wallSnapshot.docs.map(wallDocToItem)),
    fetchMentions(uid).catch(() => []),
  ]);

  if (session !== renderSession || uid !== wallUid) return;

  const items = uniqueById([...wallEntries, ...mentionItems])
    .filter(item => item?.data?.visible !== false)
    .sort((a, b) => b.time - a.time);
  const feed = $("wallFeed");

  wallItems = items;
  feed.replaceChildren();

  if (!items.length) {
    feed.appendChild(cloneTemplate("emptyWallTemplate"));
    return;
  }

  items.forEach(item => feed.appendChild(createWallItem(item)));
}

export function loadWall(uid) {
  wallUid = uid;
  wallItems = [];
  bindComposer();
  renderComposer(uid);

  const wallQuery = query(collection(db, "users", uid, "wall"), orderBy("createdAt", "desc"));
  const stop = onSnapshot(wallQuery, snapshot => renderWallFeed(uid, snapshot));

  unsubscribers.push(stop);
}
