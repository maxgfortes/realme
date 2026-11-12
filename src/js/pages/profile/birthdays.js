import { t, getLocale } from "/src/i18n/i18n.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";
import { app, auth } from "./firebase.js";

const functions = getFunctions(app, "us-central1");
const birthdaysCall = httpsCallable(functions, "friendBirthdays");

const CACHE_KEY = "realme.birthdays.v1";
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_PHOTO = "/public/img/default.jpg";
const UPCOMING_DAYS = 60;

const panel = document.querySelector("[data-birthdays-panel]");
const grid = document.getElementById("bdayGrid");
const weekdays = document.getElementById("bdayWeekdays");
const monthTitle = document.getElementById("bdayMonthTitle");
const list = document.getElementById("bdayList");
const listTitle = document.getElementById("bdayListTitle");

let birthdays = [];
let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let selectedDay = null;
let loaded = false;

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

function readCache() {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
        if (!cached || cached.uid !== auth.currentUser?.uid) return null;
        return cached;
    } catch {
        return null;
    }
}

function writeCache(items) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ uid: auth.currentUser?.uid, at: Date.now(), items }));
    } catch {}
}

function isLeap(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dayInYear(item, year) {
    return item.month === 2 && item.day === 29 && !isLeap(year) ? 28 : item.day;
}

function onDate(year, month, day) {
    return birthdays.filter(item => item.month === month + 1 && dayInYear(item, year) === day);
}

function nextOccurrence(item, from) {
    let year = from.getFullYear();
    let date = new Date(year, item.month - 1, dayInYear(item, year));

    if (date < from) {
        year++;
        date = new Date(year, item.month - 1, dayInYear(item, year));
    }

    return date;
}

function startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function renderWeekdays() {
    const formatter = new Intl.DateTimeFormat(getLocale(), { weekday: "narrow" });
    const base = new Date(2024, 0, 7);

    weekdays.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + index);
        return `<span>${escapeHTML(formatter.format(date))}</span>`;
    }).join("");
}

function avatarStack(people) {
    const shown = people.slice(0, 2);

    return `
        <span class="bday-faces${people.length > 1 ? " multi" : ""}">
            ${shown.map(person => `<img src="${escapeHTML(person.photo || DEFAULT_PHOTO)}" alt="" loading="lazy">`).join("")}
        </span>
    `;
}

function renderGrid() {
    const title = new Intl.DateTimeFormat(getLocale(), { month: "long", year: "numeric" })
        .format(new Date(viewYear, viewMonth, 1));

    monthTitle.textContent = title.charAt(0).toLocaleUpperCase() + title.slice(1);

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = startOfToday();

    const cells = [];

    for (let i = 0; i < firstWeekday; i++) cells.push('<span class="bday-cell empty"></span>');

    for (let day = 1; day <= daysInMonth; day++) {
        const people = onDate(viewYear, viewMonth, day);
        const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
        const classes = ["bday-cell"];

        if (people.length) classes.push("has-bday");
        if (isToday) classes.push("today");
        if (selectedDay === day) classes.push("selected");

        cells.push(`
            <button class="${classes.join(" ")}" type="button" data-day="${day}" ${people.length ? "" : "disabled"}>
                <span class="bday-day">${day}</span>
                ${people.length ? avatarStack(people) : ""}
            </button>
        `);
    }

    grid.innerHTML = cells.join("");
}

function personRow(person, date, today) {
    const diff = Math.round((date - today) / 86400000);
    const when = diff === 0
        ? t("birthdays.today")
        : diff === 1
            ? t("birthdays.tomorrow")
            : new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "long" }).format(date);
    const age = person.year ? date.getFullYear() - person.year : null;

    return `
        <a class="bday-row${diff === 0 ? " is-today" : ""}" href="/profile.html?uid=${encodeURIComponent(person.uid)}">
            <span class="bday-row-pfp" data-presence-uid="${escapeHTML(person.uid)}"><img src="${escapeHTML(person.photo || DEFAULT_PHOTO)}" alt="" loading="lazy"></span>
            <span class="bday-row-info">
                <span class="bday-row-name">${escapeHTML(person.name)}</span>
                <span class="bday-row-when">${escapeHTML(when)}${age && age > 0 && age < 120 ? ` · ${escapeHTML(t("birthdays.turns", { age }))}` : ""}</span>
            </span>
        </a>
    `;
}

function renderList() {
    const today = startOfToday();

    if (selectedDay) {
        const date = new Date(viewYear, viewMonth, selectedDay);
        const people = onDate(viewYear, viewMonth, selectedDay);
        listTitle.textContent = new Intl.DateTimeFormat(getLocale(), { day: "numeric", month: "long" }).format(date);
        list.innerHTML = people.map(person => personRow(person, date, today)).join("");
        return;
    }

    listTitle.textContent = t("birthdays.upcoming");

    const upcoming = birthdays
        .map(person => ({ person, date: nextOccurrence(person, today) }))
        .filter(entry => (entry.date - today) / 86400000 <= UPCOMING_DAYS)
        .sort((a, b) => a.date - b.date);

    list.innerHTML = upcoming.length
        ? upcoming.map(entry => personRow(entry.person, entry.date, today)).join("")
        : `<div class="bday-empty">${escapeHTML(birthdays.length ? t("birthdays.noneSoon") : t("birthdays.empty"))}</div>`;
}

function render() {
    renderGrid();
    renderList();
}

async function load() {
    const cached = readCache();

    if (cached) {
        birthdays = cached.items || [];
        loaded = true;
        render();
        if (Date.now() - cached.at < CACHE_TTL_MS) return;
    } else {
        list.innerHTML = `<div class="loading-gif-area"><img class="loading-gif" src="/public/img/loading.gif" alt=""></div>`;
    }

    try {
        const { data } = await birthdaysCall({});
        birthdays = Array.isArray(data?.birthdays) ? data.birthdays : [];
        writeCache(birthdays);
        loaded = true;
        render();
    } catch (error) {
        console.error("Erro ao carregar aniversários:", error);
        if (!loaded) list.innerHTML = `<div class="bday-empty">${escapeHTML(t("birthdays.error"))}</div>`;
    }
}

function changeMonth(delta) {
    const date = new Date(viewYear, viewMonth + delta, 1);
    viewYear = date.getFullYear();
    viewMonth = date.getMonth();
    selectedDay = null;
    render();
}

function open(event) {
    event.preventDefault();

    document
        .querySelectorAll(".side-menu.active:not([data-birthdays-panel])")
        .forEach(menu => menu.classList.add("behind"));

    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();
    selectedDay = null;

    panel.classList.add("active");
    render();
    load();
}

function close() {
    panel.classList.remove("active");

    document
        .querySelectorAll(".side-menu.active.behind")
        .forEach(menu => menu.classList.remove("behind"));
}

if (panel && grid) {
    renderWeekdays();

    document.querySelectorAll("[data-birthdays-trigger]").forEach(trigger => trigger.addEventListener("click", open));
    panel.querySelectorAll("[data-birthdays-close]").forEach(button => button.addEventListener("click", close));
    document.getElementById("bdayPrev")?.addEventListener("click", () => changeMonth(-1));
    document.getElementById("bdayNext")?.addEventListener("click", () => changeMonth(1));

    grid.addEventListener("click", event => {
        const cell = event.target.closest(".bday-cell.has-bday");
        if (!cell) return;

        const day = Number(cell.dataset.day);
        selectedDay = selectedDay === day ? null : day;
        render();
    });
}
