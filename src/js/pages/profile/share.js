import { showToast } from "./toast.js";

export async function shareProfile(username) {
  const url = `${location.origin}${location.pathname}?username=${encodeURIComponent(username)}`;

  if (navigator.share) {
    await navigator.share({ title: `Perfil de ${username}`, url }).catch(() => {});
    return;
  }

  await navigator.clipboard.writeText(url);
  showToast("Link do perfil copiado.");
}
