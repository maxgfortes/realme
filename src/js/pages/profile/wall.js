import { db } from "./firebase.js";
import {
  doc, getDoc, getDocs, onSnapshot, collection, query, where, orderBy, limit,
} from "./firestore.js";
import { $, select, cloneTemplate, setImage } from "./dom.js";
import { state, unsubscribers } from "./state.js";
import { toDate } from "./format.js";
import { getUserPhoto } from "./userData.js";
import { createPostPreview } from "./postPreview.js";

const MAX_MENTIONS = 30;

function getTime(value) {
  return toDate(value)?.getTime() || 0;
}

async function canWriteOnWall(uid) {
  if (state.isOwnProfile) return true;
  if (!state.currentUserId) return false;
  const friend = await getDoc(doc(db, "users", uid, "friends", state.currentUserId));
  return friend.exists();
}

async function renderComposer(uid) {
  const composer = select(".send-wall");
  const canWrite = await canWriteOnWall(uid);

  composer.classList.toggle("hidden", !canWrite);
  if (canWrite) setImage($("pfp-user"), await getUserPhoto(state.currentUserId), "", "Foto de perfil");
}

async function wallDocToItem(wallDoc) {
  const wall = wallDoc.data();
  const time = getTime(wall.createdAt);

  if (!wall.postId) return { time, data: { content: wall.text } };

  const post = await getDoc(doc(db, "posts", wall.postId));
  return { time, data: post.exists() ? post.data() : { content: wall.text } };
}

function mentionDocToItem(postDoc) {
  const post = postDoc.data();
  return { time: getTime(post.create), data: post };
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

async function renderWallFeed(uid, wallSnapshot) {
  const [wallItems, mentionItems] = await Promise.all([
    Promise.all(wallSnapshot.docs.map(wallDocToItem)),
    fetchMentions(uid),
  ]);

  const items = [...wallItems, ...mentionItems].sort((a, b) => b.time - a.time);
  const feed = $("wallFeed");

  feed.replaceChildren();

  if (!items.length) {
    feed.appendChild(cloneTemplate("emptyWallTemplate"));
    return;
  }

  items.forEach(item => feed.appendChild(createPostPreview(item.data)));
}

export function loadWall(uid) {
  renderComposer(uid);

  const wallQuery = query(collection(db, "users", uid, "wall"), orderBy("createdAt", "desc"));
  const stop = onSnapshot(wallQuery, snapshot => renderWallFeed(uid, snapshot));

  unsubscribers.push(stop);
}
