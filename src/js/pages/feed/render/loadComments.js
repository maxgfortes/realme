import { timeAgo } from "/src/i18n/time.js";
import { t } from "/src/i18n/i18n.js";
import { db, auth } from "../../../../config/config.js";
import { postSegments } from "./postPath.js";
import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    doc,
    getDoc,
    getDocs,
    writeBatch,
    increment
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { enableCommentSwipe } from "./swipeComments.js";
import { setReplyTarget } from "./sendComment.js";
import { openUsersList } from "./openLikes.js";

const DEFAULT_PFP = "/public/img/default.jpg";
const MAX_INDENT_DEPTH = 3;

const HEART_OUTLINE = '<svg class="heart-outline" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.792 3.904A4.989 4.989 0 0 1 21.5 9.122c0 3.072-2.652 4.959-5.197 7.222-2.512 2.243-3.865 3.469-4.303 3.752-.477-.309-2.143-1.823-4.303-3.752C5.141 14.072 2.5 12.167 2.5 9.122a4.989 4.989 0 0 1 4.708-5.218 4.21 4.21 0 0 1 3.675 1.941c.84 1.175.98 1.763 1.12 1.763s.278-.588 1.11-1.766a4.17 4.17 0 0 1 3.679-1.938m0-2a6.04 6.04 0 0 0-4.797 2.127 6.052 6.052 0 0 0-4.787-2.127A6.985 6.985 0 0 0 .5 9.122c0 3.61 2.55 5.827 5.015 7.97.283.246.569.494.853.747l1.027.918a44.998 44.998 0 0 0 3.518 3.018 2 2 0 0 0 2.174 0 45.263 45.263 0 0 0 3.626-3.115l.922-.824c.293-.26.59-.519.885-.774 2.334-2.025 4.98-4.32 4.98-7.94a6.985 6.985 0 0 0-6.708-7.218Z"/></svg>';
const HEART_FILL = '<svg class="heart-fill" fill="currentColor" viewBox="0 0 48 48" aria-hidden="true"><path d="M34.6 3.1c-4.5 0-7.9 1.8-10.6 5.6-2.7-3.7-6.1-5.5-10.6-5.5C6 3.1 0 9.6 0 17.6c0 7.3 5.4 12 10.6 16.5.6.5 1.3 1.1 1.9 1.7l2.3 2c4.4 3.9 6.6 5.9 7.6 6.5.5.3 1.1.5 1.6.5s1.1-.2 1.6-.5c1-.6 2.8-2.2 7.8-6.8l2-1.8c.7-.6 1.3-1.2 2-1.7C42.7 29.6 48 25 48 17.6c0-8-6-14.5-13.4-14.5z"/></svg>';
const DELETE_SVG = '<svg viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg"><path d="M432,144,403.33,419.74A32,32,0,0,1,371.55,448H140.46a32,32,0,0,1-31.78-28.26L80,144" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></path><rect x="32" y="64" width="448" height="80" rx="16" ry="16" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></rect><line x1="312" y1="240" x2="200" y2="352" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></line><line x1="312" y1="352" x2="200" y2="240" style="fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:32px"></line></svg>';

const commentsRow = document.getElementById("commentsRow");

let unsubscribeComments = null;
let currentPostId = null;
let currentPostOwner = null;
let renderToken = 0;

const userCache = new Map();
const likedCache = new Map();
const likersCache = new Map();
const pendingLikes = new Map();

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatCommentDate(timestamp) {
    if (!timestamp) return t("time.justNow");
    return timeAgo(timestamp);
}

function getUserData(uid) {
    const fallback = { name: t("common.user"), photo: DEFAULT_PFP };

    if (!uid) return Promise.resolve(fallback);

    if (!userCache.has(uid)) {
        userCache.set(uid, Promise.all([
            getDoc(doc(db, "users", uid)).catch(() => null),
            getDoc(doc(db, "users", uid, "user-infos", "user-media")).catch(() => null)
        ]).then(([userSnap, mediaSnap]) => {
            if (!userSnap?.exists()) return fallback;

            const data = userSnap.data();
            const media = mediaSnap?.exists() ? mediaSnap.data() : {};

            return {
                name: [data.name, data.surname].filter(Boolean).join(" ").trim() || data.username || t("common.user"),
                photo: media.userphoto || DEFAULT_PFP
            };
        }));
    }

    return userCache.get(uid);
}

function commentPath(commentId) {
    return [...postSegments(currentPostId), "coments", commentId];
}

function likeKey(commentId) {
    return `${currentPostId}::${commentId}`;
}

function isLikedByMe(commentId) {
    const uid = auth.currentUser?.uid;
    if (!uid) return Promise.resolve(false);

    const key = likeKey(commentId);

    if (!likedCache.has(key)) {
        likedCache.set(key, getDoc(doc(db, ...commentPath(commentId), "likers", uid))
            .then(snap => snap.exists())
            .catch(() => false));
    }

    return likedCache.get(key);
}

