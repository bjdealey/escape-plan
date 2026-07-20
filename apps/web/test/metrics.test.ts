import { describe, expect, it } from 'vitest';
import { demoInput, optimise } from '@escape-plan/engine';
import { countdown, daysOffByMonth, monthlyBudget, todayISO } from '@/lib/metrics';

const input = demoInput();
const plan = optimise(input).plans[0];

describe('monthlyBudget', () => {
  it('produces 12 points with cumulative, non-decreasing spend', () => {
    const pts = monthlyBudget(input, plan);
    expect(pts).toHaveLength(12);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i].spent).toBeGreaterThanOrEqual(pts[i - 1].spent);
    }
    // Final cumulative spend equals the plan's total estimated cost.
    expect(pts[11].spent).toBe(Math.round(plan.totalEstimatedCost));
  });
});

describe('daysOffByMonth', () => {
  it('sums to the plan totals', () => {
    const rows = daysOffByMonth(plan);
    expect(rows).toHaveLength(12);
    expect(rows.reduce((s, r) => s + r.daysOff, 0)).toBe(plan.totalDaysOff);
    expect(rows.reduce((s, r) => s + r.leave, 0)).toBe(plan.totalLeaveUsed);
  });
});

describe('countdown', () => {
  it('finds the next break after a date, or null', () => {
    const cd = countdown(plan, '2026-01-01');
    if (plan.breaks.some((b) => b.start > '2026-01-01')) {
      expect(cd.days).not.toBeNull();
      expect(cd.days!).toBeGreaterThanOrEqual(0);
      expect(cd.next).toBeDefined();
    }
    // No breaks after year end.
    expect(countdown(plan, '2027-01-01').days).toBeNull();
  });

  it('defaults to the real current date rather than a fixed constant', () => {
    // Countdown with no explicit date must match passing today's local date,
    // proving it is not anchored to a hardcoded day.
    expect(countdown(plan).days).toBe(countdown(plan, todayISO()).days);
  });
});

describe('todayISO', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(todayISO(new Date(2026, 6, 21))).toBe('2026-07-21'); // month is 0-indexed
    expect(todayISO(new Date(2026, 0, 5))).toBe('2026-01-05'); // zero-padded
  });
});
