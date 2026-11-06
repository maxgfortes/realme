import {
    getCachedCreator,
    getPostMentions,
    appendPost,
    bindPostInteractions
} from "/src/js/pages/feed/render/postCard.js";

import "/src/js/pages/feed/render/openComments.js";
import "/src/js/pages/feed/render/openLikes.js";

let session = 0;

const PIN_MS = 4000;
const RELEASE_EVENTS = ["touchstart", "wheel", "pointerdown"];

function pinToPost(row, post, id) {
    const body = row.parentElement;

    const release = () => {
        observer.disconnect();
        clearTimeout(timer);
        RELEASE_EVENTS.forEach(name => body.removeEventListener(name, release));
    };

    const align = () => {
        if (id !== session) {
            release();
            return;
        }

        body.scrollTo({
            top: post.offsetTop - row.firstElementChild.offsetTop,
            behavior: "instant"
        });
    };

    const observer = new ResizeObserver(align);
    const timer = setTimeout(release, PIN_MS);

    RELEASE_EVENTS.forEach(name => body.addEventListener(name, release, { passive: true }));
    observer.observe(row);
    align();
}

export async function openProfileTimeline(posts, startIndex = 0, username = "", label = "Posts") {
    const timeline = document.getElementById("timeline");
    const row = document.getElementById("timelineRow");
    const name = document.getElementById("timelineName");
    const labelElement = timeline?.querySelector(".timeline-label");

    if (!row) return;

    const id = ++session;

    if (name) name.textContent = username;
    if (labelElement) labelElement.textContent = label;

    row.replaceChildren();
    bindPostInteractions(row);
    timeline?.classList.add("open");

    const items = await Promise.all(
        posts.map(async post => ({
            post,
            creator: await getCachedCreator(post.data.creatorid || post.userid),
            mentions: await getPostMentions(post.data)
        }))
    );

    if (id !== session) return;

    const elements = items.map(({ post, creator, mentions }) =>
        appendPost(row, {
            postId: post.id,
            data: post.data,
            creator,
            mentions
        })
    );

    const target = elements[startIndex];

    if (target) pinToPost(row, target, id);
}

export function closeProfileTimeline() {
    session++;

    document.getElementById("timeline")?.classList.remove("open");
    document.getElementById("timelineRow")?.replaceChildren();
}

document.getElementById("timelineBack")?.addEventListener("click", closeProfileTimeline);