function getLikers(commentId, total) {
    const key = `${likeKey(commentId)}::${total}`;

    if (!likersCache.has(key)) {
        likersCache.set(key, getDocs(query(collection(db, ...commentPath(commentId), "likers"), limit(2)))
            .then(snap => Promise.all(snap.docs.map(likerDoc => getUserData(likerDoc.id).then(user => user.name))))
            .catch(() => []));
    }

    return likersCache.get(key);
}

function buildTree(comments) {
    const byId = new Map(comments.map(comment => [comment.id, { ...comment, children: [] }]));
    const roots = [];

    byId.forEach(node => {
        const parent = node.parentId ? byId.get(node.parentId) : null;
        if (parent) parent.children.push(node);
        else roots.push(node);
    });

    return roots;
}

function renderFooter(element, comment) {
    const footer = element.querySelector(".comment-likes-footer");
    const total = comment.likes || 0;

    if (total <= 0) {
        footer.hidden = true;
        footer.textContent = "";
        return;
    }

    getLikers(comment.id, total).then(names => {
        if (!element.isConnected || !names.length) return;

        footer.hidden = false;
        footer.textContent = "";
        footer.append(document.createTextNode(t("post.likedBy")));

        const first = document.createElement("span");
        first.textContent = names[0];
        footer.append(first);

        if (total === 2 && names[1]) {
            footer.append(document.createTextNode(" e "));
            const second = document.createElement("span");
            second.textContent = names[1];
            footer.append(second);
        } else if (total > 1) {
            footer.append(document.createTextNode(t("post.andOthers", { others: t("common.otherPeople", { count: total - 1 }) })));
        }
    });
}

function setLikeState(element, liked, count) {
    const button = element.querySelector(".comment-like");
    button.classList.toggle("liked", liked);
    button.setAttribute("aria-pressed", String(liked));
    button.querySelector(".comment-like-count").textContent = count > 0 ? String(count) : "";
}

function renderComment(comment, user, depth) {
    const element = document.createElement("div");
    element.className = "comment-item";
    element.dataset.commentId = comment.id;
    element.dataset.commentOwnerId = comment.senderid || "";
    element.dataset.depth = String(depth);

    const profileUid = escapeHTML(comment.senderid || "");
    const image = comment.image?.url ? comment.image : null;
    const ratio = image?.width && image?.height ? `${image.width} / ${image.height}` : "1 / 1";

    element.innerHTML = `
        <div class="comment-item-content">
            <div class="comment-left">
                <div class="comment-pfp comment-profile-link" data-profile-uid="${profileUid}">
                    <img src="${escapeHTML(user.photo)}" alt="">
                </div>
            </div>
            <div class="comment-right">
                <div class="comment-header">
                    <div class="comment-displayname comment-profile-link" data-profile-uid="${profileUid}">${escapeHTML(user.name)}</div>
                    <div class="comment-date">${formatCommentDate(comment.create)}</div>
                </div>
                <div class="comment-body">
                    <div class="comment-text"></div>
                    ${image ? `<img class="comment-image" src="${escapeHTML(image.url)}" alt="" loading="lazy" style="aspect-ratio:${ratio}">` : ""}
                </div>
                <div class="comment-actions">
                    <button class="comment-reply" type="button">${t("comments.reply")}</button>
                    <div class="comment-likes-footer" hidden></div>
                </div>
            </div>
            <button class="comment-like" type="button" aria-label="${t("post.like")}" aria-pressed="false">
                ${HEART_OUTLINE}${HEART_FILL}
                <span class="comment-like-count"></span>
            </button>
        </div>
        <div class="comment-item-options">
            <button class="item-btn delete" type="button">${DELETE_SVG}</button>
        </div>
    `;

    const text = element.querySelector(".comment-text");

    if (comment.replyToName && depth > 0) {
        const mention = document.createElement("span");
        mention.className = "comment-mention comment-profile-link";
        mention.dataset.profileUid = comment.replyToUid || "";
        mention.textContent = `@${comment.replyToName} `;
        text.appendChild(mention);
    }

    text.appendChild(document.createTextNode(String(comment.content ?? "")));
    if (!comment.content && !(comment.replyToName && depth > 0)) text.hidden = true;

    const pending = pendingLikes.get(likeKey(comment.id));
    setLikeState(element, pending?.liked ?? false, pending?.count ?? (comment.likes || 0));

    if (!pending && (comment.likes || 0) > 0) {
        isLikedByMe(comment.id).then(liked => {
            if (element.isConnected && !pendingLikes.has(likeKey(comment.id))) {
                setLikeState(element, liked, comment.likes || 0);
            }
        });
    }

    renderFooter(element, comment);
    element.commentData = { ...comment, depth, senderName: user.name };

    enableCommentSwipe(element, currentPostId, currentPostOwner);

    return element;
}

