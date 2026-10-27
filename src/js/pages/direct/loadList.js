import { t } from "/src/i18n/i18n.js";
import { auth, db } from "../../../config/config.js";

import {
    collection,
    doc,
    getDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import { renderUsers } from "./renderUsers.js";
import { openChat } from "./openChat.js";

const usersList = document.getElementById("dmUsersList");

const messageListeners = new Map();
const userDataCache = new Map();
const DEFAULT_PFP = "./public/img/default.jpg";
const LIST_CACHE_PREFIX = "dmUsersListCache_";
let firstLoad = true;

function listCacheKey() {
    return `${LIST_CACHE_PREFIX}${auth.currentUser?.uid || "anon"}`;
}

function saveListCache(users) {
    try {
        const serializable = users.map(user => ({
            chatId: user.chatId,
            uid: user.uid,
            lastMessage: user.lastMessage,
            lastMessageTime: user.lastMessageTime
                ? user.lastMessageTime.toMillis()
                : null,
            fullName: userDataCache.get(user.uid)?.fullName || "",
            userPfp: userDataCache.get(user.uid)?.userPfp || DEFAULT_PFP
        }));

        localStorage.setItem(
            listCacheKey(),
            JSON.stringify(serializable)
        );
    } catch (error) {
        console.error(error);
    }
}

function loadListCache() {
    try {
        const raw = localStorage.getItem(listCacheKey());

        if (!raw) {
            return null;
        }

        return JSON.parse(raw);
    } catch (error) {
        return null;
    }
}

function renderFromCache() {
    const cachedUsers = loadListCache();

    if (!cachedUsers || cachedUsers.length === 0) {
        return false;
    }

    usersList.innerHTML = "";

    for (const user of cachedUsers) {
        userDataCache.set(user.uid, {
            fullName: user.fullName,
            userPfp: user.userPfp
        });

        renderUsers(
            user.chatId,
            user.uid,
            user.fullName,
            user.userPfp,
            user.lastMessage,
            user.lastMessageTime
                ? formatMessageTime({ toDate: () => new Date(user.lastMessageTime) })
                : "",
            false
        );

        listenLatestMessage(user.chatId);
        refreshUserInBackground(user.uid);
    }

    firstLoad = false;

    return true;
}

function showUsersSkeleton(count = 12) {
    usersList.innerHTML = "";

    for (let i = 0; i < count; i++) {
        const skeleton = document.createElement("div");

        skeleton.className = "user-list-box skeleton-user";

        skeleton.innerHTML = `
            <div class="skeleton-pfp-area">
                <div class="skeleton-avatar"></div>
            </div>

            <div class="skeleton-user-infos">
                <div class="skeleton-name"></div>
                <div class="skeleton-message"></div>
            </div>

            <div class="skeleton-user-more">
                <div class="skeleton-date"></div>
            </div>
        `;

        usersList.appendChild(skeleton);
    }
}

let lastUsers = [];
let saveTimer = null;
const refreshedUsers = new Set();

function scheduleListSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        if (lastUsers.length) saveListCache(lastUsers);
    }, 400);
}

function patchUserInList(uid, data) {
    usersList.querySelectorAll(`.user-list-box[data-uid="${CSS.escape(uid)}"]`).forEach(item => {
        const name = item.querySelector(".user-box-displayname");
        const image = item.querySelector(".user-pfp-area img");

        if (name && name.textContent !== data.fullName) name.textContent = data.fullName;
        if (image && image.getAttribute("src") !== data.userPfp) image.src = data.userPfp;

        item.dataset.name = data.fullName.toLowerCase();
    });
}

function refreshUserInBackground(uid) {
    if (refreshedUsers.has(uid)) return;

    refreshedUsers.add(uid);

    fetchUserData(uid).then(fresh => {
        if (!fresh) return;

        const previous = userDataCache.get(uid);
        userDataCache.set(uid, fresh);

        if (!previous || previous.fullName !== fresh.fullName || previous.userPfp !== fresh.userPfp) {
            patchUserInList(uid, fresh);
            scheduleListSave();
        }
    });
}

async function getUserData(uid) {
    if (userDataCache.has(uid)) {
        refreshUserInBackground(uid);
        return userDataCache.get(uid);
    }

    refreshedUsers.add(uid);
    const fresh = await fetchUserData(uid);
    userDataCache.set(uid, fresh);
    return fresh;
}

