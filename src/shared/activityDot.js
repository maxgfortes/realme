import { auth, db } from "/src/config/config.js";
import {
    collection, query, where, orderBy, limit, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const CACHE_KEY = "hasNewActivity";
const SEEN_PREFIX = "realme.activitiesSeenAt.";
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const ON_ACTIVITIES_PAGE = location.pathname.endsWith("/activities.html");

const root = document.documentElement;

let friends = new Set();
let latestActivities = [];
let currentUid = null;
let unsubscribeFriends = null;
let unsubscribeActivities = null;

export function getActivitiesSeenAt(uid) {
    try {
        return Number(localStorage.getItem(SEEN_PREFIX + uid)) || 0;
    } catch {
        return 0;
    }
}

export function markActivitiesSeen(uid, at = Date.now()) {
    try {
        localStorage.setItem(SEEN_PREFIX + uid, String(at));
    } catch {}
    setActive(false);
}

function setActive(active) {
    root.classList.toggle("has-new-activity", active);

    try {
        localStorage.setItem(CACHE_KEY, active ? "1" : "0");
    } catch {}
}

function toMs(value) {
    return value?.toMillis ? value.toMillis() : 0;
}

function evaluate() {
    if (!currentUid || ON_ACTIVITIES_PAGE) {
        setActive(false);
        return;
    }

    const seenAt = getActivitiesSeenAt(currentUid);

    setActive(latestActivities.some(activity =>
        activity.actorUid !== currentUid &&
        friends.has(activity.actorUid) &&
        activity.createdAtMs > seenAt
    ));
}

function stop() {
    unsubscribeFriends?.();
    unsubscribeActivities?.();
    unsubscribeFriends = null;
    unsubscribeActivities = null;
    friends = new Set();
    latestActivities = [];
}

root.classList.toggle("has-new-activity", !ON_ACTIVITIES_PAGE && localStorage.getItem(CACHE_KEY) === "1");

onAuthStateChanged(auth, user => {
    stop();
    currentUid = user?.uid || null;

    if (!user) {
        setActive(false);
        return;
    }

    if (!getActivitiesSeenAt(user.uid)) markActivitiesSeen(user.uid);

    unsubscribeFriends = onSnapshot(
        collection(db, "users", user.uid, "friends"),
        snap => {
            friends = new Set(snap.docs.map(friendDoc => friendDoc.id));
            evaluate();
        },
        () => {}
    );

    unsubscribeActivities = onSnapshot(
        query(
            collection(db, "activities"),
            where("createdAt", ">=", Timestamp.fromMillis(Date.now() - WINDOW_MS)),
            where("visible", "==", true),
            orderBy("createdAt", "desc"),
            limit(40)
        ),
        snap => {
            latestActivities = snap.docs.map(activityDoc => ({
                actorUid: activityDoc.get("actorUid"),
                createdAtMs: toMs(activityDoc.get("createdAt"))
            }));
            evaluate();
        },
        () => {}
    );
});
