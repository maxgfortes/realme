import { t } from "/src/i18n/i18n.js";
import { app, auth, db } from "../../../config/config.js";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    where,
    orderBy,
    limit,
    startAt,
    endAt
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { getUserSummary, peekUserSummary } from "/src/shared/userSummary.js";
import { openChatById, closeActiveChat } from "./openChat.js";

const functions = getFunctions(app, "us-central1");
const createGroupCall = httpsCallable(functions, "createGroupChat");
const leaveGroupCall = httpsCallable(functions, "leaveGroupChat");

const MAX_FRIENDS = 100;
const SEARCH_LIMIT = 15;
const DEFAULT_PHOTO = "./public/img/default.jpg";

const composeButton = document.getElementById("dmComposeBtn");
const sheet = document.getElementById("composeSheet");
const searchInput = document.getElementById("composeSearch");
const chips = document.getElementById("composeChips");
const results = document.getElementById("composeResults");
const hint = document.getElementById("composeHint");
const groupName = document.getElementById("composeGroupName");
const actionButton = document.getElementById("composeAction");

const infoButton = document.getElementById("dmGroupInfoBtn");
const infoSheet = document.getElementById("groupInfoSheet");
const infoTitle = document.getElementById("groupInfoTitle");
const infoCount = document.getElementById("groupInfoCount");
const infoMembers = document.getElementById("groupInfoMembers");
const leaveButton = document.getElementById("groupLeaveBtn");

