import { t } from "/src/i18n/i18n.js";
import { db } from "./firebase.js";
import { doc, getDoc } from "./firestore.js";
import { onSavedChange } from "/src/shared/savedPosts.js";
import { createPostPreview } from "./postPreview.js";
import { openProfileTimeline } from "./timeline.js";

const PAGE_SIZE = 18;

const panel = document.querySelector("[data-saved-panel]");
const grid = document.getElementById("savedGrid");
const sentinel = document.getElementById("savedSentinel");

const postCache = new Map();

let savedIds = [];
let shownIds = [];
let loadedPosts = [];
let loading = false;
let session = 0;
let observer = null;

function isOpen() {
    return panel?.classList.contains("active");
}

function fetchPost(postId) {
    if (!postCache.has(postId)) {
        postCache.set(postId, getDoc(doc(db, "posts", postId))
            .then(snap => {
                if (!snap.exists()) return null;

                const data = snap.data();

                return data.visible === false ? null : { id: postId, userid: data.creatorid || "", data };
            })
            .catch(() => {
                postCache.delete(postId);
                return null;
            }));
    }

    return postCache.get(postId);
}

function emptyState() {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `<h3>${t("saved.emptyTitle")}</h3><p>${t("saved.emptyText")}</p>`;
    return empty;
}

function gridItem(post) {
    const item = createPostPreview(post.data);
    item.dataset.postId = post.id;
    item.addEventListener("click", () => {
        const index = loadedPosts.findIndex(loaded => loaded.id === post.id);
        openProfileTimeline([...loadedPosts], Math.max(0, index), "", t("saved.title"));
    });
    return item;
}

async function loadMore() {
    if (loading || !grid) return;

    const pending = savedIds.filter(id => !shownIds.includes(id)).slice(0, PAGE_SIZE);

    if (!pending.length) {
        if (!loadedPosts.length && !grid.querySelector(".empty-state")) {
            grid.replaceChildren(emptyState());
        }
        return;
    }

    loading = true;
    const current = session;

    if (!loadedPosts.length) grid.innerHTML = `<div class="loading-gif-area"><img class="loading-gif" src="/public/img/loading.gif" alt=""></div>`;

    const posts = await Promise.all(pending.map(fetchPost));

    loading = false;

    if (current !== session) return;

    shownIds.push(...pending);

    const valid = posts.filter(Boolean);

    grid.querySelector(".empty-state")?.remove();
    grid.querySelector(".loading-gif-area")?.remove();
    loadedPosts.push(...valid);
    valid.forEach(post => grid.appendChild(gridItem(post)));

    if (!valid.length || sentinelVisible()) loadMore();
}

function sentinelVisible() {
    if (!sentinel || !isOpen()) return false;

    const rect = sentinel.getBoundingClientRect();
    return rect.top < window.innerHeight + 300;
}

function reset() {
    session++;
    loading = false;
    shownIds = [];
    loadedPosts = [];
    grid?.replaceChildren();
    loadMore();
}

function sameOrder(next) {
    const visible = next.filter(id => shownIds.includes(id));
    return visible.length === shownIds.length && visible.every((id, index) => id === shownIds[index]);
}

function open(event) {
    event.preventDefault();

    document
        .querySelectorAll(".side-menu.active:not([data-saved-panel])")
        .forEach(menu => menu.classList.add("behind"));

    panel.classList.add("active");
    reset();
}

function close() {
    panel.classList.remove("active");

    document
        .querySelectorAll(".side-menu.active.behind")
        .forEach(menu => menu.classList.remove("behind"));
}

if (panel && grid) {
    document.querySelectorAll("[data-saved-trigger]").forEach(trigger => trigger.addEventListener("click", open));
    panel.querySelectorAll("[data-saved-close]").forEach(button => button.addEventListener("click", close));

    observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && isOpen()) loadMore();
    }, { root: panel.querySelector(".saved-items"), rootMargin: "300px" });

    if (sentinel) observer.observe(sentinel);

    onSavedChange(ids => {
        const added = ids.some(id => !savedIds.includes(id));
        const changed = !sameOrder(ids) || added;

        savedIds = ids;

        if (isOpen() && changed) reset();
    });
}
