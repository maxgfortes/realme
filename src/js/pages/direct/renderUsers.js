const usersList = document.getElementById("dmUsersList");
const MAX_ANIMATED_ROWS = 12;

export function renderUsers( chatId, uid, fullName, userPfp, lastMessage, messageTime, unread) {
    const item = document.createElement("div");

    item.className = "user-list-box";
    
    item.dataset.name = fullName.toLowerCase();
    item.dataset.uid = uid;
    item.dataset.chatId = chatId;

    item.innerHTML = `
        <div class="user-pfp-area" data-presence-uid="${uid}">
            <img src="${userPfp}" onerror="this.onerror=null; this.src='./public/img/default.jpg';">
        </div>

        <div class="user-list-box-infos">
            <div class="user-box-displayname ${unread ? "active" : ""}">${fullName}</div>
            <div class="last-msg ${unread ? "active" : ""}">${lastMessage}</div>
        </div>

        <div class="user-list-box-more">
            <div class="user-list-box-date">${messageTime}</div>
            <div class="new-msg-dot ${unread ? "active" : ""}"></div>
        </div>
    `;

    const index = usersList.querySelectorAll(".user-list-box").length;

    if (index < MAX_ANIMATED_ROWS) {
        item.classList.add("enter");
        item.style.setProperty("--row-delay", `${index * 35}ms`);
        item.addEventListener("animationend", () => {
            item.classList.remove("enter");
            item.style.removeProperty("--row-delay");
        }, { once: true });
    }

    usersList.appendChild(item);
}
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

export function groupAvatarHTML(group) {
    if (group.photo) {
        return `<img class="group-photo" src="${escapeHTML(group.photo)}" onerror="this.onerror=null; this.src='./public/img/default.jpg';">`;
    }

    const photos = (group.memberPhotos || []).slice(0, 2);
    while (photos.length < 2) photos.push("./public/img/default.jpg");

    return `
        <span class="group-stack">
            <img src="${escapeHTML(photos[0])}" onerror="this.onerror=null; this.src='./public/img/default.jpg';">
            <img src="${escapeHTML(photos[1])}" onerror="this.onerror=null; this.src='./public/img/default.jpg';">
        </span>
    `;
}

export function renderGroup(chatId, group, lastMessage, messageTime, unread) {
    const item = document.createElement("div");

    item.className = `user-list-box group-box${group.isEvent ? " event-group" : ""}`;
    item.dataset.chatId = chatId;
    item.dataset.uid = "";
    item.dataset.group = "1";
    item.dataset.name = String(group.name || "").toLowerCase();

    item.innerHTML = `
        <div class="user-pfp-area group-pfp">${groupAvatarHTML(group)}</div>

        <div class="user-list-box-infos">
            <div class="user-box-displayname ${unread ? "active" : ""}"></div>
            <div class="last-msg ${unread ? "active" : ""}"></div>
        </div>

        <div class="user-list-box-more">
            <div class="user-list-box-date">${escapeHTML(messageTime)}</div>
            <div class="new-msg-dot ${unread ? "active" : ""}"></div>
        </div>
    `;

    item.querySelector(".user-box-displayname").textContent = group.name || "";
    item.querySelector(".last-msg").textContent = lastMessage || "";

    usersList.appendChild(item);

    return item;
}
