import { formatDate as formatIntlDate } from "/src/i18n/i18n.js";
import { timeAgo } from "/src/i18n/time.js";
export function formatDate(date) {
    if (!date) { return ""; }

    const days = Math.floor((Date.now() - date.getTime()) / 86400000);

    if (days < 7) return timeAgo(date, { nowKey: "time.now" });

    return formatIntlDate(date, { day: "numeric", month: "short" }).replace(".", "");
}