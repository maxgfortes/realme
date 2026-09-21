import { auth } from "../../../config/config.js";
import { attachMessageGestures } from "./messageGestures.js";
import { getDaySeparatorLabel, formatTimeAgo } from "./formatRelativeTime.js";
import { initReplyPreview } from "./replyPreview.js";

initReplyPreview();

const NEAR_BOTTOM_THRESHOLD_PX = 100;

let footerRefreshTimer = null;
let footerElementRef = null;
let footerDate = null;
let footerType = null;

const state = {
    chatId: null,
    otherUserName: "",
    order: [],
    nodes: new Map(),
    currentBox: null,
    currentSender: null,
    lastDate: null
};

function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

function toDate(value) {
    return value?.toDate ? value.toDate() : null;
}

export function getFirstName(fullName) {
    if (!fullName) return "";

    return String(fullName).trim().split(/\s+/)[0] || "";
}

function mount(messagesList, node) {
    const typing = messagesList.querySelector(".typing-area");

    messagesList.insertBefore(node, typing || null);
}

function scrollToBottom(messagesList, smooth) {
    if (smooth) {
        messagesList.scrollTo({
            top: messagesList.scrollHeight,
            behavior: "smooth"
        });
    } else {
        messagesList.scrollTop = messagesList.scrollHeight;
    }
}

function buildDaySeparator(date) {
    const separator = document.createElement("div");
    separator.className = "dm-day-separator";

    const label = document.createElement("span");
    label.textContent = getDaySeparatorLabel(date);

    separator.appendChild(label);

    return separator;
}

function resolveReplySenderName(replyTo, currentUserId, otherUserName) {
    if (replyTo.sender === currentUserId) {
        return "Você";
    }

    return getFirstName(otherUserName) || "Usuário";
}

function buildReplyDiv(replyTo, currentUserId, isMine, otherUserName) {
    const replyDiv = document.createElement("div");

    replyDiv.className = isMine ? "reply-message mine" : "reply-message their";

    const sender = resolveReplySenderName(
        replyTo,
        currentUserId,
        otherUserName
    );

    const content = replyTo.type === "image" ? "Imagem" : replyTo.content || "";

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

function refreshReplyNames(currentUserId) {
    state.nodes.forEach(function (entry) {
        if (!entry.replyDiv || !entry.message.replyTo) return;

        const senderSpan = entry.replyDiv.querySelector(".reply-sender");

        if (!senderSpan) return;

        const name = resolveReplySenderName(
            entry.message.replyTo,
            currentUserId,
            state.otherUserName
        );

        const next = `${name}: `;

        if (senderSpan.textContent !== next) {
            senderSpan.textContent = next;
        }
    });
}

function isImageMessage(message) {
    return (
        message.type === "image" ||
        message.content?.startsWith("https://i.ibb.co/")
    );
}

function buildBubble(message, isMine) {
    const bubble = document.createElement("div");

    if (isImageMessage(message)) {
        bubble.classList.add(isMine ? "msg-beta-image-mine" : "msg-beta-image");

        const image = document.createElement("img");
        image.src = message.content;
        image.className = "dm-image";

        image.addEventListener("load", function () {
            image.classList.add("loaded");
        });

        if (image.complete) {
            image.classList.add("loaded");
        }

        bubble.appendChild(image);
    } else {
        bubble.classList.add(isMine ? "msg-beta-mine" : "msg-beta");
        bubble.textContent = message.content;
    }

    return bubble;
}

function countReactions(message) {
    return message.reactions ? Object.keys(message.reactions).length : 0;
}

function syncReactionBadge(entry, message) {
    const count = countReactions(message);

    if (entry.reactionCount === count) return;

    const hadBadge = entry.reactionCount > 0;

    entry.reactionCount = count;

    if (count === 0) {
        entry.reactionBadge?.remove();
        entry.reactionBadge = null;
        return;
    }

    if (!entry.reactionBadge) {
        entry.reactionBadge = document.createElement("span");
        entry.reactionBadge.className = "reaction-badge";
        entry.bubble.appendChild(entry.reactionBadge);
    }

    entry.reactionBadge.textContent = count > 1 ? `❤️ ${count}` : "❤️";

    entry.reactionBadge.classList.remove("enter", "pop");
    void entry.reactionBadge.offsetWidth;
    entry.reactionBadge.classList.add(hadBadge ? "pop" : "enter");
}

function syncBubbleContent(entry, message) {
    if (isImageMessage(message)) {
        const image = entry.bubble.querySelector("img.dm-image");

        if (image && image.getAttribute("src") !== message.content) {
            image.classList.remove("loaded");
            image.src = message.content;
        }

        return;
    }

    const textNode = entry.bubble.firstChild;

    if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        if (textNode.nodeValue !== message.content) {
            textNode.nodeValue = message.content ?? "";
        }
    } else if (message.content) {
        entry.bubble.insertBefore(
            document.createTextNode(message.content),
            entry.bubble.firstChild
        );
    }
}

