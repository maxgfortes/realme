import { t } from "/src/i18n/i18n.js";
import { getUserSummary } from "/src/shared/userSummary.js";

const defaultAvatar = "../public/img/default.jpg";

export async function getUser(fromUid) {
    const summary = await getUserSummary(fromUid);

    return {
        username: summary.name || t("common.userLower"),
        handle: summary.username || "",
        userphoto: summary.photo || defaultAvatar
    };
}
