import { db, auth } from "../../../../config/config.js";

import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
    where,
    onSnapshot,
    doc,
    getDoc,
    Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
    escapeHTML,
    formatPostDate,
    joinNames,
    getCachedCreator,
    getUserName,
    getPostMentionsHTML,
    appendPost,
    bindPostInteractions,
    clearPostCaches,
    trackListeners
} from "./postCard.js";

import { openComments } from "./openComments.js";

let lastPost = null;
let newestFeedTime = 0;
let livePostsUnsubscribe = null;
let openedPostFromUrl = false;

const TOP_THRESHOLD = 40;
let isLoading = false;
let hasMorePosts = true;
let feedStarted = false;
let eventsUpperBound = null;
let creatorIdsPromise = null;

const PAGE_SIZE = 20;
const FEED_ENDPOINT = "https://us-central1-ifriendmatch.cloudfunctions.net/feed";
const LAST_SEEN_KEY = "feedLastSeen";
const DEFAULT_CREATOR_PHOTO = "/public/img/default.jpg";

let feedCursor = null;
let useLegacyFeed = false;
let endpointPagesLoaded = 0;

const feed = document.getElementById("feed");
const feedRow = document.getElementById("scroll_page");

const EVENT_ICON_SVG = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http\://www\.w3.org/2000/svg">\<rect x="3" y="4" width="18" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>\<path d="M3 10H21" fill="none" stroke="currentColor" stroke-width="2"/>\<path d="M8 2V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>\<path d="M16 2V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>\<text x="12" y="17.5" font-family="system-ui, -apple-system, sans-serif" font-size="7.5" font-weight="600" fill="currentColor" text-anchor="middle">\</text>\</svg>`

function getFeedCreatorIds() {
    if (!creatorIdsPromise) {
        const myUid = auth.currentUser.uid;

        creatorIdsPromise = getDocs(collection(db, "users", myUid, "friends"))
            .then(snap => [myUid, ...snap.docs.map(d => d.id)])
            .catch(() => [myUid]);
    }

    return creatorIdsPromise;
}

async function fetchEvents(from, to) {
    const ids = await getFeedCreatorIds();

    const snaps = await Promise.all(ids.map(async id => {
        const constraints = [where("creatorId", "==", id)];

        if (from) constraints.push(where("createAt", ">=", from));
        if (to) constraints.push(where("createAt", "<", to));

        try {
            return await getDocs(
                query(collection(db, "events"), ...constraints, orderBy("createAt", "desc"))
            );
        } catch (error) {
            console.error("Erro ao buscar eventos:", error);
            return null;
        }
    }));

    return snaps.filter(Boolean).flatMap(snap => snap.docs);
}

const GOING_SAMPLE_SIZE = 30;

function shuffle(list) {
    const array = [...list];

    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
}

async function renderEventGoing(graph, goingDocs, isCurrent) {
    const total = goingDocs.length;

    if (total === 0) {
        graph.textContent = "Ninguém ainda vai";
        return;
    }

    const picked = shuffle(goingDocs.slice(0, GOING_SAMPLE_SIZE)).slice(0, 2);

    const names = await Promise.all(
        picked.map(goingDoc => getUserName(goingDoc.data().uid || goingDoc.id))
    );

    if (!isCurrent()) return;

    const parts = names.map(name => `<span>${escapeHTML(name)}</span>`);
    const others = total - names.length;

    if (others > 0) {
        const othersText = others === 1 ? "outra pessoa" : `outras ${others} pessoas`;
        parts.push(`<span>${othersText}</span>`);
    }

    graph.innerHTML = `${joinNames(parts)} ${total === 1 ? "vai" : "vão"}`;
}

function loadEventGoing(eventId) {
    const card = feed.querySelector(`.post-card-new[data-event-id="${CSS.escape(eventId)}"]`);
    const graph = card?.querySelector(".event-card-graph");

    if (!graph) return;

    let version = 0;

    const unsubscribe = onSnapshot(
        collection(db, "events", eventId, "going"),
        snapshot => {
            const current = ++version;

            renderEventGoing(graph, snapshot.docs, () => current === version)
                .catch(error => console.error("Erro ao carregar quem vai:", error));
        },
        error => console.error("Erro ao carregar quem vai:", error)
    );

    trackListeners(card, unsubscribe);
}

