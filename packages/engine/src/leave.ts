/**
 * Leave-balance arithmetic — the single place that turns a LeaveConfig into the
 * number of days the planner may actually spend.
 *
 * Previously the engine used `leave.remaining` alone, so carry-over, purchased,
 * and sold-back days collected in the UI had no effect on any plan. This folds
 * them into one honest total.
 */
import type { LeaveConfig } from './types.js';

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

/** Days actually bookable after holding back the emergency reserve. */
export function bookableLeaveDays(leave: LeaveConfig): number {
  return Math.max(0, availableLeaveDays(leave) - leave.reserveDays);
}
