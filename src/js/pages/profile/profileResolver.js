import { db } from "./firebase.js";
import { doc, getDoc, getDocs, collection, query, where } from "./firestore.js";
import { state } from "./state.js";
import { loadUidCache, saveUidCache, loadOwnUid } from "./profileCache.js";

function readUrlParams() {
  const params = new URLSearchParams(location.search);
  return {
    username: params.get("username") || params.get("u") || params.get("user"),
    userId: params.get("userid") || params.get("uid"),
  };
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

export function hasProfileInUrl() {
  const { username, userId } = readUrlParams();
  return Boolean(username || userId);
}

export function getCachedProfileUid() {
  const { username, userId } = readUrlParams();
  if (userId) return userId;
  if (username) return loadUidCache(normalizeUsername(username));
  return loadOwnUid();
}

async function queryUidByUsername(key) {
  const usernameDoc = await getDoc(doc(db, "usernames", key));
  if (usernameDoc.exists()) return usernameDoc.data().uid;

  const result = await getDocs(query(collection(db, "users"), where("username", "==", key)));
  return result.empty ? null : result.docs[0].id;
}

async function findUidByUsername(username) {
  const key = normalizeUsername(username);
  const cached = loadUidCache(key);
  if (cached) return cached;

  const uid = await queryUidByUsername(key);
  if (uid) saveUidCache(key, uid);
  return uid;
}

export async function resolveProfileUid() {
  const { username, userId } = readUrlParams();
  if (userId) return userId;
  if (username) return findUidByUsername(username);
  return state.currentUserId;
}