function appendMessage(messagesList, message, context) {
    const { currentUserId, chatId, otherUserName } = context;

    const isMine = message.sender === currentUserId;
    const messageDate = toDate(message.timestamp) || new Date();

    if (!state.lastDate || !isSameDay(state.lastDate, messageDate)) {
        mount(messagesList, buildDaySeparator(messageDate));
        state.currentSender = null;
    }

    state.lastDate = messageDate;

    if (message.sender !== state.currentSender || !state.currentBox) {
        state.currentBox = document.createElement("div");
        state.currentBox.className = isMine ? "box mine" : "box their";

        mount(messagesList, state.currentBox);

        state.currentSender = message.sender;
    }

    const box = state.currentBox;

    let replyDiv = null;

    if (message.replyTo) {
        replyDiv = buildReplyDiv(
            message.replyTo,
            currentUserId,
            isMine,
            otherUserName
        );

        box.appendChild(replyDiv);
    }

    const bubble = buildBubble(message, isMine);
    box.appendChild(bubble);

    const messageRef = { ...message };

    const entry = {
        box,
        bubble,
        replyDiv,
        reactionBadge: null,
        reactionCount: 0,
        message: messageRef
    };

    syncReactionBadge(entry, message);

    attachMessageGestures(bubble, messageRef, {
        chatId,
        isMine,
        otherUserName: otherUserName || ""
    });

    state.nodes.set(message.id, entry);
    state.order.push(message.id);

    return entry;
}

function updateMessage(entry, message) {
    Object.assign(entry.message, message);

    syncBubbleContent(entry, message);
    syncReactionBadge(entry, message);
}

function playEnterAnimation(nodes) {
    if (!nodes.length) return;

    nodes.forEach(function (node, i) {
        node.classList.add("msg-enter");
        node.style.setProperty("--msg-enter-delay", `${i * 40}ms`);

        node.addEventListener(
            "animationend",
            function () {
                node.classList.remove("msg-enter", "msg-enter-active");
                node.style.removeProperty("--msg-enter-delay");
            },
            { once: true }
        );
    });

    requestAnimationFrame(function () {
        nodes.forEach(function (node) {
            node.classList.add("msg-enter-active");
        });
    });
}

function resetList(messagesList) {

    const typing = messagesList.querySelector(".typing-area");

    messagesList.innerHTML = "";

    if (typing) {
        messagesList.appendChild(typing);
    }

    state.order = [];
    state.nodes.clear();
    state.currentBox = null;
    state.currentSender = null;
    state.lastDate = null;

    footerElementRef = null;
    footerDate = null;
    footerType = null;
}

