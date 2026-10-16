import { db } from "./firebase.js";
import { getDocs, collection, query, where } from "./firestore.js";
import { $ } from "./dom.js";
import { state } from "./state.js";
import { getPostImages } from "./postImages.js";
import { scheduleProfileCacheSave } from "./profileCache.js";

const STAT_ELEMENTS = {
  friends: "friendsCount",
  posts: "postsCount",
  photos: "photosCount",
};

export function renderStats(stats) {
  Object.entries(STAT_ELEMENTS).forEach(([key, id]) => {
    $(id).textContent = stats[key] ?? 0;
  });
}

export function updateStat(key, value) {
  state.profileData.stats[key] = value;
  $(STAT_ELEMENTS[key]).textContent = value;
  scheduleProfileCacheSave();
}

function countPhotos(posts) {
  return posts.reduce((total, post) => total + getPostImages(post).length, 0);
}

export async function loadPostStats(uid) {
  const snapshot = await getDocs(query(collection(db, "posts"), where("creatorid", "==", uid)));
  const posts = snapshot.docs.map(postDoc => postDoc.data());

  updateStat("posts", posts.length);
  updateStat("photos", countPhotos(posts));
}
