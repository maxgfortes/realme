export function formatDate(date) {
    if (!date) { return ""; }

    const now = new Date();
    const difference = now - date;
    const minutes = Math.floor(difference / 60000);
    const hours = Math.floor(difference / 3600000);
    const days = Math.floor(difference / 86400000);

    if (minutes < 1) {
        return "agora";
    }
    if (minutes < 60) {
        return "há " + minutes + " minutos";
    }
    if (hours < 24) {
        return "há " + hours + " horas";
    }
    if (days < 7) {
        return "há " + days + " dias";
    }

    return date.toLocaleDateString("pt-BR", {
        day: "numeric",
        month: "short"
    }).replace(".", "");
}