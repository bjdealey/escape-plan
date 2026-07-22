import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEAVE,
  availableLeaveDays,
  bookableLeaveDays,
  shutdownLeaveDays,
  optimise,
  demoInput,
} from '../src/index.js';
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

  it('counts only shutdown working days, not weekends or bank holidays inside it', () => {
    const input = demoInput();
    // Default demo shutdown is 24–31 Dec 2026; of those, 24/29/30/31 are
    // working days (25 = Christmas, 28 = substitute holiday, 26/27 = weekend).
    expect(shutdownLeaveDays(input)).toBe(4);
  });

  it('auto-deducts shutdown days from the bookable pool', () => {
    const input = demoInput();
    const result = optimise(input);
    // 28 available − 3 reserve − 4 shutdown = 21, and it is surfaced on the result.
    expect(result.shutdownLeave).toBe(4);
    expect(result.bookableLeave).toBe(21);
    // No plan may freely book more leave than the shutdown-adjusted pool allows.
    for (const p of result.plans) {
      expect(p.totalLeaveUsed).toBeLessThanOrEqual(result.bookableLeave);
    }
  });

  it('a paid closure does not consume any leave', () => {
    const input = demoInput({
      leave: {
        ...DEFAULT_LEAVE,
        shutdowns: [{ start: '2026-12-24', end: '2026-12-31', label: 'Paid closure', policy: 'paid' }],
      },
    });
    expect(shutdownLeaveDays(input)).toBe(0);
    // Balance ignores the paid closure: 28 available − 3 reserve − 0 shutdown = 25.
    expect(optimise(input).bookableLeave).toBe(25);
  });

  it('mixes deducted and paid shutdowns, charging only the deducted one', () => {
    const input = demoInput({
      leave: {
        ...DEFAULT_LEAVE,
        shutdowns: [
          { start: '2026-12-24', end: '2026-12-31', label: 'Christmas', policy: 'deducted' },
          { start: '2026-08-24', end: '2026-08-28', label: 'Summer paid', policy: 'paid' },
        ],
      },
    });
    // Only the Christmas working days (24/29/30/31) count; the summer week is free.
    expect(shutdownLeaveDays(input)).toBe(4);
  });

  it('a longer shutdown leaves fewer days to book', () => {
    const short = optimise(demoInput());
    const long = optimise(
      demoInput({
        leave: { ...DEFAULT_LEAVE, shutdowns: [{ start: '2026-12-21', end: '2026-12-31', label: 'Shutdown' }] },
      }),
    );
    expect(long.bookableLeave).toBeLessThan(short.bookableLeave);
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
