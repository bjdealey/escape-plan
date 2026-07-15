import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET,
  DEFAULT_PREFERENCES,
  DEFAULT_WEIGHTS,
  DEMO_DESTINATIONS,
  UK_HOLIDAYS_2026,
  demoInput,
  optimise,
} from '../src/index.js';
import type { EngineInput, LeaveConfig } from '../src/index.js';

function baseLeave(overrides: Partial<LeaveConfig> = {}): LeaveConfig {
  return {
    allowance: 28,
    remaining: 20,
    carryOver: 0,
    reserveDays: 0,
    purchasedDays: 0,
    soldDays: 0,
    shutdowns: [],
    mandatoryDates: [],
    allowHalfDays: false,
    ...overrides,
  };
}

function baseInput(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    year: 2026,
    leave: baseLeave(),
    holidays: UK_HOLIDAYS_2026,
    blackouts: [],
    schoolHolidays: [],
    weekendDays: [0, 6],
    preferences: { ...DEFAULT_PREFERENCES, weights: { ...DEFAULT_WEIGHTS } },
    budget: { ...DEFAULT_BUDGET },
    destinations: DEMO_DESTINATIONS,
    planCount: 6,
    ...overrides,
  };
}

describe('bank-holiday bridging', () => {
  it('produces a longer break for fewer leave days than a naive booking', () => {
    // New Year's Day 2026 is a Thursday, so booking a single Friday bridges
    // into the following weekend: 1 leave day -> 4 consecutive days off.
    const input = baseInput({
      holidays: [{ date: '2026-01-01', name: "New Year's Day", type: 'bank' }],
      leave: baseLeave({ remaining: 5 }),
    });
    const result = optimise(input);
    expect(result.plans.length).toBeGreaterThan(0);

    // Find any break that bridges the New Year holiday.
    const bridging = result.plans
      .flatMap((p) => p.breaks)
      .find((b) => b.bridgedHolidays.includes("New Year's Day"));

    expect(bridging).toBeDefined();
    // A naive isolated booking has efficiency ~1 (1 leave day = 1 day off).
    expect(bridging!.leaveDaysUsed).toBeLessThanOrEqual(2);
    expect(bridging!.totalDaysOff).toBeGreaterThanOrEqual(3);
    expect(bridging!.totalDaysOff / bridging!.leaveDaysUsed).toBeGreaterThan(1);

    // The best plan is strictly more efficient than booking the same number of
    // isolated leave days (which would yield daysOff === leaveDaysUsed).
    const best = result.plans[0];
    expect(best.efficiency).toBeGreaterThan(1);
    expect(best.totalDaysOff).toBeGreaterThan(best.totalLeaveUsed);
  });
});

describe('budget cap', () => {
  it('never returns a plan whose trip exceeds the per-trip budget', () => {
    const cap = 700;
    const input = baseInput({
      budget: { ...DEFAULT_BUDGET, maxTripBudget: cap },
    });
    const result = optimise(input);
    expect(result.plans.length).toBeGreaterThan(0);
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        expect(brk.estimatedCost).toBeLessThanOrEqual(cap);
      }
      // total equals the sum of its breaks
      const sum = plan.breaks.reduce((s, b) => s + b.estimatedCost, 0);
      expect(plan.totalEstimatedCost).toBe(sum);
    }
  });

  it('never lets total spend exceed the annual holiday fund', () => {
    const fund = 1500;
    const result = optimise(baseInput({ budget: { ...DEFAULT_BUDGET, holidayFund: fund } }));
    for (const plan of result.plans) {
      expect(plan.totalEstimatedCost).toBeLessThanOrEqual(fund);
    }
  });

  it('caps the number of breaks to a realistic count per plan', () => {
    const result = optimise(demoInput());
    for (const plan of result.plans) {
      expect(plan.tripCount).toBeLessThanOrEqual(8);
    }
  });

  it('falls back to zero-cost staycations when nothing fits a tiny budget', () => {
    const input = baseInput({ budget: { ...DEFAULT_BUDGET, maxTripBudget: 50 } });
    const result = optimise(input);
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        expect(brk.suggestion === undefined || brk.estimatedCost <= 50).toBe(true);
      }
    }
  });
});

describe('emergency reserve', () => {
  it('never spends the reserved leave days', () => {
    const reserve = 4;
    const remaining = 10;
    const input = baseInput({
      leave: baseLeave({ remaining, reserveDays: reserve }),
    });
    const result = optimise(input);
    expect(result.bookableLeave).toBe(remaining - reserve);
    expect(result.plans.length).toBeGreaterThan(0);
    for (const plan of result.plans) {
      expect(plan.totalLeaveUsed).toBeLessThanOrEqual(remaining - reserve);
    }
  });
});

describe('edge cases', () => {
  it('always returns at least one plan, even with no bookable leave', () => {
    const result = optimise(
      baseInput({ leave: baseLeave({ remaining: 3, reserveDays: 3 }) }),
    );
    expect(result.bookableLeave).toBe(0);
    expect(result.plans.length).toBeGreaterThanOrEqual(1);
    expect(result.plans[0].totalLeaveUsed).toBe(0);
  });
});

describe('determinism', () => {
  it('produces identical output across runs', () => {
    const a = optimise(demoInput());
    const b = optimise(demoInput());
    expect(JSON.stringify(a.plans)).toBe(JSON.stringify(b.plans));
  });
});

describe('demo scenario', () => {
  it('returns at least three ranked plans, each explained and scored', () => {
    const result = optimise(demoInput());
    expect(result.plans.length).toBeGreaterThanOrEqual(3);
    // Ranked descending by score.
    for (let i = 1; i < result.plans.length; i++) {
      expect(result.plans[i - 1].score).toBeGreaterThanOrEqual(result.plans[i].score);
    }
    for (const plan of result.plans) {
      expect(plan.explanation.length).toBeGreaterThan(20);
      expect(plan.scoreBreakdown.length).toBeGreaterThan(0);
      expect(plan.score).toBeGreaterThanOrEqual(0);
      expect(plan.score).toBeLessThanOrEqual(100);
    }
  });

  it('respects company blackout periods', () => {
    const result = optimise(demoInput());
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        // No booked leave date falls inside the seeded blackout window.
        for (const d of brk.leaveDatesUsed) {
          expect(d >= '2026-11-23' && d <= '2026-11-30').toBe(false);
        }
      }
    }
  });
});
