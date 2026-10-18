import { t } from "/src/i18n/i18n.js";
import { timeAgo, dayLabel } from "/src/i18n/time.js";
function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export function getDaySeparatorLabel(date) {
    return dayLabel(date);
}

export function formatTimeAgo(date) {
    return timeAgo(date, { nowKey: "time.now" });
}

export function formatSeenTime(date) {
    return t("dm.seen", { time: formatTimeAgo(date) });
}

export function formatSentTime(date) {
    return t("dm.sent", { time: formatTimeAgo(date) });
}