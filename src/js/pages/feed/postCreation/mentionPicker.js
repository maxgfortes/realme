import { auth, db } from "../../../../config/config.js";

import {
    collection,
    getDocs,
    getDoc,
    doc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { setupBottomMenu, escapeHTML } from "./bottomMenu.js";

const DEFAULT_PFP = "./public/img/default.jpg";

const CACHE_TTL = 20 * 24 * 60 * 60 * 1000;
const FRIENDS_CACHE_TTL = 5 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = "v1";

const button = document.getElementById("btnMention");
const searchInput = document.getElementById("searchUserMention");
const list = document.getElementById("usersMentionList");

const profileCache = new Map();
const friendsCache = new Map();

const profileRequests = new Map();
const friendsRequests = new Map();

let friends = [];
let confirmed = new Set();
let draft = new Set();

let openGeneration = 0;

function storageKey(type, ownerUid, id = "") {
    return `mentions:${CACHE_VERSION}:${ownerUid}:${type}:${id}`;
}

function readCache(key, memoryCache) {
    const memoryEntry = memoryCache.get(key);

    if (memoryEntry) {
        if (Date.now() < memoryEntry.expiresAt) {
            return memoryEntry.value;
        }

        memoryCache.delete(key);
    }

    try {
        const raw = localStorage.getItem(key);

        if (!raw) return undefined;

        const entry = JSON.parse(raw);

        if (
            !entry ||
            typeof entry.expiresAt !== "number" ||
            !Object.prototype.hasOwnProperty.call(entry, "value")
        ) {
            localStorage.removeItem(key);
            return undefined;
        }

        if (Date.now() >= entry.expiresAt) {
            localStorage.removeItem(key);
            return undefined;
        }

        memoryCache.set(key, entry);

        return entry.value;
    } catch {
        return undefined;
    }
}

function writeCache(key, value, ttl, memoryCache) {
    const entry = {
        value,
        expiresAt: Date.now() + ttl
    };

    memoryCache.set(key, entry);

    try {
        localStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
        console.warn("Não foi possível persistir o cache:", error);
    }

    return value;
}

function normalize(text) {
    return String(text || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
}

function renderMessage(html) {
    list.innerHTML = `<div class="list-empty">${html}</div>`;
}

function render() {
    if (!friends.length) {
        renderMessage("Você ainda não tem amigos para mencionar.");
        return;
    }

    const term = normalize(searchInput.value.trim());

    const visible = friends.filter(friend =>
        normalize(friend.name).includes(term)
    );

    if (!visible.length) {
        renderMessage("Nenhum amigo encontrado.");
        return;
    }

    list.innerHTML = `
        <div class="list-row">
            ${visible.map(friend => `
                <div
                    class="mention-item${draft.has(friend.uid) ? " selected" : ""}"
                    data-uid="${escapeHTML(friend.uid)}"
                >
                    <div class="mention-pfp">
                        <img
                            src="${escapeHTML(friend.photo)}"
                            alt=""
                            loading="lazy"
                        >
                    </div>
                    <div class="mention-name">
                        ${escapeHTML(friend.name)}
                    </div>
                </div>
            `).join("")}
        </div>
    `;
}

function updateButton() {
    if (!button) return;

    const count = confirmed.size;

    button.classList.toggle("has-value", count > 0);

    if (count) {
        button.dataset.count = count;
    } else {
        delete button.dataset.count;
    }
}

async function getProfile(uid, forceRefresh = false) {
    const ownerUid = auth.currentUser?.uid;

    if (!ownerUid || !uid) return null;

    const key = storageKey("profile", ownerUid, uid);

    if (!forceRefresh) {
        const cached = readCache(key, profileCache);

        if (cached !== undefined) {
            return cached;
        }
    }

    if (profileRequests.has(key)) {
        return profileRequests.get(key);
    }

    const request = (async () => {
        try {
            const [userSnap, mediaSnap] = await Promise.all([
                getDoc(doc(db, "users", uid)),
                getDoc(doc(db, "users", uid, "user-infos", "user-media"))
            ]);

            if (auth.currentUser?.uid !== ownerUid) {
                return null;
            }

            if (!userSnap.exists()) {
                return writeCache(
                    key,
                    null,
                    CACHE_TTL,
                    profileCache
                );
            }

            const data = userSnap.data();

            const profile = {
                uid,
                name: `${data.name || ""} ${data.surname || ""}`.trim()
                    || "Usuário",
                photo: (
                    mediaSnap.exists() &&
                    mediaSnap.data().userphoto
                ) || DEFAULT_PFP
            };

            return writeCache(
                key,
                profile,
                CACHE_TTL,
                profileCache
            );
        } catch (error) {
            console.error("Erro ao carregar amigo:", uid, error);
            return null;
        } finally {
            profileRequests.delete(key);
        }
    })();

    profileRequests.set(key, request);

    return request;
}

async function loadFriends(forceRefresh = false) {
    const myUid = auth.currentUser?.uid;

    if (!myUid) return [];

    const key = storageKey("friends", myUid);

    if (!forceRefresh) {
        const cached = readCache(key, friendsCache);

        if (cached !== undefined) {
            return cached;
        }
    }

    if (friendsRequests.has(key)) {
        return friendsRequests.get(key);
    }

    const request = (async () => {
        try {
            const snapshot = await getDocs(
                collection(db, "users", myUid, "friends")
            );

            const profiles = await Promise.all(
                snapshot.docs.map(friendDoc =>
                    getProfile(friendDoc.id, forceRefresh)
                )
            );

            if (auth.currentUser?.uid !== myUid) {
                return [];
            }

            const result = profiles
                .filter(Boolean)
                .sort((a, b) =>
                    a.name.localeCompare(b.name, "pt-BR")
                );

            return writeCache(
                key,
                result,
                FRIENDS_CACHE_TTL,
                friendsCache
            );
        } finally {
            friendsRequests.delete(key);
        }
    })();

    friendsRequests.set(key, request);

    return request;
}

async function onOpen() {
    const generation = ++openGeneration;
    const myUid = auth.currentUser?.uid;

    draft = new Set(confirmed);
    searchInput.value = "";

    if (!myUid) {
        friends = [];
        renderMessage("Faça login para carregar seus amigos.");
        return;
    }

    const key = storageKey("friends", myUid);
    const cached = readCache(key, friendsCache);

    if (cached !== undefined) {
        friends = cached;
        render();

        loadFriends(true)
            .then(updated => {
                if (generation !== openGeneration) return;
                if (auth.currentUser?.uid !== myUid) return;

                friends = updated;
                render();
            })
            .catch(error => {
                console.error(
                    "Erro ao atualizar amigos em background:",
                    error
                );
            });

        return;
    }

    renderMessage(
        '<img src="/public/img/loading.gif" alt="Carregando">'
    );

    try {
        friends = await loadFriends();

        if (generation !== openGeneration) return;
        if (auth.currentUser?.uid !== myUid) return;

        render();
    } catch (error) {
        if (generation !== openGeneration) return;

        console.error("Erro ao carregar amigos:", error);
        renderMessage("Não foi possível carregar seus amigos.");
    }
}

export function invalidateMentionCache(uid = null) {
    const ownerUid = auth.currentUser?.uid;

    if (!ownerUid) return;

    if (uid) {
        const key = storageKey("profile", ownerUid, uid);

        profileCache.delete(key);

        try {
            localStorage.removeItem(key);
        } catch {}

        invalidateMentionCache();

        return;
    }

    const friendsKey = storageKey("friends", ownerUid);

    friendsCache.delete(friendsKey);

    try {
        localStorage.removeItem(friendsKey);
    } catch {}

    const prefix =
        `mentions:${CACHE_VERSION}:${ownerUid}:profile:`;

    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);

            if (key?.startsWith(prefix)) {
                localStorage.removeItem(key);
            }
        }
    } catch {}

    profileCache.clear();
}

export async function refreshMentionFriends() {
    const myUid = auth.currentUser?.uid;

    if (!myUid) return [];

    invalidateMentionCache();

    return loadFriends(true);
}

if (button && searchInput && list) {
    setupBottomMenu({
        trigger: button,
        content: list,
        onOpen,

        onConfirm() {
            confirmed = new Set(draft);
            updateButton();
        }
    });

    searchInput.addEventListener("input", render);

    list.addEventListener("click", event => {
        const item = event.target.closest(".mention-item");

        if (!item) return;

        const uid = item.dataset.uid;

        if (draft.has(uid)) {
            draft.delete(uid);
        } else {
            draft.add(uid);
        }

        item.classList.toggle("selected", draft.has(uid));
    });
}

export function getSelectedMentions() {
    return [...confirmed];
}

export function clearMentions() {
    confirmed = new Set();
    draft = new Set();
    updateButton();
}