async function fetchUserData(uid) {
    try {
        const userRef = doc(db, "users", uid);

        const photoRef = doc(
            db,
            "users",
            uid,
            "user-infos",
            "user-media"
        );

        const [userSnap, photoSnap] = await Promise.all([
            getDoc(userRef),
            getDoc(photoRef)
        ]);

        if (!userSnap.exists()) {
            return null;
        }

        const data = userSnap.data();

        const fullName =
            `${data.name || ""} ${data.surname || ""}`.trim();

        let userPfp = DEFAULT_PFP;

        if (photoSnap.exists()) {
            const photoData = photoSnap.data();

            if (photoData.userphoto) {
                userPfp = photoData.userphoto;
            }
        }

        return {
            fullName,
            userPfp
        };
    } catch (error) {
        console.error(error);
        return null;
    }
}

function animateFlip() {
    const positions = new Map();

    Array.from(usersList.children).forEach((item) => {
        positions.set(
            item.dataset.chatId,
            item.getBoundingClientRect()
        );
    });

    return positions;
}

function finishFlip(firstPositions) {
    Array.from(usersList.children).forEach((item) => {
        const first = firstPositions.get(
            item.dataset.chatId
        );

        if (!first) {
            return;
        }

        const last = item.getBoundingClientRect();

        const deltaY = first.top - last.top;

        if (!deltaY) {
            return;
        }

        item.animate(
            [
                {
                    transform: `translateY(${deltaY}px)`
                },
                {
                    transform: "translateY(0)"
                }
            ],
            {
                duration: 300,
                easing: "cubic-bezier(0.2, 0.8, 0.2, 1)"
            }
        );
    });
}

function updateUnreadState(chatId, latestMessage) {
    const item = usersList.querySelector(
        `[data-chat-id="${chatId}"]`
    );

    if (!item || !auth.currentUser) {
        return;
    }

    const loggedUser = auth.currentUser.uid;

    const unread =
        latestMessage &&
        latestMessage.sender !== loggedUser &&
        latestMessage.read === false;

    const lastMessage = item.querySelector(".last-msg");

    const userName = item.querySelector(".user-box-displayname");

    const dot = item.querySelector(".new-msg-dot");

    if (lastMessage) {
        lastMessage.classList.toggle(
            "active",
            unread
        );
    }

    if (userName) {
        userName.classList.toggle(
            "active",
            unread
        );
    }

    if (dot) {
        dot.classList.toggle(
            "active",
            unread
        );
    }
}

function listenLatestMessage(chatId) {
    if (messageListeners.has(chatId)) {
        return;
    }

    const messagesRef = collection(
        db,
        "chats",
        chatId,
        "messages"
    );

    const messagesQuery = query(
        messagesRef,
        orderBy("timestamp", "desc"),
        limit(1)
    );

    const unsubscribe = onSnapshot(
        messagesQuery,
        (snapshot) => {
            if (snapshot.empty) {
                updateUnreadState(chatId, null);
                return;
            }

            const messageDoc = snapshot.docs[0];

            updateUnreadState(
                chatId,
                {
                    id: messageDoc.id,
                    ...messageDoc.data()
                }
            );
        },
        (error) => {
            console.error(
                error
            );
        }
    );

    messageListeners.set(
        chatId,
        unsubscribe
    );
}

async function createUserItem(user) {
    try {
        const userData = await getUserData(user.uid);

        if (!userData) {
            return;
        }

        const existing = usersList.querySelector(
            `[data-chat-id="${user.chatId}"]`
        );

        if (existing) {
            return;
        }

        renderUsers(
            user.chatId,
            user.uid,
            userData.fullName,
            userData.userPfp,
            user.lastMessage,
            formatMessageTime(user.lastMessageTime),
            false
        );

        listenLatestMessage(user.chatId);
    } catch (error) {
        console.error(
            error
        );
    }
}

