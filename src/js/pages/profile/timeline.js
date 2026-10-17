import {
    getCachedCreator,
    getPostMentionsHTML,
    appendPost,
    bindPostInteractions
} from "/src/js/pages/feed/render/postCard.js";

import "/src/js/pages/feed/render/openComments.js";
import "/src/js/pages/feed/render/openLikes.js";

let session = 0;

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
            mentionsHTML: await getPostMentionsHTML(post.data)
        }))
    );

    if (id !== session) return;

    items.forEach(({ post, creator, mentionsHTML }) => {
        appendPost(row, {
            postId: post.id,
            data: post.data,
            creator,
            mentionsHTML
        });
    });

    row.children[Math.max(startIndex, 60)]?.scrollIntoView({ block: "start" });
}

export function closeProfileTimeline() {
    session++;

    document.getElementById("timeline")?.classList.remove("open");
    document.getElementById("timelineRow")?.replaceChildren();
}

document.getElementById("timelineBack")?.addEventListener("click", closeProfileTimeline);