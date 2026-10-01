import { db } from "./firebase.js";
import { doc, collection, onSnapshot } from "./firestore.js";
import { state, unsubscribers, stopListeners } from "./state.js";
import {
  renderUsername, renderName, renderVerified, renderPronouns, renderPfp, renderBanner, renderBio,
} from "./profileHeader.js";
import { updateStat } from "./profileStats.js";
import { renderLinks } from "./links.js";
import { renderAboutMenu } from "./aboutRender.js";
import { scheduleProfileCacheSave } from "./profileCache.js";
import { renderMusic } from "./profileMusic.js";

function watchDocument(ref, onData) {
  const stop = onSnapshot(ref, snapshot => {
    onData(snapshot.exists() ? snapshot.data() : {});
    scheduleProfileCacheSave();
  });
  unsubscribers.push(stop);
}

function infoDoc(uid, name) {
  return doc(db, "users", uid, "user-infos", name);
}

function handleUser(user) {
  state.profileData.user = user;
  state.profileUsername = user.username || "";
  renderUsername(user);
  renderName(user);
  renderVerified(user);
  renderAboutMenu();
}

function handleMedia(media) {
  state.profileData.media = media;
  renderPfp(media);
  renderBanner(media);
  renderMusic(media);
}

function handleAbout(about) {
  state.profileData.about = about;
  renderPronouns(about);
  renderAboutMenu();
}

function handleLikes(likes) {
  state.profileData.likes = likes;
  renderAboutMenu();
}

function handleMoreInfos(moreInfos) {
  state.profileData.moreInfos = moreInfos;
  renderBio(moreInfos);
}

function handleLinks(links) {
  state.profileData.links = links;
  renderLinks(links);
}

function watchFriendsCount(uid) {
  const stop = onSnapshot(collection(db, "users", uid, "friends"), snapshot => {
    updateStat("friends", snapshot.size);
  });
  unsubscribers.push(stop);
}

export function watchProfile(uid) {
  stopListeners();

  watchDocument(doc(db, "users", uid), handleUser);
  watchDocument(infoDoc(uid, "user-media"), handleMedia);
  watchDocument(infoDoc(uid, "about"), handleAbout);
  watchDocument(infoDoc(uid, "likes"), handleLikes);
  watchDocument(infoDoc(uid, "more-infos"), handleMoreInfos);
  watchDocument(infoDoc(uid, "links"), handleLinks);
  watchFriendsCount(uid);
}
