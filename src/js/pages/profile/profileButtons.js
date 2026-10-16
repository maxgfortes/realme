import { $, select } from "./dom.js";
import { state } from "./state.js";
import { startChat } from "./chat.js";
import { shareProfile } from "./share.js";
import { handleFriendButton } from "./friendship.js";

export function setupProfileButtons() {
  const loggedIn = Boolean(state.currentUserId);

  $("actBtnsVisitor").classList.toggle("hidden", !loggedIn || state.isOwnProfile);
  $("actBtnsOwner").classList.toggle("hidden", !state.isOwnProfile);
  select(".navbar-bottom").classList.toggle("hidden", !state.isOwnProfile);
  document.body.classList.toggle("no-navbar-bottom", !state.isOwnProfile);
}

$("sendRequestBtn").addEventListener("click", handleFriendButton);
$("sendMessageBtn").addEventListener("click", () => startChat(state.profileUserId));
$("shareProfile").addEventListener("click", () => shareProfile(state.currentUsername));
