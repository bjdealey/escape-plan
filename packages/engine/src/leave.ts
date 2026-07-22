/**
 * Leave-balance arithmetic — the single place that turns a LeaveConfig into the
 * number of days the planner may actually spend.
 *
 * Previously the engine used `leave.remaining` alone, so carry-over, purchased,
 * and sold-back days collected in the UI had no effect on any plan. This folds
 * them into one honest total.
 */
import { dateRange, isWeekend } from './dateutil.js';
import type { EngineInput, LeaveConfig } from './types.js';

/**
 * Total leave days available to book this year: what's left of the statutory
 * allowance (`remaining`) plus days carried over and purchased, minus days sold
 * back. Never negative. Excludes the emergency reserve — see {@link bookableLeaveDays}.
 */
export function availableLeaveDays(leave: LeaveConfig): number {
  return Math.max(
    0,
    leave.remaining + leave.carryOver + leave.purchasedDays - leave.soldDays,
  );
}

/**
 * Working days swallowed by company shutdowns that are deducted from the
 * allowance: the employee has no choice but to take them as leave. Shutdowns
 * with `policy: 'paid'` are excluded — a paid closure is free. Only days that
 * would otherwise be worked count — a shutdown that overlaps a weekend or bank
 * holiday costs nothing extra.
 */
export function shutdownLeaveDays(
  input: Pick<EngineInput, 'leave' | 'holidays' | 'weekendDays' | 'year'>,
): number {
  const holidayDates = new Set(input.holidays.map((h) => h.date));
  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year}-12-31`;
  const counted = new Set<string>();
  for (const s of input.leave.shutdowns) {
    if (s.policy === 'paid') continue; // paid closure — doesn't touch the allowance
    for (const d of dateRange(s.start, s.end)) {
      if (d < yearStart || d > yearEnd) continue;
      if (counted.has(d)) continue; // overlapping shutdown ranges → count once
      if (isWeekend(d, input.weekendDays)) continue;
      if (holidayDates.has(d)) continue;
      counted.add(d);
    }
  }
  return counted.size;
}

/**
 * Days actually free to book after holding back the emergency reserve and the
 * days auto-consumed by company shutdowns. Pass `shutdownDays` (from
 * {@link shutdownLeaveDays}) so the planner never allocates leave the shutdown
 * has already spoken for; it defaults to 0 for callers without calendar context.
 */
export function bookableLeaveDays(leave: LeaveConfig, shutdownDays = 0): number {
  return Math.max(0, availableLeaveDays(leave) - leave.reserveDays - shutdownDays);
}
