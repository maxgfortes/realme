import { db } from "./firebase.js";
import { onSnapshot, collection, query, where } from "./firestore.js";
import { isProfilePost } from "./postsGrid.js";
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

let stopStats = null;

function applyPostStats(snapshot) {
  const posts = snapshot.docs.map(postDoc => postDoc.data()).filter(isProfilePost);

  updateStat("posts", posts.length);
  updateStat("photos", countPhotos(posts));
}

export function loadPostStats(uid) {
  stopStats?.();

  return new Promise(resolve => {
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    stopStats = onSnapshot(
      query(collection(db, "posts"), where("creatorid", "==", uid)),
      snapshot => {
        if (state.profileUserId === uid) applyPostStats(snapshot);
        finish();
      },
      error => {
        console.error("Erro ao observar estatísticas:", error);
        finish();
      }
    );
  });
}
