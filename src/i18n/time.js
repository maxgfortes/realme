import { t, formatDate } from "./i18n.js";

const SECOND = 1000;
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function capitalize(text) {
  return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function elapsed(value, now = Date.now()) {
  const date = toDate(value);
  if (!date) return null;

  const seconds = Math.max(0, Math.floor((now - date.getTime()) / SECOND));
  const days = Math.floor(seconds / DAY);

  if (seconds < MINUTE) return { unit: "now", count: 0 };
  if (seconds < HOUR) return { unit: "minute", count: Math.floor(seconds / MINUTE) };
  if (seconds < DAY) return { unit: "hour", count: Math.floor(seconds / HOUR) };
  if (days < 7) return { unit: "day", count: days };
  if (days < 28) return { unit: "week", count: Math.floor(days / 7) };
  if (days < 365) return { unit: "month", count: Math.max(1, Math.floor(days / 30)) };
  return { unit: "year", count: Math.floor(days / 365) };
}

export function timeAgo(value, { capital = false, short = false, nowKey = "time.justNow" } = {}) {
  const parts = elapsed(value);
  if (!parts) return "";

  const text = parts.unit === "now"
    ? t(nowKey)
    : t(`${short ? "time.agoShort" : "time.ago"}.${parts.unit}`, { count: parts.count });

  return capital ? capitalize(text) : text;
}

export function dayLabel(value, { capital = true } = {}) {
  const date = toDate(value);
  if (!date) return "";

  const start = day => new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(date)) / (DAY * SECOND));

  let text;
  if (diff <= 0) text = t("time.today");
  else if (diff === 1) text = t("time.yesterday");
  else if (diff < 7) text = t(`time.weekday.${date.getDay()}`);
  else text = formatDate(date, { day: "numeric", month: "long", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

  return capital ? capitalize(text) : text;
}

export { capitalize, toDate };
