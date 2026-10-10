function getDayLabel(date) {

    const now = new Date();

    const todayStart =
        new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dateStart =
        new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const diffTime = todayStart - dateStart;
    const diffDays = Math.floor(diffTime / 86400000);

    if (diffDays === 0) {
        return "Hoje";
    }

    if (diffDays === 1) {
        return "Ontem";
    }

    const weekdays = [
        "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"
    ];

    if (diffDays < 7) {
        return weekdays[date.getDay()];
    }

    const diffWeeks = Math.floor(diffDays / 7);

    if (diffWeeks === 1) {
        return "Semana passada";
    }

    if (diffWeeks < 5) {
        return "Há " + diffWeeks + " semanas";
    }

    const diffMonths =
        (now.getFullYear() - date.getFullYear()) * 12 +
        (now.getMonth() - date.getMonth());

    if (diffMonths === 1) {
        return "Mês passado";
    }

    if (diffMonths < 12) {
        return "Há " + diffMonths + " meses";
    }

    const diffYears = now.getFullYear() - date.getFullYear();

    if (diffYears === 1) {
        return "Ano passado";
    }

    return "Há " + diffYears + " anos";
}


export function groupByDay(notifications) {

    const groups = {};
    const order = [];

    for (const notification of notifications) {

        const label = getDayLabel(notification.createdAt);

        if (!groups[label]) {
            groups[label] = [];
            order.push(label);
        }

        groups[label].push(notification);
    }

    return {
        groups: groups,
        order: order
    };
}