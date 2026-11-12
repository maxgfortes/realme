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
import { loadPostStats, updateStat } from "./profileStats.js";
import { loadPostsGrid, seedPostsGrid, refreshFirstPage } from "./postsGrid.js";
import { loadWall, renderCachedWall } from "./wall.js";
import { fetchProfileContent, readContentCache, writeContentCache } from "./profileApi.js";
import { openPublicProfile } from "./publicProfile.js";
import { showProfileNotFound } from "./profileNotFound.js";
import { stopMusic } from "./profileMusic.js";
import { initProfileEvents } from "./profileEvents.js";
import { applyProfileTheme } from "/src/shared/profileThemes.js";
import { watchNowPlaying, setSpotifyViewer } from "./spotify.js";
import { watchPsn, setPsnViewer } from "./psn.js";

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
  if (state.profileUserId !== uid) {
    state.profileData = createEmptyProfileData();
    applyProfileTheme(null);
    stopMusic();
  }

  state.profileUserId = uid;
  state.isOwnProfile = uid === state.currentUserId;

  setupProfileButtons();
  setupAboutPermissions();

  watchProfile(uid);
  watchNowPlaying(uid);
  watchPsn(uid);
  watchFriendship(uid);

  const cached = readContentCache(uid);
  const content = fetchProfileContent({ uid }).then(result => {
    writeContentCache(uid, result);
    return result;
  });

  content.catch(error => console.warn("Perfil pelo servidor indisponível:", error));

  loadWall(uid, content.then(result => result.wall));
  if (cached?.wall) renderCachedWall(uid, cached.wall);

  loadPostsGrid(uid);
  seedPostsGrid(uid, cached?.posts ? Promise.resolve(cached) : content);
  if (cached?.posts) content.then(result => refreshFirstPage(uid, result)).catch(() => {});

  initProfileEvents({ profileUid: uid, isOwner: state.isOwnProfile })
    .catch(err => console.error("Erro ao carregar eventos:", err));

  if (state.isOwnProfile) {
    await loadPostStats(uid);
    return;
  }

  const applyStats = result => {
    if (state.profileUserId !== uid || !result?.profile?.stats) return;
    updateStat("posts", result.profile.stats.posts);
    updateStat("photos", result.profile.stats.photos);
  };

  if (cached?.profile) applyStats(cached);
  await content.then(applyStats).catch(() => loadPostStats(uid));
}

async function handleAuthChange(user) {
  state.currentUserId = user ? user.uid : null;
  state.currentUsername = user ? await getCurrentUsername(user.uid) : "";
  if (user) saveOwnUid(user.uid);
  setSpotifyViewer(state.currentUserId);
  setPsnViewer(state.currentUserId);
  renderAuthMenu();

  if (!user && hasProfileInUrl()) {
    await openPublicProfile();
    return;
  }

  document.body.classList.remove("public-profile");

  const uid = await resolveProfileUid();

  if (uid) await openProfile(uid);
  else if (hasProfileInUrl()) showProfileNotFound();
  else location.replace(LOGIN_PAGE);
}

export function startProfile() {
  renderCachedProfile();
  onAuthStateChanged(auth, handleAuthChange);
}