let friends = [];
let friendIds = new Set();
let selected = new Map();
let searchToken = 0;
let searchTimer = null;
let busy = false;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function normalize(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function openSheet(element) {
    element.hidden = false;
    requestAnimationFrame(() => element.classList.add("active"));
}

function closeSheet(element) {
    element.classList.remove("active");
    setTimeout(() => {
        if (!element.classList.contains("active")) element.hidden = true;
    }, 260);
}

async function loadFriends() {
    const me = auth.currentUser?.uid;
    if (!me) return;

    const snap = await getDocs(collection(db, "users", me, "friends"));
    friendIds = new Set(snap.docs.map(friendDoc => friendDoc.id));

    friends = await Promise.all([...friendIds].map(getUserSummary));
    friends.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

function personHTML(person, { friend }) {
    const isSelected = selected.has(person.uid);

    return `
        <button class="compose-person${isSelected ? " selected" : ""}" type="button" data-uid="${escapeHTML(person.uid)}" data-friend="${friend ? "1" : ""}">
            <span class="compose-person-pfp" data-presence-uid="${escapeHTML(person.uid)}"><img src="${escapeHTML(person.photo || DEFAULT_PHOTO)}" alt=""></span>
            <span class="compose-person-info">
                <span class="compose-person-name">${escapeHTML(person.name || person.username || t("common.user"))}</span>
                <span class="compose-person-user">${person.username ? `@${escapeHTML(person.username)}` : ""}</span>
            </span>
            ${friend ? '<span class="compose-check" aria-hidden="true"></span>' : ""}
        </button>
    `;
}

function renderChips() {
    chips.innerHTML = [...selected.values()].map(person => `
        <button class="compose-chip" type="button" data-uid="${escapeHTML(person.uid)}">${escapeHTML((person.name || person.username || "").split(" ")[0])}</button>
    `).join("");
}

function updateAction() {
    const count = selected.size;

    actionButton.disabled = count === 0 || busy;
    actionButton.textContent = count >= 2 ? t("dm.createGroup") : t("dm.chat");
    groupName.hidden = count < 2;

    hint.textContent = count >= 2
        ? t("dm.groupCount", { count, max: MAX_FRIENDS })
        : "";
}

async function searchUsers(term) {
    const key = normalize(term).replace(/[^a-z0-9_]/g, "");
    if (key.length < 2) return [];

    const snap = await getDocs(query(
        collection(db, "users"),
        orderBy("username"),
        startAt(key),
        endAt(`${key}`),
        limit(SEARCH_LIMIT)
    ));

    const me = auth.currentUser?.uid;

    return Promise.all(snap.docs
        .filter(userDoc => userDoc.id !== me)
        .map(userDoc => getUserSummary(userDoc.id)));
}

async function renderResults() {
    const term = searchInput.value.trim();
    const token = ++searchToken;
    const key = normalize(term);

    const matchingFriends = key
        ? friends.filter(person => normalize(person.name).includes(key) || normalize(person.username).includes(key))
        : friends;

    let html = matchingFriends.length
        ? `<div class="compose-section">${escapeHTML(t("dm.friends"))}</div>${matchingFriends.map(person => personHTML(person, { friend: true })).join("")}`
        : "";

    results.innerHTML = html || (key ? "" : `<div class="compose-empty">${escapeHTML(t("dm.noFriends"))}</div>`);

    if (key.length < 2) return;

    let others = [];

    try {
        others = (await searchUsers(term)).filter(person => !friendIds.has(person.uid));
    } catch (error) {
        console.error("Erro ao buscar usuários:", error);
    }

    if (token !== searchToken) return;

    if (others.length) {
        html += `<div class="compose-section">${escapeHTML(t("dm.others"))}</div>${others.map(person => personHTML(person, { friend: false })).join("")}`;
    }

    results.innerHTML = html || `<div class="compose-empty">${escapeHTML(t("dm.noResults"))}</div>`;
}

async function ensureDirectChat(otherUid) {
    const me = auth.currentUser.uid;
    const participants = [me, otherUid].sort();
    const chatId = `chat-${participants.join("-")}`;
    const ref = doc(db, "chats", chatId);

    const snap = await getDoc(ref);

    if (!snap.exists()) {
        await setDoc(ref, {
            participants,
            createdAt: new Date(),
            lastMessage: "",
            lastMessageTime: null
        });
    }

    return chatId;
}

async function startDirect(uid) {
    if (busy) return;
    busy = true;
    updateAction();

    try {
        const chatId = await ensureDirectChat(uid);
        closeSheet(sheet);
        openChatById(chatId);
    } catch (error) {
        console.error("Erro ao abrir conversa:", error);
        hint.textContent = t("dm.composeError");
    } finally {
        busy = false;
        updateAction();
    }
}

async function submit() {
    if (!selected.size || busy) return;

    if (selected.size === 1) {
        await startDirect([...selected.keys()][0]);
        return;
    }

    busy = true;
    updateAction();

    try {
        const { data } = await createGroupCall({
            name: groupName.value.trim(),
            members: [...selected.keys()]
        });

        closeSheet(sheet);
        openChatById(data.chatId);
    } catch (error) {
        console.error("Erro ao criar grupo:", error);
        hint.textContent = error?.message === "ONLY_FRIENDS" ? t("dm.onlyFriends") : t("dm.composeError");
    } finally {
        busy = false;
        updateAction();
    }
}

function toggle(uid) {
    if (selected.has(uid)) {
        selected.delete(uid);
    } else {
        if (selected.size >= MAX_FRIENDS) {
            hint.textContent = t("dm.groupLimit", { max: MAX_FRIENDS });
            return;
        }

        selected.set(uid, peekUserSummary(uid) || friends.find(person => person.uid === uid) || { uid });
    }

    results.querySelectorAll(`.compose-person[data-uid="${CSS.escape(uid)}"]`)
        .forEach(item => item.classList.toggle("selected", selected.has(uid)));

    renderChips();
    updateAction();
}

async function openComposer() {
    selected = new Map();
    searchInput.value = "";
    groupName.value = "";
    hint.textContent = "";
    renderChips();
    updateAction();

    results.innerHTML = `<div class="loading-gif-area"><img class="loading-gif" src="/public/img/loading.gif" alt=""></div>`;
    openSheet(sheet);

    try {
        await loadFriends();
    } catch (error) {
        console.error("Erro ao carregar amigos:", error);
    }

    renderResults();
}

async function openGroupInfo() {
    const chatArea = document.getElementById("dmChatArea");
    const chatId = chatArea?.dataset.chatId;

    if (!chatId || chatArea.dataset.group !== "1") return;

    infoTitle.textContent = document.querySelector("#dmChatUserName .dm-group-title")?.textContent || t("dm.group");
    infoMembers.innerHTML = `<div class="loading-gif-area"><img class="loading-gif" src="/public/img/loading.gif" alt=""></div>`;
    infoCount.textContent = "";
    leaveButton.hidden = false;
    openSheet(infoSheet);

    try {
        const snap = await getDoc(doc(db, "chats", chatId));
        const data = snap.data() || {};
        const participants = data.participants || [];
        const admins = new Set(data.admins || []);

        infoCount.textContent = t("dm.members", { count: participants.length });
        leaveButton.textContent = data.isEvent ? t("dm.leaveEventGroup") : t("dm.leaveGroup");

        const people = await Promise.all(participants.map(getUserSummary));

        infoMembers.innerHTML = people.map(person => `
            <a class="compose-person" href="/profile.html?uid=${encodeURIComponent(person.uid)}">
                <span class="compose-person-pfp" data-presence-uid="${escapeHTML(person.uid)}"><img src="${escapeHTML(person.photo || DEFAULT_PHOTO)}" alt=""></span>
                <span class="compose-person-info">
                    <span class="compose-person-name">${escapeHTML(person.name || t("common.user"))}</span>
                    <span class="compose-person-user">${admins.has(person.uid) ? escapeHTML(t("dm.admin")) : person.username ? `@${escapeHTML(person.username)}` : ""}</span>
                </span>
            </a>
        `).join("");
    } catch (error) {
        console.error("Erro ao carregar grupo:", error);
        infoMembers.innerHTML = `<div class="compose-empty">${escapeHTML(t("dm.composeError"))}</div>`;
    }
}

async function leaveGroup() {
    const chatId = document.getElementById("dmChatArea")?.dataset.chatId;
    if (!chatId || busy) return;

    busy = true;
    leaveButton.disabled = true;

    try {
        await leaveGroupCall({ chatId });
        closeSheet(infoSheet);
        closeActiveChat();
    } catch (error) {
        console.error("Erro ao sair do grupo:", error);
        infoCount.textContent = t("dm.composeError");
    } finally {
        busy = false;
        leaveButton.disabled = false;
    }
}

if (sheet && composeButton) {
    composeButton.addEventListener("click", openComposer);

    sheet.querySelectorAll("[data-sheet-close]").forEach(button => button.addEventListener("click", () => closeSheet(sheet)));

    searchInput.addEventListener("input", () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(renderResults, 220);
    });

    results.addEventListener("click", event => {
        const person = event.target.closest(".compose-person");
        if (!person) return;

        if (person.dataset.friend === "1") toggle(person.dataset.uid);
        else startDirect(person.dataset.uid);
    });

    chips.addEventListener("click", event => {
        const chip = event.target.closest(".compose-chip");
        if (chip) toggle(chip.dataset.uid);
    });

    actionButton.addEventListener("click", submit);
}

if (infoSheet && infoButton) {
    infoButton.addEventListener("click", openGroupInfo);
    infoSheet.querySelectorAll("[data-sheet-close]").forEach(button => button.addEventListener("click", () => closeSheet(infoSheet)));
    leaveButton.addEventListener("click", leaveGroup);
}
