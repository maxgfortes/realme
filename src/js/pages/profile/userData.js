import { db } from "./firebase.js";
import { doc, getDoc } from "./firestore.js";
import { DEFAULT_PHOTO } from "./constants.js";
import { getDisplayName } from "./format.js";
import { loadProfileCache } from "./profileCache.js";

const summaries = new Map();

export async function getUsername(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? snapshot.data().username || "" : "";
}

export async function getCurrentUsername(uid) {
  const cached = loadProfileCache(uid);
  return cached?.user?.username || getUsername(uid);
}

export async function getUserPhoto(uid) {
  const snapshot = await getDoc(doc(db, "users", uid, "user-infos", "user-media"));
  const media = snapshot.exists() ? snapshot.data() : {};
  return media.pfp || media.userphoto || DEFAULT_PHOTO;
}

export async function getUserSummary(uid) {
  if (summaries.has(uid)) return summaries.get(uid);

  const [userSnapshot, photo] = await Promise.all([getDoc(doc(db, "users", uid)), getUserPhoto(uid)]);
  const user = userSnapshot.exists() ? userSnapshot.data() : {};
  const summary = {
    uid,
    username: user.username || uid,
    name: getDisplayName(user),
    photo,
  };

  summaries.set(uid, summary);
  return summary;
}
