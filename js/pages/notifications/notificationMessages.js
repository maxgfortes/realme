export function getNotificationMessage(type) {

    if (type === "like") {
        return "curtiu sua publicação.";
    }

    if (type === "like_comment") {
        return "curtiu seu comentário.";
    }

    if (type === "comment") {
        return "comentou na sua publicação.";
    }

    if (type === "reply") {
        return "respondeu seu comentário.";
    }

    if (type === "like_milestone") {
        return "curtiu sua publicação.";
    }

    if (type === "mention_post") {
        return "te mencionou em uma publicação.";
    }

    if (type === "mention_comment") {
        return "te mencionou em um comentário.";
    }

    if (type === "friend_request") {
        return "te enviou um pedido de amizade.";
    }

    if (type === "friend_accepted") {
        return "aceitou seu pedido de amizade.";
    }

    return "interagiu com você.";
}