import { auth } from "../../../config/config.js";
import { attachMessageGestures } from "./messageGestures.js";
import { getDaySeparatorLabel, formatTimeAgo } from "./formatRelativeTime.js";
import { initReplyPreview } from "./replyPreview.js";

initReplyPreview();

let footerRefreshTimer = null;
let footerElementRef = null;
let footerDate = null;
let footerType = null;

function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function buildDaySeparator(date) {
    const separator = document.createElement("div");
    separator.className = "dm-day-separator";

    const label = document.createElement("span");
    label.textContent = getDaySeparatorLabel(date);

    separator.appendChild(label);
    return separator;
}

function buildReplyDiv(replyTo, currentUserId, isMine) {
    const replyDiv = document.createElement("div");
    replyDiv.className = isMine ? "reply-message mine" : "reply-message their";

    const sender =
        replyTo.sender === currentUserId
            ? "Você"
            : replyTo.senderName || "Usuário";

    const content =
        replyTo.type === "image"
            ? "Imagem"
            : replyTo.content || "";

    const senderSpan = document.createElement("span");
    senderSpan.className = "reply-sender";
    senderSpan.textContent = `${sender}: `;

    const contentSpan = document.createElement("span");
    contentSpan.className = "reply-content";
    contentSpan.textContent = content;

    replyDiv.appendChild(senderSpan);
    replyDiv.appendChild(contentSpan);

    return replyDiv;
}

function setFooterLabelText(labelEl, type, date) {
    labelEl.innerHTML = "";

    const prefix = document.createElement("span");
    prefix.className = "dm-footer-prefix";
    prefix.textContent = type === "seen" ? "visto" : "enviado";

    labelEl.appendChild(prefix);
    labelEl.appendChild(document.createTextNode(` ${formatTimeAgo(date)}`));
}

function startFooterRefresh() {
    if (footerRefreshTimer) {
        clearInterval(footerRefreshTimer);
    }

    footerRefreshTimer = setInterval(() => {
        if (!footerElementRef || !footerDate) return;
        setFooterLabelText(footerElementRef, footerType, footerDate);
    }, 60000);
}

function createBubble(message, isMine) {
    const bubble = document.createElement("div");

    if (
        message.type === "image" ||
        message.content?.startsWith("https://i.ibb.co/")
    ) {
        bubble.classList.add(isMine ? "msg-beta-image-mine" : "msg-beta-image");

        const image = document.createElement("img");
        image.src = message.content;
        image.className = "dm-image";
        bubble.appendChild(image);
    } else {
        bubble.classList.add(isMine ? "msg-beta-mine" : "msg-beta");
        bubble.textContent = message.content;
    }

    const reactionKeys = message.reactions ? Object.keys(message.reactions) : [];
    if (reactionKeys.length > 0) {
        const reactionBadge = document.createElement("span");
        reactionBadge.className = "reaction-badge";
        reactionBadge.textContent =
            reactionKeys.length > 1 ? `❤️ ${reactionKeys.length}` : "❤️";
        bubble.appendChild(reactionBadge);
    }

    return bubble;
}

