const usersList = document.getElementById("dmUsersList");

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

    usersList.appendChild(item);
}