function renderNode(node, users, depth, target) {
    target.appendChild(renderComment(node, users.get(node.senderid) || users.get(undefined), depth));

    if (!node.children.length) return;

    const childDepth = Math.min(depth + 1, MAX_INDENT_DEPTH);
    const replies = document.createElement("div");
    replies.className = "comment-replies";
    replies.dataset.depth = String(childDepth);

    node.children.forEach(child => renderNode(child, users, childDepth, replies));
    target.appendChild(replies);
}

async function renderAll(snapshot, token) {
    const comments = snapshot.docs.map(commentDoc => ({ id: commentDoc.id, ...commentDoc.data() }));

    if (!comments.length) {
        commentsRow.innerHTML = `<div class="no-comments">${t("comments.empty")}</div>`;
        return;
    }

    const uids = [...new Set(comments.map(comment => comment.senderid).filter(Boolean))];
    const resolved = await Promise.all(uids.map(getUserData));

    if (token !== renderToken) return;

    const users = new Map(uids.map((uid, index) => [uid, resolved[index]]));
    users.set(undefined, { name: t("common.user"), photo: DEFAULT_PFP });

    const fragment = document.createDocumentFragment();
    buildTree(comments).forEach(node => renderNode(node, users, 0, fragment));

    const scrollTop = commentsRow.scrollTop;
    commentsRow.replaceChildren(fragment);
    commentsRow.scrollTop = scrollTop;
}

export async function loadComments(postId) {
    if (!commentsRow || !postId) return;

    stopCommentsListener();

    currentPostId = postId;
    commentsRow.innerHTML = "";

    const token = ++renderToken;
    const postSnapshot = await getDoc(doc(db, ...postSegments(postId)));

    if (token !== renderToken) return;

    if (!postSnapshot.exists()) {
        commentsRow.innerHTML = `<div class="no-comments">${t("comments.postNotFound")}</div>`;
        return;
    }

    const postData = postSnapshot.data();
    currentPostOwner = postData.creatorid || postData.uid || postData.ownerid || postData.authorId;

    unsubscribeComments = onSnapshot(
        query(collection(db, ...postSegments(postId), "coments"), orderBy("create", "asc")),
        snapshot => {
            const renderAt = ++renderToken;
            renderAll(snapshot, renderAt).catch(error => console.error("Erro ao renderizar comentários:", error));
        },
        error => console.error("Erro no onSnapshot dos comentários:", error)
    );
}

export function stopCommentsListener() {
    unsubscribeComments?.();
    unsubscribeComments = null;
    renderToken++;
}

async function toggleLike(element) {
    const uid = auth.currentUser?.uid;
    const comment = element.commentData;

    if (!uid || !comment || !currentPostId) return;

    const key = likeKey(comment.id);
    const button = element.querySelector(".comment-like");
    const wasLiked = button.classList.contains("liked");
    const currentCount = Number(button.querySelector(".comment-like-count").textContent) || 0;
    const nextCount = Math.max(0, currentCount + (wasLiked ? -1 : 1));

    pendingLikes.set(key, { liked: !wasLiked, count: nextCount });
    likedCache.set(key, Promise.resolve(!wasLiked));
    setLikeState(element, !wasLiked, nextCount);

    button.classList.remove("pop");
    void button.offsetWidth;
    if (!wasLiked) button.classList.add("pop");

    try {
        const batch = writeBatch(db);
        const likerRef = doc(db, ...commentPath(comment.id), "likers", uid);
        const commentRef = doc(db, ...commentPath(comment.id));

        if (wasLiked) batch.delete(likerRef);
        else batch.set(likerRef, { uid, createdAt: new Date() });

        batch.update(commentRef, { likes: increment(wasLiked ? -1 : 1) });
        await batch.commit();
    } catch (error) {
        console.error("Erro ao curtir comentário:", error);
        likedCache.delete(key);
        setLikeState(element, wasLiked, currentCount);
    } finally {
        pendingLikes.delete(key);
    }
}

async function openCommentLikers(element) {
    const comment = element.commentData;
    if (!comment) return;

    const snap = await getDocs(collection(db, ...commentPath(comment.id), "likers"));
    openUsersList(t("common.curtido_por"), snap.docs.map(likerDoc => likerDoc.id));
}

if (commentsRow) {
    commentsRow.addEventListener("click", event => {
        const element = event.target.closest(".comment-item");

        if (event.target.closest(".comment-like") && element) {
            toggleLike(element);
            return;
        }

        if (event.target.closest(".comment-reply") && element?.commentData) {
            const comment = element.commentData;
            setReplyTarget({
                commentId: comment.id,
                parentId: comment.parentId || null,
                rootId: comment.rootId || null,
                depth: comment.depth || 0,
                uid: comment.senderid,
                name: comment.senderName
            });
            return;
        }

        if (event.target.closest(".comment-likes-footer") && element) {
            openCommentLikers(element);
            return;
        }

        const profileElement = event.target.closest(".comment-profile-link");
        const uid = profileElement?.dataset.profileUid;

        if (uid) window.location.href = `profile.html?uid=${encodeURIComponent(uid)}`;
    });
}