export function renderMessages(messages, chatId, otherUserName) {
    const messagesList = document.getElementById("dmMessages");
    if (!messagesList) return;

    const NEAR_BOTTOM_THRESHOLD_PX = 100;

    const wasNearBottom =
        messagesList.scrollHeight -
            messagesList.scrollTop -
            messagesList.clientHeight <
        NEAR_BOTTOM_THRESHOLD_PX;

    const prevScrollTop = messagesList.scrollTop;
    const prevScrollHeight = messagesList.scrollHeight;

    messagesList.innerHTML = "";

    const currentUserId = auth.currentUser?.uid;

    let currentBox = null;
    let currentSender = null;
    let lastDate = null;

    const lastMessageId = messages[messages.length - 1]?.id;

    const chatIsOpen = document
        .querySelector(".dm-chat-area")
        ?.classList.contains("active");

    footerElementRef = null;
    footerDate = null;
    footerType = null;

    messages.forEach(function (message, index) {
        const isMine = message.sender === currentUserId;
        const messageDate = message.timestamp?.toDate
            ? message.timestamp.toDate()
            : new Date();

        if (!lastDate || !isSameDay(lastDate, messageDate)) {
            messagesList.appendChild(buildDaySeparator(messageDate));
            currentSender = null;
        }
        lastDate = messageDate;

        if (message.sender !== currentSender) {
            currentBox = document.createElement("div");
            currentBox.className = isMine ? "box mine" : "box their";
            messagesList.appendChild(currentBox);
            currentSender = message.sender;
        }

        if (message.replyTo) {
            currentBox.appendChild(
                buildReplyDiv(message.replyTo, currentUserId, isMine)
            );
        }

        const bubble = createBubble(message, isMine);
        currentBox.appendChild(bubble);

        attachMessageGestures(bubble, message, {
            chatId,
            isMine,
            otherUserName: otherUserName || ""
        });

        if (message.id === lastMessageId && chatIsOpen) {
            bubble.classList.add("message-enter");
            requestAnimationFrame(() => {
                bubble.classList.add("show");
            });
        }

        if (index === messages.length - 1 && isMine) {
            const isSeen = message.read === true && message.readAt?.toDate;
            const footerDate2 = isSeen
                ? message.readAt.toDate()
                : message.timestamp?.toDate?.();

            if (footerDate2) {
                const footerLabel = document.createElement("div");
                footerLabel.className = "dm-seen-label";

                setFooterLabelText(
                    footerLabel,
                    isSeen ? "seen" : "sent",
                    footerDate2
                );

                messagesList.appendChild(footerLabel);

                footerElementRef = footerLabel;
                footerDate = footerDate2;
                footerType = isSeen ? "seen" : "sent";
            }
        }
    });

    if (wasNearBottom) {
        messagesList.scrollTop = messagesList.scrollHeight;
    } else {
        messagesList.scrollTop =
            prevScrollTop + (messagesList.scrollHeight - prevScrollHeight);
    }

    startFooterRefresh();
}

export function appendMessages(newMessages, chatId, otherUserName) {
    const messagesList = document.getElementById("dmMessages");
    if (!messagesList || newMessages.length === 0) return;

    const currentUserId = auth.currentUser?.uid;

    const wasNearBottom =
        messagesList.scrollHeight -
            messagesList.scrollTop -
            messagesList.clientHeight <
        120;

    const oldFooter = messagesList.querySelector(".dm-seen-label");
    if (oldFooter) oldFooter.remove();

    let currentBox = messagesList.querySelector(".box:last-of-type");
    let currentSender = null;

    if (currentBox) {
        currentSender = currentBox.classList.contains("mine")
            ? currentUserId
            : "other";
    }

    newMessages.forEach((message) => {
        const isMine = message.sender === currentUserId;

        if (
            !currentBox ||
            (isMine && currentSender !== currentUserId) ||
            (!isMine && currentSender === currentUserId)
        ) {
            currentBox = document.createElement("div");
            currentBox.className = isMine ? "box mine" : "box their";
            messagesList.appendChild(currentBox);
            currentSender = isMine ? currentUserId : "other";
        }

        if (message.replyTo) {
            currentBox.appendChild(
                buildReplyDiv(message.replyTo, currentUserId, isMine)
            );
        }

        const bubble = createBubble(message, isMine);
        currentBox.appendChild(bubble);

        attachMessageGestures(bubble, message, {
            chatId,
            isMine,
            otherUserName: otherUserName || ""
        });

        bubble.classList.add("message-enter");
        requestAnimationFrame(() => {
            bubble.classList.add("show");
        });
    });

    const lastMsg = newMessages[newMessages.length - 1];
    if (lastMsg && lastMsg.sender === currentUserId) {
        const footerDate2 = lastMsg.timestamp?.toDate?.() || new Date();

        const footerLabel = document.createElement("div");
        footerLabel.className = "dm-seen-label";

        setFooterLabelText(footerLabel, "sent", footerDate2);
        messagesList.appendChild(footerLabel);

        footerElementRef = footerLabel;
        footerDate = footerDate2;
        footerType = "sent";
        startFooterRefresh();
    }

    if (wasNearBottom) {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}