function postSelector(postId) {
    return `.post-card-new[data-post-id="${CSS.escape(postId)}"]`;
}

function isFeedAtTop() {
    return !feedRow || feedRow.scrollTop <= TOP_THRESHOLD;
}

function animatePostEnter(element) {
    const height = element.offsetHeight;

    element.classList.add("post-live-enter");
    element.style.height = "0px";
    element.style.opacity = "0";

    void element.offsetHeight;

    element.style.height = `${height}px`;
    element.style.opacity = "1";

    let finished = false;

    const finish = () => {
        if (finished) return;

        finished = true;
        element.classList.remove("post-live-enter");
        element.style.height = "";
        element.style.opacity = "";
    };

    element.addEventListener("transitionend", event => {
        if (event.propertyName === "height") finish();
    });

    setTimeout(finish, 900);
}

function insertLivePost(postId, data, creator, mentionsHTML) {
    const firstPost = feed.querySelector(".post-card-new");
    const atTop = isFeedAtTop();
    const previousTop = feedRow?.scrollTop || 0;
    const previousHeight = feedRow?.scrollHeight || 0;

    const element = appendPost(feed, {
        postId,
        data,
        creator,
        mentionsHTML,
        before: firstPost
    });

    if (!element) return;

    if (atTop) {
        animatePostEnter(element);
        return;
    }

    feedRow.scrollTop = previousTop + (feedRow.scrollHeight - previousHeight);
}

async function handleLiveAdded(postDoc) {
    if (!feedStarted || feed.querySelector(postSelector(postDoc.id))) return;

    const data = postDoc.data({ serverTimestamps: "estimate" });

    if (data.visible === false || (data.wallTo && data.wallTo !== data.creatorid)) return;

    const time = data.create?.toMillis ? data.create.toMillis() : Date.now();

    if (time < newestFeedTime) return;

    const [creator, mentionsHTML] = await Promise.all([
        getCachedCreator(data.creatorid || ""),
        getPostMentionsHTML(data)
    ]);

    if (!feedStarted || feed.querySelector(postSelector(postDoc.id))) return;

    newestFeedTime = Math.max(newestFeedTime, time);
    insertLivePost(postDoc.id, data, creator, mentionsHTML);
}

function removeFeedElement(element) {
    if (!element?.isConnected) return;

    const rowTop = feedRow?.getBoundingClientRect().top ?? 0;
    const rect = element.getBoundingClientRect();

    if (feedRow && rect.bottom <= rowTop) {
        const previousTop = feedRow.scrollTop;
        const previousHeight = feedRow.scrollHeight;

        element.remove();
        feedRow.scrollTop = previousTop - (previousHeight - feedRow.scrollHeight);
        return;
    }

    element.style.height = `${element.offsetHeight}px`;
    element.classList.add("post-live-leave");

    void element.offsetHeight;

    element.style.height = "0px";
    element.style.opacity = "0";

    setTimeout(() => element.remove(), 450);
}

async function handleLiveRemoved(postId) {
    const element = feed.querySelector(postSelector(postId));

    if (!element) return;

    try {
        const snapshot = await getDoc(doc(db, "posts", postId));

        if (!snapshot.exists() || snapshot.data().visible === false) removeFeedElement(element);
    } catch (error) {
        console.error("Erro ao verificar post removido:", error);
    }
}

function startLivePosts() {
    if (livePostsUnsubscribe || !feed) return;

    let firstSnapshot = true;

    livePostsUnsubscribe = onSnapshot(
        query(collection(db, "posts"), orderBy("create", "desc"), limit(PAGE_SIZE)),
        snapshot => {
            if (firstSnapshot) {
                firstSnapshot = false;
                return;
            }

            snapshot.docChanges().forEach(change => {
                if (change.type === "added") {
                    handleLiveAdded(change.doc)
                        .catch(error => console.error("Erro ao inserir post novo:", error));
                } else if (change.type === "removed") {
                    handleLiveRemoved(change.doc.id);
                } else if (change.doc.data().visible === false) {
                    removeFeedElement(feed.querySelector(postSelector(change.doc.id)));
                }
            });
        },
        error => console.error("Erro ao observar novos posts:", error)
    );
}

function openPostFromUrl() {
    const postId = new URLSearchParams(location.search).get("id");

    if (!postId || openedPostFromUrl) return;

    openedPostFromUrl = true;
    openComments(postId);
}

