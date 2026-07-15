import {
  ISODate,
  addDays,
  allDatesOfYear,
  dateRange,
  daysBetween,
  isWeekend,
  monthOf,
  seasonOf,
} from './dateutil.js';
import type { DateRangeSpec, EngineInput, Holiday } from './types.js';

export type DayKind = 'work' | 'weekend' | 'holiday' | 'shutdown' | 'blackout';

export interface DayInfo {
  date: ISODate;
  kind: DayKind;
  /** True when the day is off without spending leave. */
  naturallyOff: boolean;
  /** True when leave may be booked here. */
  bookable: boolean;
  holidayName?: string;
}

function inRanges(date: ISODate, ranges: DateRangeSpec[]): DateRangeSpec | undefined {
  return ranges.find((r) => date >= r.start && date <= r.end);
}

/**
 * Classify every day of the year. A day is "naturally off" when it is a
 * weekend, bank/company holiday, or during a shutdown. Blackout ranges make a
 * day non-bookable (you cannot spend leave there).
 */
export function buildCalendar(input: EngineInput): Map<ISODate, DayInfo> {
  const holidayByDate = new Map<ISODate, Holiday>();
  for (const h of input.holidays) holidayByDate.set(h.date, h);

  const map = new Map<ISODate, DayInfo>();
  for (const date of allDatesOfYear(input.year)) {
    const holiday = holidayByDate.get(date);
    const shutdown = inRanges(date, input.leave.shutdowns);
    const blackout = inRanges(date, input.blackouts);
    const weekend = isWeekend(date, input.weekendDays);

    let kind: DayKind = 'work';
    let naturallyOff = false;
    if (holiday) {
      kind = 'holiday';
      naturallyOff = true;
    } else if (shutdown) {
      kind = 'shutdown';
      naturallyOff = true;
    } else if (weekend) {
      kind = 'weekend';
      naturallyOff = true;
    }

    // Blackout only matters on otherwise-workable days: it blocks booking.
    const bookable = !naturallyOff && !blackout;
    if (blackout && !naturallyOff) kind = 'blackout';

    map.set(date, {
      date,
      kind,
      naturallyOff,
      bookable,
      holidayName: holiday?.name,
    });
  }
  return map;
}

/**
 * Given a calendar and a set of leave dates to book, compute the maximal
 * contiguous runs of days off (including the booked leave). Only runs that
 * contain at least one booked leave day are returned as "breaks".
 */
export function computeBreaks(
  calendar: Map<ISODate, DayInfo>,
  leaveDates: Set<ISODate>,
  year: number,
): { start: ISODate; end: ISODate; leaveDatesUsed: ISODate[]; totalDaysOff: number }[] {
  const isOff = (date: ISODate): boolean => {
    const info = calendar.get(date);
    if (!info) return false; // outside the year → treat as work boundary
    return info.naturallyOff || leaveDates.has(date);
  };

  const results: {
    start: ISODate;
    end: ISODate;
    leaveDatesUsed: ISODate[];
    totalDaysOff: number;
  }[] = [];

  const all = allDatesOfYear(year);
  let i = 0;
  while (i < all.length) {
    if (!isOff(all[i])) {
      i++;
      continue;
    }
    // start of an off-run
    let j = i;
    while (j + 1 < all.length && isOff(all[j + 1])) j++;
    const start = all[i];
    const end = all[j];
    const used = dateRange(start, end).filter((d) => leaveDates.has(d));
    if (used.length > 0) {
      results.push({
        start,
        end,
        leaveDatesUsed: used,
        totalDaysOff: daysBetween(start, end),
      });
    }
    i = j + 1;
  }
  return results;
}

export interface CandidateBreak {
  start: ISODate;
  end: ISODate;
  leaveDates: ISODate[]; // working days we would book
  leaveDaysUsed: number;
  totalDaysOff: number;
  bridgedHolidays: string[];
  month: number;
  season: ReturnType<typeof seasonOf>;
  /** days off per leave day — the efficiency of this candidate. */
  efficiency: number;
}

