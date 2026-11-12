import { t } from "/src/i18n/i18n.js";
import { escapeHTML, buildPostMeta, formatPostDate } from "./postCard.js";

const DEFAULT_PHOTO = "/public/img/default.jpg";

const STATUS_KEYS = new Set(["solteiro", "namorando", "casado", "em_compromisso", "viuvo"]);

const boundContainers = new WeakSet();

function profileUrl(uid, tab = "") {
    const base = `profile.html?uid=${encodeURIComponent(uid || "")}`;
    return tab ? `${base}&tab=${tab}` : base;
}

function personLink(person) {
    const uid = escapeHTML(person.uid || "");

    return `<a class="post-author-name post-profile-link" href="${profileUrl(person.uid)}" data-profile-uid="${uid}">${escapeHTML(person.name || t("common.user"))}</a>`;
}

function highlight(text) {
    return `<span class="feed-activity-highlight">${escapeHTML(text)}</span>`;
}

function statusLabel(value) {
    return STATUS_KEYS.has(value) ? t(`act.status.${value}`) : String(value || "");
}

function activityText(type, data, actor, target) {
    const author = personLink(actor);
    const targetLink = target ? personLink(target) : t("act.someone");
    const params = { author, target: targetLink, time: "" };

    switch (type) {
        case "status_change":
            return t("act.statusChange", { ...params, status: highlight(statusLabel(data.novoStatus)) });
        case "profile_update":
            return t("act.profileUpdate", params);
        case "update_bio":
            return t("act.updateBio", params);
        case "new_location":
            return t("act.location", { ...params, location: highlight(data.location || "") });
        case "add_profile_music":
            return t("act.addMusic", params);
        case "update_profile_music":
            return t("act.updateMusic", params);
        case "new_friendship":
            return t("act.friendship", params);
        case "wall_post":
            return t("act.wallPost", params);
        default:
            return t("act.profileUpdate", params);
    }
}

function activityHref(type, data, actor, target) {
    if (type === "wall_post" && target?.uid) return profileUrl(target.uid, "wall");
    if (type === "new_friendship" && target?.uid) return profileUrl(target.uid);
    return profileUrl(actor.uid);
}

function pfpHTML(actor, target) {
    const actorUid = escapeHTML(actor.uid || "");
    const actorPhoto = escapeHTML(actor.photo || DEFAULT_PHOTO);

    if (!target?.uid) {
        return `
            <div class="post-pfp-area post-owner-link" data-profile-uid="${actorUid}">
                <div class="post-pfp" data-presence-uid="${actorUid}">
                    <img src="${actorPhoto}" alt="">
                </div>
            </div>
        `;
    }

    const targetUid = escapeHTML(target.uid);

    return `
        <div class="post-pfp-group">
            <div class="post-pfp post-pfp-first post-profile-link" data-profile-uid="${targetUid}" data-presence-uid="${targetUid}">
                <img src="${escapeHTML(target.photo || DEFAULT_PHOTO)}" alt="">
            </div>
            <div class="post-pfp post-pfp-owner post-owner-link" data-profile-uid="${actorUid}" data-presence-uid="${actorUid}">
                <img src="${actorPhoto}" alt="">
            </div>
        </div>
    `;
}

export function renderActivity(container, { activityId, type, data, actor, target, time, before = null }) {
    if (!container || !activityId) return null;

    const selector = `[data-activity-id="${CSS.escape(activityId)}"]`;

    if (container.querySelector(selector)) return null;

    const text = activityText(type, data, actor, target).trim();
    const href = activityHref(type, data, actor, target);
    const dateText = time ? formatPostDate(new Date(time)) : "";

    const html = `
        <div class="post-card-new feed-activity" data-activity-id="${escapeHTML(activityId)}" data-activity-type="${escapeHTML(type)}" data-href="${escapeHTML(href)}" role="link" tabindex="0">
            <div class="post-header-new">
                ${pfpHTML(actor, target)}

                <div class="post-header-infos">
                    <div class="post-author-name-area feed-activity-text">${text}</div>

                    ${buildPostMeta({ dateText })}
                </div>
            </div>
        </div>
    `;

    if (before && before.parentNode === container) {
        before.insertAdjacentHTML("beforebegin", html);
        return before.previousElementSibling;
    }

    container.insertAdjacentHTML("beforeend", html);
    return container.lastElementChild;
}

export function bindActivityClicks(container) {
    if (!container || boundContainers.has(container)) return;

    boundContainers.add(container);

    const open = card => {
        const href = card?.dataset.href;
        if (href) window.location.href = href;
    };

    container.addEventListener("click", event => {
        if (event.target.closest(".post-profile-link, .post-owner-link")) return;

        const card = event.target.closest(".feed-activity");
        if (card) open(card);
    });

    container.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;

        const card = event.target.closest(".feed-activity");
        if (card) open(card);
    });
}
