const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;
const TIME_ONLY_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const ORG_TIMEZONE_KEY = "wz_org_timezone";
const FALLBACK_TIMEZONE = "UTC";

function isValidTimezone(value) {
  const tz = String(value || "").trim();
  if (!tz) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch (error) {
    return false;
  }
}

function normalizeTimezone(value) {
  return isValidTimezone(value) ? String(value).trim() : FALLBACK_TIMEZONE;
}

function readStoredTimezone() {
  if (typeof window === "undefined") {
    return FALLBACK_TIMEZONE;
  }
  const stored = window.localStorage.getItem(ORG_TIMEZONE_KEY);
  return normalizeTimezone(stored);
}

let orgTimezone = readStoredTimezone();

export function setOrgTimezone(value) {
  orgTimezone = normalizeTimezone(value);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ORG_TIMEZONE_KEY, orgTimezone);
  }
  return orgTimezone;
}

export function getOrgTimezone() {
  if (typeof window === "undefined") {
    return orgTimezone;
  }
  return setOrgTimezone(window.localStorage.getItem(ORG_TIMEZONE_KEY) || orgTimezone);
}

function parseDateOnly(value) {
  const match = DATE_ONLY_RE.exec(String(value || "").trim());
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 0, 0, 0));
}

function parseDateTimeAsUtc(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (raw.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const match = DATE_TIME_RE.exec(raw);
  if (!match) {
    return null;
  }
  const [, year, month, day, hour, minute, second = "00"] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
}

export function formatDeviceDate(value, fallback = "-") {
  if (!value) {
    return fallback;
  }
  const parsed = parseDateOnly(value) || parseDateTimeAsUtc(value);
  if (!parsed) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, { timeZone: getOrgTimezone() });
}

export function formatDeviceDateTime(value, fallback = "-") {
  if (!value) {
    return fallback;
  }
  const parsed = parseDateTimeAsUtc(value);
  if (!parsed) {
    return value;
  }
  return parsed.toLocaleString(undefined, { timeZone: getOrgTimezone() });
}

export function formatDeviceTimeWithDate(timeValue, dateValue, fallback = "-") {
  if (!timeValue) {
    return fallback;
  }
  const timeText = String(timeValue || "").trim();
  if (!TIME_ONLY_RE.test(timeText)) {
    return timeText || fallback;
  }

  const dateMatch = DATE_ONLY_RE.exec(String(dateValue || "").trim());
  if (!dateMatch) {
    return timeText;
  }

  const [, year, month, day] = dateMatch;
  const [, hour, minute, second = "00"] = TIME_ONLY_RE.exec(timeText) || [];
  const parsed = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );

  if (Number.isNaN(parsed.getTime())) {
    return timeText;
  }
  return parsed.toLocaleTimeString(undefined, { timeZone: getOrgTimezone() });
}
