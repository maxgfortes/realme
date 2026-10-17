export function postSegments(postId) {
    const id = String(postId || "");

    return id.includes("/") ? id.split("/").filter(Boolean) : ["posts", id];
}

export function isWallPostId(postId) {
    return String(postId || "").includes("/wall/");
}
