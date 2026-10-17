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

// <svg width="24px" height="24px" viewBox="0 0 52.958984375 44.236328125"><g fill-rule="nonzero" transform="scale(1,-1) translate(0,-44.236328125)"><path fill="currentColor" stroke="currentColor" fill-opacity="1" stroke-width="1" d="M11,3.330078125L41.958984375,3.330078125C45.568359375,3.330078125 47.48046875,5.28515625 47.48046875,8.8515625L47.48046875,35.384765625C47.48046875,38.951171875 45.568359375,40.90625 41.958984375,40.90625L11,40.90625C7.390625,40.90625 5.478515625,38.994140625 5.478515625,35.384765625L5.478515625,8.8515625C5.478515625,5.2421875 7.390625,3.330078125 11,3.330078125ZM11.064453125,4.3828125C8.078125,4.3828125 6.53125,5.9296875 6.53125,8.89453125L6.53125,27.349609375C6.53125,30.3359375 8.078125,31.8828125 11.064453125,31.8828125L41.89453125,31.8828125C44.7734375,31.8828125 46.427734375,30.3359375 46.427734375,27.349609375L46.427734375,8.89453125C46.427734375,5.9296875 44.7734375,4.3828125 41.89453125,4.3828125ZM22.064453125,24.427734375L23.310546875,24.427734375C23.826171875,24.427734375 23.890625,24.470703125 23.890625,24.96484375L23.890625,26.232421875C23.890625,26.705078125 23.826171875,26.76953125 23.310546875,26.76953125L22.064453125,26.76953125C21.548828125,26.76953125 21.484375,26.705078125 21.484375,26.232421875L21.484375,24.96484375C21.484375,24.470703125 21.548828125,24.427734375 22.064453125,24.427734375ZM29.626953125,24.427734375L30.89453125,24.427734375C31.41015625,24.427734375 31.453125,24.470703125 31.453125,24.96484375L31.453125,26.232421875C31.453125,26.705078125 31.41015625,26.76953125 30.89453125,26.76953125L29.626953125,26.76953125C29.111328125,26.76953125 29.068359375,26.705078125 29.068359375,26.232421875L29.068359375,24.96484375C29.068359375,24.470703125 29.111328125,24.427734375 29.626953125,24.427734375ZM37.2109375,24.427734375L38.478515625,24.427734375C38.994140625,24.427734375 39.037109375,24.470703125 39.037109375,24.96484375L39.037109375,26.232421875C39.037109375,26.705078125 38.994140625,26.76953125 38.478515625,26.76953125L37.2109375,26.76953125C36.6953125,26.76953125 36.65234375,26.705078125 36.65234375,26.232421875L36.65234375,24.96484375C36.65234375,24.470703125 36.6953125,24.427734375 37.2109375,24.427734375ZM14.48046875,16.951171875L15.748046875,16.951171875C16.263671875,16.951171875 16.306640625,17.015625 16.306640625,17.48828125L16.306640625,18.755859375C16.306640625,19.25 16.263671875,19.29296875 15.748046875,19.29296875L14.48046875,19.29296875C13.96484375,19.29296875 13.921875,19.25 13.921875,18.755859375L13.921875,17.48828125C13.921875,17.015625 13.96484375,16.951171875 14.48046875,16.951171875ZM22.064453125,16.951171875L23.310546875,16.951171875C23.826171875,16.951171875 23.890625,17.015625 23.890625,17.48828125L23.890625,18.755859375C23.890625,19.25 23.826171875,19.29296875 23.310546875,19.29296875L22.064453125,19.29296875C21.548828125,19.29296875 21.484375,19.25 21.484375,18.755859375L21.484375,17.48828125C21.484375,17.015625 21.548828125,16.951171875 22.064453125,16.951171875ZM29.626953125,16.951171875L30.89453125,16.951171875C31.41015625,16.951171875 31.453125,17.015625 31.453125,17.48828125L31.453125,18.755859375C31.453125,19.25 31.41015625,19.29296875 30.89453125,19.29296875L29.626953125,19.29296875C29.111328125,19.29296875 29.068359375,19.25 29.068359375,18.755859375L29.068359375,17.48828125C29.068359375,17.015625 29.111328125,16.951171875 29.626953125,16.951171875ZM37.2109375,16.951171875L38.478515625,16.951171875C38.994140625,16.951171875 39.037109375,17.015625 39.037109375,17.48828125L39.037109375,18.755859375C39.037109375,19.25 38.994140625,19.29296875 38.478515625,19.29296875L37.2109375,19.29296875C36.6953125,19.29296875 36.65234375,19.25 36.65234375,18.755859375L36.65234375,17.48828125C36.65234375,17.015625 36.6953125,16.951171875 37.2109375,16.951171875ZM14.48046875,9.49609375L15.748046875,9.49609375C16.263671875,9.49609375 16.306640625,9.5390625 16.306640625,10.033203125L16.306640625,11.30078125C16.306640625,11.7734375 16.263671875,11.837890625 15.748046875,11.837890625L14.48046875,11.837890625C13.96484375,11.837890625 13.921875,11.7734375 13.921875,11.30078125L13.921875,10.033203125C13.921875,9.5390625 13.96484375,9.49609375 14.48046875,9.49609375ZM22.064453125,9.49609375L23.310546875,9.49609375C23.826171875,9.49609375 23.890625,9.5390625 23.890625,10.033203125L23.890625,11.30078125C23.890625,11.7734375 23.826171875,11.837890625 23.310546875,11.837890625L22.064453125,11.837890625C21.548828125,11.837890625 21.484375,11.7734375 21.484375,11.30078125L21.484375,10.033203125C21.484375,9.5390625 21.548828125,9.49609375 22.064453125,9.49609375ZM29.626953125,9.49609375L30.89453125,9.49609375C31.41015625,9.49609375 31.453125,9.5390625 31.453125,10.033203125L31.453125,11.30078125C31.453125,11.7734375 31.41015625,11.837890625 30.89453125,11.837890625L29.626953125,11.837890625C29.111328125,11.837890625 29.068359375,11.7734375 29.068359375,11.30078125L29.068359375,10.033203125C29.068359375,9.5390625 29.111328125,9.49609375 29.626953125,9.49609375Z"/></g></svg>

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