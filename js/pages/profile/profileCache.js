import { state } from "./state.js";

const PROFILE_PREFIX = "profile_cache_";
const UID_PREFIX = "profile_uid_";
const OWN_UID_KEY = "own_profile_uid";

const PROFILE_TTL = 7 * 24 * 60 * 60 * 1000;
const UID_TTL = 30 * 60 * 1000;
const SAVE_DELAY = 400;

let saveTimer = null;

function writeCache(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
  } catch (error) {
    console.warn(error);
  }
}

function readCache(key, ttl) {
  try {
    const cached = JSON.parse(localStorage.getItem(key));
    if (!cached) return null;
    if (Date.now() - cached.savedAt > ttl) {
      localStorage.removeItem(key);
      return null;
    }
    return cached.value;
  } catch {
    return null;
  }
}

export function loadProfileCache(uid) {
  return readCache(PROFILE_PREFIX + uid, PROFILE_TTL);
}

export function scheduleProfileCacheSave() {
  const uid = state.profileUserId;
  const data = state.profileData;

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => writeCache(PROFILE_PREFIX + uid, data), SAVE_DELAY);
}

export function saveUidCache(username, uid) {
  writeCache(UID_PREFIX + username, uid);
}

export function loadUidCache(username) {
  return readCache(UID_PREFIX + username, UID_TTL);
}

export function saveOwnUid(uid) {
  writeCache(OWN_UID_KEY, uid);
}

export function loadOwnUid() {
  return readCache(OWN_UID_KEY, PROFILE_TTL);
}

export function clearOwnUid() {
  localStorage.removeItem(OWN_UID_KEY);
}
