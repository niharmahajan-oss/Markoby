/**
 * Calendar date helpers, safe on both sides of the server/client boundary.
 *
 * Every date is a plain "YYYY-MM-DD" string anchored at UTC midnight, and every
 * formatter pins `timeZone: "UTC"`. That is the only way a founder in IST and a
 * server in UTC (and a browser in US Eastern) agree on which day an item sits
 * on — formatting a UTC-midnight Date in a negative-offset zone would otherwise
 * label it as the previous day and shift the whole calendar.
 */

const DAY_MS = 86_400_000;

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysISO(iso: string, days: number): string {
  return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}

export function todayISODate(now: Date = new Date()): string {
  // Local calendar day as the *user's* clock sees it, then treated as UTC-noon
  // so no zone can push it across a date boundary.
  const utcNoon = Date.UTC(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
  );
  return toISODate(new Date(utcNoon));
}

/** Monday of the week containing `iso` (weeks run Mon→Sun). */
export function mondayOfISO(iso: string): string {
  const weekday = parseISODate(iso).getUTCDay(); // 0 = Sunday
  return addDaysISO(iso, weekday === 0 ? -6 : 1 - weekday);
}

export function weekDates(anchorISO: string): string[] {
  const start = mondayOfISO(anchorISO);
  return Array.from({ length: 7 }, (_, index) => addDaysISO(start, index));
}

/** First day of the month containing `iso`. */
export function startOfMonthISO(iso: string): string {
  const date = parseISODate(iso);
  return toISODate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

export function addMonthsISO(iso: string, months: number): string {
  const date = parseISODate(iso);
  return toISODate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
}

/** Six Mon→Sun weeks covering the month that contains `iso`. */
export function monthGrid(iso: string): string[][] {
  const first = startOfMonthISO(iso);
  const gridStart = mondayOfISO(first);
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDaysISO(gridStart, week * 7 + day)),
  );
}

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** Maps a free-text day label ("Mon", "Tuesday", "Day 3") to a weekday index. */
export function weekdayIndexFromDay(day: string | null | undefined): number | null {
  if (!day) return null;
  const match = day.toLowerCase().match(/\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/);
  if (!match) return null;
  const index = DAY_NAMES.indexOf(match[1] as (typeof DAY_NAMES)[number]);
  return index === -1 ? null : index;
}

export function formatISODate(
  iso: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return parseISODate(iso).toLocaleDateString("en-IN", { ...options, timeZone: "UTC" });
}

export function formatWeekRange(anchorISO: string): string {
  const dates = weekDates(anchorISO);
  const start = formatISODate(dates[0], { day: "numeric", month: "short" });
  const end = formatISODate(dates[6], {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${start} – ${end}`;
}

export function formatMonth(iso: string): string {
  return parseISODate(iso).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function isTodayISO(iso: string, now: Date = new Date()): boolean {
  return iso === todayISODate(now);
}

/** Weekday index (0 = Sunday) of an ISO date. */
export function weekdayOfISO(iso: string): number {
  return parseISODate(iso).getUTCDay();
}
