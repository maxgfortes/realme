import { t } from "/src/i18n/i18n.js";
function getDayLabel(date) {

    const now = new Date();

    const todayStart =
        new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dateStart =
        new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = todayStart - dateStart;
    const diffDays = Math.floor(diffTime / 86400000);

    if (diffDays === 0) {
        return t("time.today").replace(/^./, c => c.toUpperCase());
    }

    if (diffDays === 1) {
        return t("time.yesterday").replace(/^./, c => c.toUpperCase());
    }

    const weekdays = [0, 1, 2, 3, 4, 5, 6].map(day => t(`time.weekdayCap.${day}`));

    if (diffDays < 7) {
        return weekdays[date.getDay()];
    }

    const diffWeeks = Math.floor(diffDays / 7);

    if (diffWeeks === 1) {
        return t("time.lastWeek");
    }

    if (diffWeeks < 5) {
        return t("time.weeksAgoCap", { count: diffWeeks });
    }

    const diffMonths =
        (now.getFullYear() - date.getFullYear()) * 12 +
        (now.getMonth() - date.getMonth());

    if (diffMonths === 1) {
        return t("time.lastMonth");
    }

    if (diffMonths < 12) {
        return t("time.monthsAgoCap", { count: diffMonths });
    }

    const diffYears = now.getFullYear() - date.getFullYear();

    if (diffYears === 1) {
        return t("time.lastYear");
    }

    return t("time.yearsAgoCap", { count: diffYears });
}

export function groupByDay(notifications) {

    const groups = {};
    const order = [];

    for (const notification of notifications) {

        const label = getDayLabel(notification.createdAt);

        if (!groups[label]) {
            groups[label] = [];
            order.push(label);
        }

        groups[label].push(notification);
    }

    return {
        groups: groups,
        order: order
    };
}