function readImageUrl(item) {
    if (typeof item === "string") {
        return item.trim();
    }

    if (typeof item?.url === "string") {
        return item.url.trim();
    }

    if (typeof item?.img === "string") {
        return item.img.trim();
    }

    return "";
}

export function isVideoItem(item) {
    if (item?.type === "video") return true;

    return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(readImageUrl(item));
}

export function getPostMedia(post) {
    const items = [
        post.img,
        ...(Array.isArray(post.imgs) ? post.imgs : [])
    ].filter(Boolean);

    const seen = new Set();

    return items
        .map(item => ({
            src: readImageUrl(item),
            video: isVideoItem(item),
            poster: typeof item?.poster === "string" ? item.poster.trim() : ""
        }))
        .filter(item => {
            if (!item.src || seen.has(item.src)) return false;
            seen.add(item.src);
            return true;
        });
}

export function getPostImages(post) {
    return getPostMedia(post)
        .filter(item => !item.video)
        .map(item => item.src);
}
