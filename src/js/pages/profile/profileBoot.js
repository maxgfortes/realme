import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { state, createEmptyProfileData } from "./state.js";
import { LOGIN_PAGE } from "./constants.js";
import { getCurrentUsername } from "./userData.js";
import { resolveProfileUid, hasProfileInUrl, getCachedProfileUid } from "./profileResolver.js";
import { loadProfileCache, saveOwnUid } from "./profileCache.js";
import { renderProfile } from "./profileRender.js";
import { renderAuthMenu } from "./auth.js";
import { setupProfileButtons } from "./profileButtons.js";
import { setupAboutPermissions } from "./aboutMenu.js";
import { watchProfile } from "./profileListeners.js";
import { watchFriendship } from "./friendship.js";
import { loadPostStats } from "./profileStats.js";
import { loadPostsGrid } from "./postsGrid.js";
import { loadWall } from "./wall.js";
import { showProfileNotFound } from "./profileNotFound.js";

function renderCachedProfile() {
  const uid = getCachedProfileUid();
  const cached = uid ? loadProfileCache(uid) : null;
  if (!cached) return;

  state.profileUserId = uid;
  state.profileData = { ...createEmptyProfileData(), ...cached };
  state.profileUsername = state.profileData.user.username || "";
  renderProfile(state.profileData);
}

async function openProfile(uid) {
  if (state.profileUserId !== uid) state.profileData = createEmptyProfileData();

  state.profileUserId = uid;
  state.isOwnProfile = uid === state.currentUserId;

  setupProfileButtons();
  setupAboutPermissions();

  watchProfile(uid);
  watchFriendship(uid);
  loadWall(uid);
  loadPostsGrid(uid);
  await loadPostStats(uid);
}

async function handleAuthChange(user) {
  state.currentUserId = user ? user.uid : null;
  state.currentUsername = user ? await getCurrentUsername(user.uid) : "";
  if (user) saveOwnUid(user.uid);
  renderAuthMenu();

  const uid = await resolveProfileUid();

  if (uid) await openProfile(uid);
  else if (hasProfileInUrl()) showProfileNotFound();
  else location.replace(LOGIN_PAGE);
}

export function startProfile() {
  renderCachedProfile();
  onAuthStateChanged(auth, handleAuthChange);
}
