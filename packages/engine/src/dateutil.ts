/**
 * Pure, timezone-safe date helpers.
 *
 * All dates are handled as ISO `YYYY-MM-DD` strings and manipulated in UTC so
 * the engine is fully deterministic regardless of the host timezone.
 */

export type ISODate = string; // 'YYYY-MM-DD'

const MS_PER_DAY = 86_400_000;

export function toUTC(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms: number): ISODate {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + days * MS_PER_DAY);
}

/** Inclusive number of days between two dates. */
export function daysBetween(start: ISODate, end: ISODate): number {
  return Math.round((toUTC(end) - toUTC(start)) / MS_PER_DAY) + 1;
}

/** 0 = Sunday ... 6 = Saturday (UTC). */
export function dayOfWeek(date: ISODate): number {
  return new Date(toUTC(date)).getUTCDay();
}

export function monthOf(date: ISODate): number {
  return Number(date.slice(5, 7)); // 1-12
}

export function isWeekend(date: ISODate, weekendDays: number[] = [0, 6]): boolean {
  return weekendDays.includes(dayOfWeek(date));
}

/** All dates from start to end inclusive. */
export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = toUTC(start);
  const last = toUTC(end);
  while (cur <= last) {
    out.push(fromUTC(cur));
    cur += MS_PER_DAY;
  }
  return out;
}

export function allDatesOfYear(year: number): ISODate[] {
  return dateRange(`${year}-01-01`, `${year}-12-31`);
}

/** Meteorological season for the northern hemisphere. */
export function seasonOf(date: ISODate): 'spring' | 'summer' | 'autumn' | 'winter' {
  const m = monthOf(date);
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter';
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
