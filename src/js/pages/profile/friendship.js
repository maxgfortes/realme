import { t } from "/src/i18n/i18n.js";
import { onSnapshot } from "./firestore.js";
import { $ } from "./dom.js";
import { state, unsubscribers } from "./state.js";
import { requestRef, readStatus, toggleFriendship } from "./friendRequests.js";
import { confirmAlert } from "./confirmAlert.js";

const LABELS = {
  none: t("common.add"),
  pending_sent: t("friendship.pendingSent"),
  pending_received: t("friendship.acceptRequest"),
  friends: t("common.friends"),
};

const PRIMARY_STATUSES = ["none", "pending_received"];

let currentStatus = "none";

function renderFriendButton() {
  const button = $("sendRequestBtn");
  button.textContent = LABELS[currentStatus];
  button.classList.toggle("primary", PRIMARY_STATUSES.includes(currentStatus));
}

export async function handleFriendButton() {
  if (currentStatus === "friends") {
    const confirmed = await confirmAlert({
      title: t("friendship.undoTitle"),
      text: t("friendship.undoText"),
      confirmLabel: t("friendship.undo"),
    });

    if (!confirmed) return;
  }

  const username = state.profileData.user.username || state.profileUserId;
  return toggleFriendship(currentStatus, state.profileUserId, username);
}

export function watchFriendship(uid) {
  if (state.isOwnProfile || !state.currentUserId) return;

  const stop = onSnapshot(requestRef(uid), snapshot => {
    currentStatus = readStatus(snapshot);
    renderFriendButton();
  });

  unsubscribers.push(stop);
}