import { t } from "/src/i18n/i18n.js";
import { showToast } from "./toast.js";

export async function shareProfile(username) {
  const url = `${location.origin}${location.pathname}?username=${encodeURIComponent(username)}`;

  if (navigator.share) {
    await navigator.share({ title: t("profile.shareTitle", { name: username }), url }).catch(() => {});
    return;
  }

  await navigator.clipboard.writeText(url);
  showToast(t("profile.linkCopied"));
}
