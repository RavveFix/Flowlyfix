export const PLANNING_TIME_ZONE = 'Europe/Stockholm';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

interface CalendarTimeParts extends CalendarParts {
  hour: number;
  minute: number;
  second: number;
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateFormatter(timeZone: string) {
  const cacheKey = `date:${timeZone}`;
  const existing = dateFormatterCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  dateFormatterCache.set(cacheKey, formatter);
  return formatter;
}

function getDateTimeFormatter(timeZone: string) {
  const cacheKey = `datetime:${timeZone}`;
  const existing = dateTimeFormatterCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  dateTimeFormatterCache.set(cacheKey, formatter);
  return formatter;
}

function readPart(parts: Intl.DateTimeFormatPart[], partType: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === partType)?.value ?? null;
}

function toDateKey(year: number, month: number, day: number) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseDateKey(dateKey: string): CalendarParts | null {
  if (!isValidDateKey(dateKey)) {
    return null;
  }

  const [year, month, day] = dateKey.split('-').map((segment) => Number(segment));
  return { year, month, day };
}

function getCalendarParts(date: Date, timeZone: string): CalendarParts {
  const parts = getDateFormatter(timeZone).formatToParts(date);
  const year = Number(readPart(parts, 'year'));
  const month = Number(readPart(parts, 'month'));
  const day = Number(readPart(parts, 'day'));
  return { year, month, day };
}

function getCalendarTimeParts(date: Date, timeZone: string): CalendarTimeParts {
  const parts = getDateTimeFormatter(timeZone).formatToParts(date);
  const year = Number(readPart(parts, 'year'));
  const month = Number(readPart(parts, 'month'));
  const day = Number(readPart(parts, 'day'));
  const hour = Number(readPart(parts, 'hour'));
  const minute = Number(readPart(parts, 'minute'));
  const second = Number(readPart(parts, 'second'));
  return { year, month, day, hour, minute, second };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getCalendarTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function isValidDateKey(value: string | null | undefined): value is string {
  if (!value || !DATE_KEY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map((segment) => Number(segment));
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  return (
    utcDate.getUTCFullYear() === year &&
    utcDate.getUTCMonth() + 1 === month &&
    utcDate.getUTCDate() === day
  );
}

export function getTodayDateKeyInTimeZone(timeZone: string = PLANNING_TIME_ZONE): string {
  return toDateKeyInTimeZone(new Date().toISOString(), timeZone) ?? new Date().toISOString().slice(0, 10);
}

export function toDateKeyInTimeZone(iso: string | null | undefined, timeZone: string = PLANNING_TIME_ZONE): string | null {
  if (!iso) {
    return null;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const { year, month, day } = getCalendarParts(date, timeZone);
  return toDateKey(year, month, day);
}

export function isDateKeyInRange(
  dateKey: string,
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  timeZone: string = PLANNING_TIME_ZONE,
): boolean {
  if (!isValidDateKey(dateKey)) {
    return false;
  }

  const startDateKey = toDateKeyInTimeZone(startIso, timeZone);
  const endDateKey = toDateKeyInTimeZone(endIso, timeZone);
  if (!startDateKey || !endDateKey) {
    return false;
  }

  const min = startDateKey <= endDateKey ? startDateKey : endDateKey;
  const max = startDateKey <= endDateKey ? endDateKey : startDateKey;
  return dateKey >= min && dateKey <= max;
}

export function formatDateKeyForDisplay(
  iso: string | null | undefined,
  locale: string,
  options?: Intl.DateTimeFormatOptions,
  timeZone: string = PLANNING_TIME_ZONE,
): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(date);
}

export function dateKeyAtHourToIso(
  dateKey: string,
  hour: number,
  timeZone: string = PLANNING_TIME_ZONE,
): string {
  const parsed = parseDateKey(dateKey);
  if (!parsed) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`Invalid hour: ${hour}`);
  }

  const { year, month, day } = parsed;
  const requestedUtc = Date.UTC(year, month - 1, day, hour, 0, 0, 0);
  let resolvedUtc = requestedUtc;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const offsetMs = getTimeZoneOffsetMs(new Date(resolvedUtc), timeZone);
    const candidateUtc = requestedUtc - offsetMs;
    if (candidateUtc === resolvedUtc) {
      break;
    }
    resolvedUtc = candidateUtc;
  }

  const finalParts = getCalendarTimeParts(new Date(resolvedUtc), timeZone);
  const isExactMatch =
    finalParts.year === year &&
    finalParts.month === month &&
    finalParts.day === day &&
    finalParts.hour === hour &&
    finalParts.minute === 0;

  if (!isExactMatch) {
    throw new Error(`Could not resolve date key ${dateKey} at ${hour}:00 in ${timeZone}`);
  }

  return new Date(resolvedUtc).toISOString();
}
