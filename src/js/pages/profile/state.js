export function createEmptyProfileData() {
  return {
    user: {},
    media: {},
    about: {},
    likes: {},
    moreInfos: {},
    links: {},
    stats: { friends: 0, posts: 0, photos: 0 },
  };
}

export const state = {
  currentUserId: null,
  currentUsername: "",
  profileUserId: null,
  profileUsername: "",
  isOwnProfile: false,
  profileData: createEmptyProfileData(),
};

export const unsubscribers = [];

export function stopListeners() {
  unsubscribers.forEach(unsubscribe => unsubscribe());
  unsubscribers.length = 0;
}
