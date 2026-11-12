import { getLocale } from "/src/i18n/i18n.js";

const ENDPOINT = "https://us-central1-ifriendmatch.cloudfunctions.net/publicStats";
const CACHE_KEY = "realme.publicStats.v1";
const CACHE_TTL_MS = 10 * 60 * 1000;

const element = document.getElementById("userCountStat");

function render(count) {
    if (!element || !Number.isFinite(count) || count <= 0) return;
    element.textContent = new Intl.NumberFormat(getLocale()).format(count);
}

function readCache() {
    try {
        return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    } catch {
        return null;
    }
}

async function load() {
    const cached = readCache();

    if (cached) {
        render(cached.users);
        if (Date.now() - cached.at < CACHE_TTL_MS) return;
    }

    try {
        const response = await fetch(ENDPOINT);
        if (!response.ok) return;

        const data = await response.json();
        render(data.users);

        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ users: data.users, at: Date.now() }));
        } catch {}
    } catch {}
}

load();
