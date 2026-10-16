import { auth, db } from "../../config/config.js";

import {
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    collection,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const STORAGE_KEY = "shownNotifications";
const DEFAULT_PFP = "./public/img/default.jpg";
const SHOW_TIME = 5000;
const EXIT_TIME = 600;
const BACKLOG_WAIT = 700;
const SWIPE_UP_MIN = 30;

let queue = [];
let current = null;
let backlog = [];
let backlogTimer = null;
let chatsUnsub = null;
let chatUnsubs = {};
const userCache = {};

function getShown() {
    try {
        return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY)) || []);
    } catch {
        return new Set();
    }
}

function markShown(id) {
    const shown = getShown();
    shown.add(id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...shown].slice(-300)));
}

async function getUser(uid) {
    if (!uid) {
        return { name: "Usuário", pfp: DEFAULT_PFP };
    }

    if (userCache[uid]) return userCache[uid];

    let data = {};
    let media = {};

    try {
        const [userSnap, mediaSnap] = await Promise.all([
            getDoc(doc(db, "users", uid)),
            getDoc(doc(db, "users", uid, "user-infos", "user-media"))
        ]);

        if (userSnap.exists()) data = userSnap.data();
        if (mediaSnap.exists()) media = mediaSnap.data();
    } catch (e) {
        console.error("Erro ao buscar usuário:", e);
    }

    const fullName = `${data.name || ""} ${data.surname || ""}`.trim();

    userCache[uid] = {
        name: fullName || "Usuário",
        pfp: media.userphoto || DEFAULT_PFP
    };

    return userCache[uid];
}

function createBanner({ user, text, chatId }) {

    const area = document.createElement("div");
    area.className = "notification-item-area";

    const link = document.createElement("a");
    link.className = "notification-item";
    link.href = "./direct.html?chatid=" + encodeURIComponent(chatId);

    const pfpArea = document.createElement("div");
    pfpArea.className = "notification-item-pfp-area";

    const img = document.createElement("img");
    img.src = user.pfp;
    pfpArea.appendChild(img);

    const body = document.createElement("div");
    body.className = "notification-body";

    const title = document.createElement("div");
    title.className = "notification-title";
    title.textContent = user.name;

    const content = document.createElement("div");
    content.className = "notification-content";
    content.textContent = text;

    body.append(title, content);
    link.append(pfpArea, body);
    area.appendChild(link);

    return area;
}

function clearCurrent() {
    if (!current) return;

    current.timers.forEach(clearTimeout);
    current.el.remove();
    current = null;
}

function dismiss(el) {
    if (!current || current.el !== el || current.dismissing) return;

    current.dismissing = true;

    const timers = current.timers;
    timers.forEach(clearTimeout);
    timers.length = 0;

    el.classList.remove("active");

    timers.push(setTimeout(function() {
        el.remove();
        if (current && current.el === el) current = null;
        showNext();
    }, EXIT_TIME));
}

function bindSwipeUp(el, link) {
    let startX = null;
    let startY = null;
    let swiped = false;

    el.style.touchAction = "none";
    link.draggable = false;

    el.addEventListener("pointerdown", function(e) {
        startX = e.clientX;
        startY = e.clientY;
        swiped = false;
    });

    el.addEventListener("pointermove", function(e) {
        if (startY === null || swiped) return;

        const up = startY - e.clientY;
        const side = Math.abs(e.clientX - startX);

        if (up > SWIPE_UP_MIN && up > side) {
            swiped = true;
            dismiss(el);
        }
    });

    const reset = function() {
        startX = null;
        startY = null;
    };

    el.addEventListener("pointerup", reset);
    el.addEventListener("pointercancel", reset);

    el.addEventListener("click", function(e) {
        if (swiped) {
            e.preventDefault();
            swiped = false;
        }
    });
}

async function show(item) {

    const user = await getUser(item.sender);

    clearCurrent();

    const el = createBanner({ user, text: item.text, chatId: item.chatId });
    document.body.appendChild(el);

    const timers = [];
    current = { el, timers, dismissing: false };

    markShown(item.id);

    void el.offsetWidth;
    requestAnimationFrame(function() {
        el.classList.add("active");
    });

    bindSwipeUp(el, el.querySelector(".notification-item"));

    timers.push(setTimeout(function() {
        dismiss(el);
    }, SHOW_TIME));
}

function showNext() {
    if (queue.length === 0) return;
    show(queue.shift());
}

function addBacklog(items) {
    backlog.push(...items);

    clearTimeout(backlogTimer);
    backlogTimer = setTimeout(function() {
        backlogTimer = null;

        queue = queue.concat(backlog).sort((a, b) => a.timestamp - b.timestamp);
        backlog = [];

        if (!current) showNext();
    }, BACKLOG_WAIT);
}

function listenChat(chatId, myUid) {

    let initial = true;

    const messagesQuery = query(
        collection(db, "chats", chatId, "messages"),
        orderBy("timestamp", "desc"),
        limit(30)
    );

    return onSnapshot(
        messagesQuery,
        function(snapshot) {

            const shown = getShown();
            const items = [];

            snapshot.docChanges().forEach(function(change) {

                if (change.type !== "added") return;

                const data = change.doc.data();

                if (!data.sender) return;
                if (data.sender === myUid) return;
                if (data.read !== false) return;
                if (shown.has(change.doc.id)) return;

                items.push({
                    id: change.doc.id,
                    chatId: chatId,
                    sender: data.sender,
                    text: data.text || data.message || data.content || "",
                    timestamp: data.timestamp?.toMillis?.() || 0
                });

            });

            items.sort((a, b) => a.timestamp - b.timestamp);

            if (initial) {
                initial = false;
                addBacklog(items);
                return;
            }

            if (items.length === 0) return;

            if (backlogTimer) {
                addBacklog(items);
            } else {
                queue = [];
                show(items[items.length - 1]);
            }

        },
        function(error) {
            console.error("Erro no chat " + chatId + ":", error);
        }
    );
}

function listen(myUid) {

    const chatsQuery = query(
        collection(db, "chats"),
        where("participants", "array-contains", myUid)
    );

    chatsUnsub = onSnapshot(
        chatsQuery,
        function(snapshot) {

            snapshot.docChanges().forEach(function(change) {

                const chatId = change.doc.id;

                if (change.type === "added" && !chatUnsubs[chatId]) {
                    chatUnsubs[chatId] = listenChat(chatId, myUid);
                }

                if (change.type === "removed" && chatUnsubs[chatId]) {
                    chatUnsubs[chatId]();
                    delete chatUnsubs[chatId];
                }

            });

        },
        function(error) {
            console.error("Erro ao buscar chats:", error);
        }
    );
}

function stopAll() {

    if (chatsUnsub) {
        chatsUnsub();
        chatsUnsub = null;
    }

    Object.values(chatUnsubs).forEach(function(unsub) {
        unsub();
    });
    chatUnsubs = {};

    clearTimeout(backlogTimer);
    backlogTimer = null;
    backlog = [];
    queue = [];

    clearCurrent();
}

onAuthStateChanged(auth, function(user) {

    stopAll();

    if (user) {
        listen(user.uid);
    }

});