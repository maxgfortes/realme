import { db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from "./firestore.js";
import { triggerNovaAmizade } from "../../../components/activitie-creator.js";
import { state } from "./state.js";

function friendRequestId(firstId, secondId) {
  return [firstId, secondId].sort().join("_");
}

export function requestRef(targetId) {
  return doc(db, "friendRequests", friendRequestId(state.currentUserId, targetId));
}

export function readStatus(snapshot) {
  if (!snapshot.exists()) return "none";

  const { status, from } = snapshot.data();
  if (status === "accepted") return "friends";
  if (status === "pending") return from === state.currentUserId ? "pending_sent" : "pending_received";
  return "none";
}

export async function fetchStatus(targetId) {
  return readStatus(await getDoc(requestRef(targetId)));
}

function sendRequest(targetId) {
  return setDoc(requestRef(targetId), {
    from: state.currentUserId,
    to: targetId,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}

async function acceptRequest(targetId, username) {
  await updateDoc(requestRef(targetId), {
    status: "accepted",
    acceptedAt: serverTimestamp(),
  });

  triggerNovaAmizade(targetId, username).catch(console.warn);
}

export function deleteRequest(targetId) {
  return deleteDoc(requestRef(targetId));
}

export async function toggleFriendship(status, targetId, username) {
  if (status === "none") await sendRequest(targetId);
  else if (status === "pending_received") await acceptRequest(targetId, username);
  else await deleteRequest(targetId);
}
