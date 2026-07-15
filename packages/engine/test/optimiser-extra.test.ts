import { describe, expect, it } from 'vitest';
import { addDays, dayOfWeek, demoInput, monthOf, optimise } from '../src/index.js';
import type { Plan } from '../src/index.js';

function avgTripTemp(plan: Plan): number {
  const temps = plan.breaks
    .map((b) => b.suggestion?.weather.avgTempC)
    .filter((t): t is number => t !== undefined);
  return temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : 0;
}

function quartersCovered(plan: Plan): number {
  return new Set(plan.breaks.map((b) => Math.floor((monthOf(b.start) - 1) / 3))).size;
}

describe('spread-evenly strategy', () => {
  it('produces a plan that distributes breaks across multiple quarters', () => {
    const result = optimise(demoInput());
    const spread = result.plans.find((p) => p.strategy === 'spread-evenly');
    expect(spread).toBeDefined();
    expect(quartersCovered(spread!)).toBeGreaterThanOrEqual(2);
  });
});

describe('conflicting priorities', () => {
  it('warm-weather weighting yields warmer trips than budget weighting', () => {
    const base = demoInput();
    const warm = optimise(
      demoInput({
        preferences: {
          ...base.preferences,
          minPreferredTempC: 26,
          weights: {
            ...base.preferences.weights,
            warmWeather: 5,
            budget: 0,
            minimiseLeave: 0,
          },
        },
      }),
    );
    const thrifty = optimise(
      demoInput({
        preferences: {
          ...base.preferences,
          weights: {
            ...base.preferences.weights,
            warmWeather: 0,
            budget: 5,
          },
        },
      }),
    );
    expect(avgTripTemp(warm.plans[0])).toBeGreaterThanOrEqual(avgTripTemp(thrifty.plans[0]));
  });

  it('is deterministic under identical conflicting weights', () => {
    const cfg = demoInput({
      preferences: {
        ...demoInput().preferences,
        weights: {
          maximiseConsecutive: 5,
          minimiseLeave: 5,
          warmWeather: 5,
          budget: 5,
          spreadEvenly: 5,
          preferenceMatch: 5,
          longWeekends: 5,
        },
      },
    });
    expect(JSON.stringify(optimise(cfg).plans)).toBe(JSON.stringify(optimise(cfg).plans));
  });
});

describe('mandatory leave dates', () => {
  it('every plan books the mandatory date', () => {
    // First bookable weekday of June (no holiday/blackout in the demo then).
    let d = '2026-06-01';
    while ([0, 6].includes(dayOfWeek(d))) d = addDays(d, 1);
    const result = optimise(
      demoInput({ leave: { ...demoInput().leave, mandatoryDates: [d] } }),
    );
    for (const plan of result.plans) {
      expect(plan.breaks.some((b) => b.leaveDatesUsed.includes(d))).toBe(true);
    }
  });
});

describe('school-holiday avoidance', () => {
  it('books no leave inside school-holiday ranges when enabled', () => {
    const input = demoInput({
      preferences: { ...demoInput().preferences, avoidSchoolHolidays: true },
    });
    const result = optimise(input);
    const inRange = (d: string) =>
      input.schoolHolidays.some((r) => d >= r.start && d <= r.end);
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        for (const d of brk.leaveDatesUsed) expect(inRange(d)).toBe(false);
      }
    }
  });
});

describe('half-day / no-leave robustness', () => {
  it('optimises without error when half-days are disallowed', () => {
    const result = optimise(
      demoInput({ leave: { ...demoInput().leave, allowHalfDays: false } }),
    );
    expect(result.plans.length).toBeGreaterThanOrEqual(3);
  });
});
