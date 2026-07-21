import { describe, expect, it } from 'vitest';
import { demoInput, optimise } from '../src/index.js';

/**
 * The engine plans a whole calendar year. When that year is already in progress,
 * plans must only ever propose leave from `today` onward — never on dates that
 * have already passed. `today` is supplied as data so the engine stays pure.
 */
describe('current-date awareness', () => {
  const today = '2026-07-01';

  it('never books leave on, or starts a break before, today', () => {
    const result = optimise(demoInput({ today }));
    expect(result.plans.length).toBeGreaterThan(0);
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        expect(brk.start >= today).toBe(true);
        for (const d of brk.leaveDatesUsed) expect(d >= today).toBe(true);
      }
    }
  });

  it('actually changes behaviour — the unbounded run does propose earlier dates', () => {
    // Guards against a vacuous pass: without `today`, at least one plan books
    // leave before the cut-off, so the filter above is doing real work.
    const unbounded = optimise(demoInput());
    const hasPast = unbounded.plans
      .flatMap((p) => p.breaks)
      .some((b) => b.start < today);
    expect(hasPast).toBe(true);
  });

  it('honours a mid-year cut-off exactly (nothing on the day before, today is allowed)', () => {
    const cut = '2026-07-21';
    const result = optimise(demoInput({ today: cut }));
    const allLeave = result.plans.flatMap((p) => p.breaks).flatMap((b) => b.leaveDatesUsed);
    expect(allLeave.every((d) => d >= cut)).toBe(true);
    expect(allLeave.some((d) => d < cut)).toBe(false);
  });

  it('is deterministic with `today` set', () => {
    const a = optimise(demoInput({ today }));
    const b = optimise(demoInput({ today }));
    expect(JSON.stringify(a.plans)).toBe(JSON.stringify(b.plans));
  });

  it('yields a safe empty-leave plan when the whole year is already past', () => {
    const result = optimise(demoInput({ today: '2027-01-01' }));
    expect(result.plans.length).toBeGreaterThan(0);
    for (const plan of result.plans) {
      expect(plan.totalLeaveUsed).toBe(0);
      expect(plan.breaks.every((b) => b.leaveDaysUsed === 0)).toBe(true);
    }
  });

  it('leaves whole-year behaviour unchanged when `today` is absent', () => {
    const withField = optimise(demoInput({ today: '2026-01-01' })); // Jan 1 → nothing is past
    const without = optimise(demoInput());
    expect(JSON.stringify(withField.plans)).toBe(JSON.stringify(without.plans));
  });
});
