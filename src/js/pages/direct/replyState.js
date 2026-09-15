let currentReply = null;
const listeners = new Set();

function notify() {
    listeners.forEach(callback => callback(currentReply));
}

export function setReplyingTo(message, senderName) {
    const isImage =
        message.type === "image" ||
        message.content?.startsWith("https://i.ibb.co/");

    currentReply = {
        id: message.id,
        content: isImage ? "📷 Imagem" : message.content,
        sender: message.sender,
        senderName,
        timestamp: message.timestamp,
        type: message.type || "text"
    };

    notify();
}

export function clearReplyingTo() {
    currentReply = null;
    notify();
}

export function getReplyingTo() {
    return currentReply;
}

export function consumeReplyingTo() {
    const reply = currentReply;
    currentReply = null;
    notify();
    return reply;
}

export function onReplyChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}