async function loadUsers(snapshot) {
    const loggedUser = auth.currentUser.uid;

    const users = [];

    snapshot.forEach((chatDoc) => {
        const data = chatDoc.data();

        const otherUser = data.participants?.find(
            uid => uid !== loggedUser
        );

        if (!otherUser) {
            return;
        }

        users.push({
            chatId: chatDoc.id,
            uid: otherUser,
            lastMessageTime: data.lastMessageTime || null,
            lastMessage: data.lastMessage || ""
        });
    });

    users.sort((a, b) => {
        const timeA = a.lastMessageTime
            ? a.lastMessageTime.toMillis()
            : 0;

        const timeB = b.lastMessageTime
            ? b.lastMessageTime.toMillis()
            : 0;

        return timeB - timeA;
    });

    lastUsers = users;

    const activeChats = new Set(users.map(user => user.chatId));

    usersList.querySelectorAll(".user-list-box").forEach(item => {
        if (activeChats.has(item.dataset.chatId)) return;

        messageListeners.get(item.dataset.chatId)?.();
        messageListeners.delete(item.dataset.chatId);
        item.remove();
    });

    if (firstLoad) {
        firstLoad = false;
        usersList.innerHTML = "";

        await Promise.allSettled(
            users.map(user => createUserItem(user))
        );

        const order = new Map(
            users.map(user => [
                user.chatId,
                user.lastMessageTime
                    ? user.lastMessageTime.toMillis()
                    : 0
            ])
        );

        const items = Array.from(
            usersList.children
        );

        items.sort((a, b) => {
            const timeA =
                order.get(a.dataset.chatId) || 0;

            const timeB =
                order.get(b.dataset.chatId) || 0;

            return timeB - timeA;
        });

        items.forEach(item => {
            usersList.appendChild(item);
        });

        saveListCache(users);

        return;
    }

    const firstPositions = animateFlip();

    for (const user of users) {
        const existing = usersList.querySelector(
            `[data-chat-id="${user.chatId}"]`
        );

        if (existing) {
            const lastMessage =
                existing.querySelector(".last-msg");

            const messageTime =
                existing.querySelector(
                    ".user-list-box-date"
                );

            if (lastMessage) {
                lastMessage.textContent =
                    user.lastMessage;
            }

            if (messageTime) {
                messageTime.textContent =
                    formatMessageTime(
                        user.lastMessageTime
                    );
            }

            listenLatestMessage(user.chatId);

            continue;
        }

        await createUserItem(user);
    }

    const order = new Map(
        users.map(user => [
            user.chatId,
            user.lastMessageTime
                ? user.lastMessageTime.toMillis()
                : 0
        ])
    );

    const items = Array.from(
        usersList.children
    );

    items.sort((a, b) => {
        const timeA =
            order.get(a.dataset.chatId) || 0;

        const timeB =
            order.get(b.dataset.chatId) || 0;

        return timeB - timeA;
    });

    items.forEach(item => {
        usersList.appendChild(item);
    });

    finishFlip(firstPositions);

    saveListCache(users);
}

export function formatMessageTime(timestamp) {
    if (!timestamp) {
        return "";
    }

    const date = timestamp.toDate();
    const now = new Date();

    const difference = Math.floor(
        (now - date) / 1000
    );

    if (difference < 60) {
        return t("time.now").replace(/^./, c => c.toUpperCase());
    }

    const minutes = Math.floor(
        difference / 60
    );

    if (minutes < 60) {
        return `${minutes}m`;
    }

    const hours = Math.floor(
        minutes / 60
    );

    if (hours < 24) {
        return `${hours}h`;
    }

    const days = Math.floor(
        hours / 24
    );

    if (days < 7) {
        return `${days}d`;
    }

    const currentYear =
        now.getFullYear();

    const messageYear =
        date.getFullYear();

    if (messageYear < currentYear) {
        const day = String(
            date.getDate()
        ).padStart(2, "0");

        const month = String(
            date.getMonth() + 1
        ).padStart(2, "0");

        const year = String(
            messageYear
        ).slice(-2);

        return `${day}/${month}/${year}`;
    }

    const months = [
        "jan",
        "fev",
        "mar",
        "abr",
        "mai",
        "jun",
        "jul",
        "ago",
        "set",
        "out",
        "nov",
        "dez"
    ];

    return `${date.getDate()} ${months[date.getMonth()]}`;
}

const chatsRef = collection( db, "chats" );

onAuthStateChanged(
    auth,
    (user) => {
        if (!user) {
            return;
        }

        firstLoad = true;

        const hasCache = renderFromCache();

        if (!hasCache) {
            showUsersSkeleton();
        }

        const chatsQuery = query(
            chatsRef,
            where(
                "participants",
                "array-contains",
                user.uid
            )
        );

        onSnapshot(
            chatsQuery,
            (snapshot) => {
                loadUsers(snapshot);
            },
            (error) => {
                console.error(
                    error
                );
            }
        );
    }
);

usersList.addEventListener(
    "click",
    (event) => {
        const user = event.target.closest(".user-list-box");

        if (!user) { return;}

        openChat(user);
    }
);