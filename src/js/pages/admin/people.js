import { db } from "/src/config/config.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { DEFAULT_PFP } from "./ui.js";

const cache = new Map();

export function fullName(data, fallback = "Sem nome") {
  return [data?.name, data?.surname].filter(Boolean).join(" ").trim() ||
    data?.displayName || data?.displayname || data?.username || fallback;
}

export function getPerson(uid) {
  if (!uid) return Promise.resolve({ uid, name: "Desconhecido", username: "", photo: DEFAULT_PFP });

  if (!cache.has(uid)) {
    cache.set(uid, Promise.all([
      getDoc(doc(db, "users", uid)).catch(() => null),
      getDoc(doc(db, "users", uid, "user-infos", "user-media")).catch(() => null)
    ]).then(([userSnap, mediaSnap]) => {
      const data = userSnap?.exists() ? userSnap.data() : {};
      const media = mediaSnap?.exists() ? mediaSnap.data() : {};

      return {
        uid,
        name: fullName(data, uid),
        username: data.username || "",
        photo: media.userphoto || media.pfp || DEFAULT_PFP,
        verified: data.verified === true,
        banned: data.banned === true
      };
    }));
  }

  return cache.get(uid);
}

export function forgetPerson(uid) {
  cache.delete(uid);
}
