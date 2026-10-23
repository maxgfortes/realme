const usersList = document.getElementById("dmUsersList");
const MAX_ANIMATED_ROWS = 12;

export function renderUsers( chatId, uid, fullName, userPfp, lastMessage, messageTime, unread) {
    const item = document.createElement("div");

    item.className = "user-list-box";
    
    item.dataset.name = fullName.toLowerCase();
    item.dataset.uid = uid;
    item.dataset.chatId = chatId;

    item.innerHTML = `
        <div class="user-pfp-area">
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