async function loadLegacyPage() {
    const postsQuery = lastPost
        ? query(collection(db, "posts"), orderBy("create", "desc"), startAfter(lastPost), limit(PAGE_SIZE))
        : query(collection(db, "posts"), orderBy("create", "desc"), limit(PAGE_SIZE));

    const postsSnapshot = await getDocs(postsQuery);
    const postDocs = postsSnapshot.docs.filter(postDoc => {
        const data = postDoc.data();
        return data.visible !== false && (!data.wallTo || data.wallTo === data.creatorid);
    });
    const isLastPage = postsSnapshot.docs.length < PAGE_SIZE;

    if (postsSnapshot.docs.length) {
        lastPost = postsSnapshot.docs[postsSnapshot.docs.length - 1];
    }

    const windowStart = isLastPage
        ? null
        : postsSnapshot.docs[postsSnapshot.docs.length - 1].data().create || null;

    const eventDocs = await fetchEvents(windowStart, eventsUpperBound);

    eventsUpperBound = windowStart;
    hasMorePosts = !isLastPage;

    const items = [
        ...postDocs.map(postDoc => {
            const data = postDoc.data();

            return {
                type: "post",
                id: postDoc.id,
                data,
                creatorid: data.creatorid || "",
                time: data.create ? data.create.toMillis() : 0
            };
        }),
        ...eventDocs.map(eventDoc => {
            const data = eventDoc.data();

            return {
                type: "event",
                id: eventDoc.id,
                data,
                creatorid: data.creatorId || "",
                time: data.createAt ? data.createAt.toMillis() : 0
            };
        })
    ].sort((a, b) => b.time - a.time);

    const creators = await Promise.all(items.map(item => getCachedCreator(item.creatorid)));

    return { items, creators };
}

function readLastSeen() {
    try {
        return Number(localStorage.getItem(LAST_SEEN_KEY)) || 0;
    } catch {
        return 0;
    }
}

function saveLastSeen(time) {
    if (!time || time <= readLastSeen()) return;

    try {
        localStorage.setItem(LAST_SEEN_KEY, String(time));
    } catch {
        return;
    }
}

function toTimestamp(value) {
    return typeof value === "number" ? Timestamp.fromMillis(value) : value || null;
}

function reviveFeedItem(item) {
    const data = { ...(item.data || {}) };

    if (item.type === "event") {
        data.createAt = toTimestamp(data.createAt ?? item.createdAt);
        data.eventDate = toTimestamp(data.eventDate);
    } else {
        data.create = toTimestamp(data.create ?? item.createdAt);
    }

    return {
        type: item.type === "event" ? "event" : "post",
        id: item.id,
        data,
        tier: item.tier || "",
        creatorid: (item.type === "event" ? data.creatorId : data.creatorid) || item.creator?.uid || "",
        time: item.createdAt || 0,
        creator: {
            name: item.creator?.name || "Usuário",
            photo: item.creator?.photo || DEFAULT_CREATOR_PHOTO
        }
    };
}

async function fetchFeedPage() {
    const user = auth.currentUser;

    if (!user) throw new Error("Usuário não autenticado");

    const token = await user.getIdToken();
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), user_id: user.uid });

    if (feedCursor) {
        params.set("cursor", feedCursor);
    } else {
        const lastSeen = readLastSeen();
        if (lastSeen) params.set("since", String(lastSeen));
    }

    const response = await fetch(`${FEED_ENDPOINT}?${params}`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) throw new Error(`Feed respondeu ${response.status}`);

    return response.json();
}

async function loadEndpointPage() {
    const page = await fetchFeedPage();
    const items = (page.items || []).map(reviveFeedItem);

    feedCursor = page.nextCursor || null;
    hasMorePosts = Boolean(page.hasMore && page.nextCursor);
    endpointPagesLoaded++;

    return { items, creators: items.map(item => item.creator) };
}

