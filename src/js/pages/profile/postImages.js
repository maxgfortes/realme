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

export function getPostImages(post) {
    const fromArray = Array.isArray(post.imgs)
        ? post.imgs.map(readImageUrl)
        : [];

    const urls = [
        readImageUrl(post.img),
        ...fromArray
    ].filter(Boolean);

    return [...new Set(urls)];
}