function needsRebuild(messages, chatId) {
    if (chatId !== state.chatId) return true;
    if (state.order.length > messages.length) return true;

    for (let i = 0; i < state.order.length; i++) {
        if (state.order[i] !== messages[i]?.id) return true;
    }

    return false;
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
        if (!footerElementRef || !footerDate) {
            return;
        }

        setFooterLabelText(footerElementRef, footerType, footerDate);
    }, 60000);
}

function renderFooter(messagesList, messages, currentUserId) {
    const last = messages[messages.length - 1];
    const isMine = last && last.sender === currentUserId;

    const isSeen = isMine && last.read === true && !!last.readAt?.toDate;

    const date = isMine
        ? isSeen
            ? toDate(last.readAt)
            : toDate(last.timestamp)
        : null;

    if (!date) {
        footerElementRef?.remove();
        footerElementRef = null;
        footerDate = null;
        footerType = null;
        return;
    }

    const type = isSeen ? "seen" : "sent";
    const isNew = !footerElementRef;

    if (isNew) {
        footerElementRef = document.createElement("div");
        footerElementRef.className = "dm-seen-label";
    }

    const changed =
        footerType !== type || footerDate?.getTime() !== date.getTime();

    if (changed) {
        setFooterLabelText(footerElementRef, type, date);

        if (!isNew) {
            footerElementRef.classList.remove("dm-seen-swap");
            void footerElementRef.offsetWidth;
            footerElementRef.classList.add("dm-seen-swap");
        }
    }

    footerDate = date;
    footerType = type;

    const typing = messagesList.querySelector(".typing-area");

    const expectedLast = typing
        ? typing.previousSibling
        : messagesList.lastChild;

    if (expectedLast !== footerElementRef) {
        mount(messagesList, footerElementRef);
    }

    if (isNew) {
        playEnterAnimation([footerElementRef]);
    }
}

export function renderMessages(messages, chatId, otherUserName) {
    const messagesList = document.getElementById("dmMessages");

    if (!messagesList) return;

    const currentUserId = auth.currentUser?.uid;

    const nameChanged =
        !!otherUserName && otherUserName !== state.otherUserName;

    if (otherUserName) {
        state.otherUserName = otherUserName;
    }

    const resolvedName = state.otherUserName;

    const wasNearBottom =
        messagesList.scrollHeight -
            messagesList.scrollTop -
            messagesList.clientHeight <
        NEAR_BOTTOM_THRESHOLD_PX;

    const prevScrollTop = messagesList.scrollTop;
    const prevScrollHeight = messagesList.scrollHeight;

    const rebuilt = needsRebuild(messages, chatId);

    if (rebuilt) {
        resetList(messagesList);
    }

    state.chatId = chatId;

    const chatIsOpen = document
        .querySelector(".dm-chat-area")
        ?.classList.contains("active");

    const context = {
        currentUserId,
        chatId,
        otherUserName: resolvedName
    };

    const appended = [];

    messages.forEach(function (message) {
        const existing = state.nodes.get(message.id);

        if (existing) {
            updateMessage(existing, message);
            return;
        }

        appended.push(appendMessage(messagesList, message, context));
    });

    if (nameChanged && !rebuilt) {
        refreshReplyNames(currentUserId);
    }

    const shouldAnimate = chatIsOpen && !rebuilt && appended.length > 0;

    if (shouldAnimate) {
        playEnterAnimation(appended.map((entry) => entry.bubble));
    }

    renderFooter(messagesList, messages, currentUserId);

    if (wasNearBottom) {
        scrollToBottom(messagesList, shouldAnimate);
    } else {
        messagesList.scrollTop =
            prevScrollTop + (messagesList.scrollHeight - prevScrollHeight);
    }

    startFooterRefresh();
}

export function destroyMessages() {
    const messagesList = document.getElementById("dmMessages");

    if (messagesList) {
        resetList(messagesList);
    }

    state.chatId = null;
    state.otherUserName = "";

    if (footerRefreshTimer) {
        clearInterval(footerRefreshTimer);
        footerRefreshTimer = null;
    }
}