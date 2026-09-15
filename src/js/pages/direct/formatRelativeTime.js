const MONTHS = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export function getDaySeparatorLabel(date) {
    const now = new Date();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (isSameDay(date, now)) {
        return "Hoje";
    }

    if (isSameDay(date, yesterday)) {
        return "Ontem";
    }

    const day = date.getDate();
    const month = MONTHS[date.getMonth()];

    if (date.getFullYear() !== now.getFullYear()) {
        return `${day} de ${month} de ${date.getFullYear()}`;
    }

    return `${day} de ${month}`;
}

export function formatTimeAgo(date) {
    const now = new Date();
    const diffSeconds = Math.floor((now - date) / 1000);

    if (diffSeconds < 60) {
        return "agora";
    }

    const minutes = Math.floor(diffSeconds / 60);

    if (minutes < 60) {
        return `há ${minutes} minuto${minutes > 1 ? "s" : ""}`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `há ${hours} hora${hours > 1 ? "s" : ""}`;
    }

    const days = Math.floor(hours / 24);

    return `há ${days} dia${days > 1 ? "s" : ""}`;
}

export function formatSeenTime(date) {
    const phrase = formatTimeAgo(date);

    return phrase === "agora" ? "visto agora" : `visto ${phrase}`;
}

export function formatSentTime(date) {
    const phrase = formatTimeAgo(date);

    return phrase === "agora" ? "enviado agora" : `enviado ${phrase}`;
}