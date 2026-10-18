import { t } from "/src/i18n/i18n.js";
export function getNotificationMessage(type) {

    if (type === "like") {
        return t("notif.like");
    }

    if (type === "like_comment") {
        return t("notif.likeComment");
    }

    if (type === "post_mention") {
        return t("notif.postMention");
    }

    if (type === "comment") {
        return t("notif.comment");
    }

    if (type === "reply") {
        return t("notif.reply");
    }

    if (type === "like_milestone") {
        return t("notif.like");
    }

    if (type === "mention_post") {
        return t("notif.mentionPost");
    }

    if (type === "mention_comment") {
        return t("notif.mentionComment");
    }

    if (type === "friend_request") {
        return t("notif.friendRequest");
    }

    if (type === "friend_accepted") {
        return t("notif.friendAccepted");
    }

    if (type === "wall_post") {
        return t("notif.wallPost");
    }

    if (type === "event_going") {
        return t("notif.eventGoing");
    }

    return t("notif.default");
}