async function renderFeedItems(items, creators) {
    newestFeedTime = Math.max(
        newestFeedTime,
        ...items.filter(item => item.type === "post").map(item => item.time),
        0
    );

    saveLastSeen(newestFeedTime);

    if (!feedStarted) {
        feed.innerHTML = "";
        feedStarted = true;
    }

    if (!items.length) return;

    const mentionsHTMLs = await Promise.all(
        items.map(item =>
            item.type === "post"
                ? getPostMentionsHTML(item.data)
                : ""
        )
    );

    items.forEach((item, index) => {
        if (feed.querySelector(`[data-${item.type === "event" ? "event" : "post"}-id="${CSS.escape(item.id)}"]`)) return;

        const dateText = item.time ? formatPostDate(new Date(item.time)) : "";

        if (item.type === "event") {
            renderEvent({
                feed,
                eventId: item.id,
                title: item.data.eventTitle || "",
                creator: creators[index],
                dateText,
                creatorid: item.creatorid
            });

            loadEventGoing(item.id);

            return;
        }

        const element = appendPost(feed, {
            postId: item.id,
            data: item.data,
            creator: creators[index],
            mentionsHTML: mentionsHTMLs[index]
        });

        if (element && item.tier) element.dataset.feedTier = item.tier;
    });
}

async function loadFeed() {
    if (!feed) return;
    if (isLoading || !hasMorePosts) return;

    isLoading = true;

    try {
        let page = null;

        if (!useLegacyFeed) {
            try {
                page = await loadEndpointPage();
            } catch (error) {
                console.warn("Feed ranqueado indisponível:", error);

                if (endpointPagesLoaded === 0) useLegacyFeed = true;
                else return;
            }
        }

        if (useLegacyFeed) page = await loadLegacyPage();

        await renderFeedItems(page.items, page.creators);
    } catch (error) {
        console.error("Erro ao carregar feed:", error);
    } finally {
        isLoading = false;

        if (feedStarted) {
            startLivePosts();
            openPostFromUrl();
        }
    }
}

export async function refreshFeed() {
    while (isLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    lastPost = null;
    feedCursor = null;
    endpointPagesLoaded = 0;
    newestFeedTime = 0;
    hasMorePosts = true;
    feedStarted = false;
    eventsUpperBound = null;
    creatorIdsPromise = null;
    clearPostCaches();

    await loadFeed();
}

if (feedRow) {
    feedRow.addEventListener("scroll", () => {
        const distanceFromBottom =
            feedRow.scrollHeight - feedRow.scrollTop - feedRow.clientHeight;

        const scrollableHeight =
            feedRow.scrollHeight - feedRow.clientHeight;

        const threshold = scrollableHeight * 0.3;

        if (distanceFromBottom <= threshold) {
            loadFeed();
        }
    });
}

function renderEvent({ feed, eventId, title, creator, dateText, creatorid }) {
    const safeCreatorId = escapeHTML(String(creatorid || ""));
    const profileUrl = `profile.html?uid=${encodeURIComponent(creatorid || "")}`;

    const eventHTML = `
        <div class="post-card-new" data-event-id="${escapeHTML(eventId)}">
            <div class="post-header-new">
                <div class="post-pfp-area post-owner-link" data-profile-uid="${safeCreatorId}">
                    <div class="post-pfp">
                        <img src="${escapeHTML(creator.photo)}" alt="">
                    </div>
                </div>

                <div class="post-header-infos">
                    <div class="post-author-name-area">
                        <a
                            class="post-author-name post-profile-link"
                            href="${profileUrl}"
                            data-profile-uid="${safeCreatorId}"
                        >${escapeHTML(creator.name)}</a> criou um evento
                    </div>

                    <div class="post-date-new">${dateText}</div>
                </div>

                <div class="post-more-actions">
                    <button
                        class="post-more"
                        data-event-id="${escapeHTML(eventId)}"
                        data-creator-id="${safeCreatorId}"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="7" width="20" height="2.5" rx="1.25"></rect><rect x="2" y="15" width="15" height="2.5" rx="1.25"></rect></svg>
                    </button>
                </div>
            </div>

            <div class="event-card-area">
                <div class="event-card">
                    <div class="event-card-top">
                        <div class="event-card-icon-area">
                            ${EVENT_ICON_SVG}
                        </div>
                        <div class="event-card-info">
                            <div class="event-card-label">Evento</div>
                            <div class="event-card-title">${escapeHTML(title)}</div>
                        </div>
                    </div>
                    <div class="event-card-bottom">
                        <div class="event-card-graph"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    feed.insertAdjacentHTML("beforeend", eventHTML);
}

onAuthStateChanged(auth, user => {
    if (!user) return;
    loadFeed();
});

bindPostInteractions(feed);