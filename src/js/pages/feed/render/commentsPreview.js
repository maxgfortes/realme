import { db } from "../../../../config/config.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DEFAULT_PHOTO = "/public/img/default.jpg";

const authorCache = new Map();

async function fetchAuthor(uid) {
    const [userSnap, mediaSnap] = await Promise.all([
        getDoc(doc(db, "users", uid)),
        getDoc(doc(db, "users", uid, "user-infos", "user-media"))
    ]);

    const data = userSnap.exists() ? userSnap.data() : {};
    const media = mediaSnap.exists() ? mediaSnap.data() : {};

    return {
        name: `${data.name || ""} ${data.surname || ""}`.trim() || "Usuário",
        photo: media.userphoto || DEFAULT_PHOTO
    };
}

function getAuthor(uid) {
    if (!uid) return Promise.resolve({ name: "Usuário", photo: DEFAULT_PHOTO });

    if (!authorCache.has(uid)) {
        authorCache.set(
            uid,
            fetchAuthor(uid).catch(() => ({ name: "Usuário", photo: DEFAULT_PHOTO }))
        );
    }

    return authorCache.get(uid);
}

function getPreviewArea(postElement) {
    let area = postElement.querySelector(".comments-preview");

    if (area) return area;

    const box = postElement.querySelector(".post-graph-box");

    if (!box) return null;

    area = document.createElement("div");
    area.className = "comments-preview";
    box.appendChild(area);

    return area;
}

function buildItem(comment, author) {
    const item = document.createElement("div");
    item.className = "comment-preview-item";
    item.dataset.commentId = comment.id;

    const image = document.createElement("img");
    image.className = "comment-preview-pfp";
    image.src = author.photo;
    image.alt = "";
    image.loading = "lazy";

    const text = document.createElement("div");
    text.className = "comment-preview-text";

    const name = document.createElement("span");
    name.className = "comment-preview-name";
    name.textContent = author.name;

    text.append(name, document.createTextNode(` ${comment.content || comment.text || ""}`));
    item.append(image, text);

    return item;
}

export async function renderCommentsPreview(postElement, comments, isCurrent = () => true) {
    const authors = await Promise.all(comments.map(comment => getAuthor(comment.senderid)));

    if (!isCurrent()) return;

    const area = getPreviewArea(postElement);

    if (!area) return;

    area.replaceChildren(...comments.map((comment, index) => buildItem(comment, authors[index])));
    area.classList.toggle("has-comments", comments.length > 0);

    postElement.querySelector(".post-graph-box")?.classList.toggle(
        "with-comments",
        comments.length > 0
    );
}
