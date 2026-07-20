import { describe, expect, it } from 'vitest';
import { DEFAULT_LEAVE, availableLeaveDays, bookableLeaveDays, optimise, demoInput } from '../src/index.js';
import type { LeaveConfig } from '../src/index.js';

const base = (over: Partial<LeaveConfig> = {}): LeaveConfig => ({
  allowance: 28,
  remaining: 20,
  carryOver: 0,
  reserveDays: 0,
  purchasedDays: 0,
  soldDays: 0,
  shutdowns: [],
  mandatoryDates: [],
  allowHalfDays: false,
  ...over,
});

describe('leave arithmetic', () => {
  it('folds carry-over, purchased and sold into the available pool', () => {
    expect(availableLeaveDays(base({ remaining: 20, carryOver: 3, purchasedDays: 2, soldDays: 1 }))).toBe(24);
  });

  it('never returns a negative pool', () => {
    expect(availableLeaveDays(base({ remaining: 0, soldDays: 5 }))).toBe(0);
    expect(bookableLeaveDays(base({ remaining: 2, reserveDays: 10 }))).toBe(0);
  });

  it('bookable holds back the reserve from the whole pool', () => {
    // 20 remaining + 5 carry-over − 3 reserve = 22
    expect(bookableLeaveDays(base({ remaining: 20, carryOver: 5, reserveDays: 3 }))).toBe(22);
  });

  it('the default demo now counts its carry-over days', () => {
    // remaining 25 + carryOver 3 − reserve 3 = 25 (was 22 when carry-over was ignored)
    expect(bookableLeaveDays(DEFAULT_LEAVE)).toBe(25);
  });

  it('carry-over and purchased days change what optimise can book', () => {
    const baseline = optimise(demoInput({ leave: base({ remaining: 10, reserveDays: 0 }) }));
    const boosted = optimise(
      demoInput({ leave: base({ remaining: 10, carryOver: 5, purchasedDays: 3, reserveDays: 0 }) }),
    );
    expect(boosted.bookableLeave).toBe(baseline.bookableLeave + 8);
    // More bookable leave can only match or beat total days off, never reduce it.
    const bestOff = (r: ReturnType<typeof optimise>) => Math.max(...r.plans.map((p) => p.totalDaysOff));
    expect(bestOff(boosted)).toBeGreaterThanOrEqual(bestOff(baseline));
  });
});