/**
 * Enumerate candidate breaks deterministically.
 *
 * Strategy: scan for "anchors" (naturally-off runs), then for every window that
 * starts and ends on a naturally-off run, treat the bookable working days in
 * between as leave and measure the resulting contiguous break. We cap the
 * number of leave days per candidate (maxBridge) to keep the set tractable and
 * favour high-efficiency bridges. We also emit standalone breaks of the
 * preferred trip length so plans exist even without nearby holidays.
 */
export function generateCandidates(
  calendar: Map<ISODate, DayInfo>,
  input: EngineInput,
  maxBridge = 5,
): CandidateBreak[] {
  const all = allDatesOfYear(input.year);
  const info = (d: ISODate) => calendar.get(d)!;
  const candidates: CandidateBreak[] = [];
  const seen = new Set<string>();

  const emit = (leaveDates: ISODate[]) => {
    if (leaveDates.length === 0) return;
    // All leave dates must be bookable.
    if (!leaveDates.every((d) => info(d).bookable)) return;
    const leaveSet = new Set(leaveDates);
    // Expand to the full contiguous off-run this booking produces.
    let start = leaveDates[0];
    while (true) {
      const prev = addDays(start, -1);
      if (!calendar.has(prev)) break;
      if (info(prev).naturallyOff || leaveSet.has(prev)) start = prev;
      else break;
    }
    let end = leaveDates[leaveDates.length - 1];
    while (true) {
      const next = addDays(end, 1);
      if (!calendar.has(next)) break;
      if (info(next).naturallyOff || leaveSet.has(next)) end = next;
      else break;
    }
    const key = `${start}|${end}|${leaveDates.join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);

    const span = dateRange(start, end);
    const bridged = span
      .map((d) => info(d).holidayName)
      .filter((n): n is string => Boolean(n));
    const totalDaysOff = daysBetween(start, end);
    candidates.push({
      start,
      end,
      leaveDates,
      leaveDaysUsed: leaveDates.length,
      totalDaysOff,
      bridgedHolidays: Array.from(new Set(bridged)),
      month: monthOf(start),
      season: seasonOf(start),
      efficiency: totalDaysOff / leaveDates.length,
    });
  };

  // 1) Bridges: for each working day, greedily gather up to maxBridge
  //    consecutive bookable working days and emit the booking.
  for (let i = 0; i < all.length; i++) {
    if (!info(all[i]).bookable) continue;
    const leaveDates: ISODate[] = [];
    let k = i;
    while (k < all.length && info(all[k]).bookable && leaveDates.length < maxBridge) {
      leaveDates.push(all[k]);
      // Emit progressively: booking 1, 2, 3... days from this start.
      emit([...leaveDates]);
      k++;
    }
  }

  // 2) Standalone preferred-length breaks: book working days to hit the
  //    preferred trip length starting on each week's first working day.
  const target = Math.max(1, input.preferences.preferredTripLength);
  for (let i = 0; i < all.length; i++) {
    if (!info(all[i]).bookable) continue;
    // Only anchor when previous day is off (start of a working run).
    const prev = calendar.get(addDays(all[i], -1));
    if (prev && prev.bookable) continue;
    const leaveDates: ISODate[] = [];
    let k = i;
    let daysOff = 0;
    let cursor = all[i];
    while (daysBetween(all[i], cursor) < target && calendar.has(cursor)) {
      const ci = info(cursor);
      if (ci.naturallyOff) {
        daysOff++;
      } else if (ci.bookable && leaveDates.length < maxBridge + 3) {
        leaveDates.push(cursor);
        daysOff++;
      } else {
        break;
      }
      cursor = addDays(cursor, 1);
      k++;
      if (k - i > target + 4) break;
    }
    if (leaveDates.length > 0) emit(leaveDates);
  }

  return candidates;
}
