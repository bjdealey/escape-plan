import { describe, expect, it } from 'vitest';
import { dateRange, demoInput, optimise } from '../src/index.js';

describe('group-constrained optimisation', () => {
  it('is byte-identical to solo when no group constraints are supplied', () => {
    const solo = optimise(demoInput());
    const alsoSolo = optimise(demoInput({ colleagueLeave: [], maxSimultaneous: undefined }));
    expect(JSON.stringify(alsoSolo.plans)).toBe(JSON.stringify(solo.plans));
  });

  it('never exceeds "max colleagues off simultaneously"', () => {
    // Two colleagues are off for the whole of June; with max=2 the user can
    // never book a June working day (that would make three off).
    const input = demoInput({
      maxSimultaneous: 2,
      colleagueLeave: [
        { start: '2026-06-01', end: '2026-06-30' },
        { start: '2026-06-01', end: '2026-06-30' },
      ],
    });
    const result = optimise(input);
    expect(result.plans.length).toBeGreaterThanOrEqual(1);
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        for (const d of brk.leaveDatesUsed) {
          expect(d >= '2026-06-01' && d <= '2026-06-30').toBe(false);
        }
      }
    }
  });

  it('still allows booking when capacity is available', () => {
    // One colleague off in June, max=2 → the user may still book (2 off is OK).
    const input = demoInput({
      maxSimultaneous: 2,
      colleagueLeave: [{ start: '2026-06-01', end: '2026-06-30' }],
      leave: { ...demoInput().leave, mandatoryDates: ['2026-06-15'] },
    });
    const result = optimise(input);
    const booksJune = result.plans.some((p) =>
      p.breaks.some((b) => b.leaveDatesUsed.some((d) => d >= '2026-06-01' && d <= '2026-06-30')),
    );
    expect(booksJune).toBe(true);
  });

  it('never books into a team blackout', () => {
    const input = demoInput({
      blackouts: [{ start: '2026-10-05', end: '2026-10-16', label: 'Team blackout' }],
    });
    const blackout = new Set(dateRange('2026-10-05', '2026-10-16'));
    const result = optimise(input);
    for (const plan of result.plans) {
      for (const brk of plan.breaks) {
        for (const d of brk.leaveDatesUsed) expect(blackout.has(d)).toBe(false);
      }
    }
  });

  it('records colleague overlap days on breaks in group mode', () => {
    const input = demoInput({
      maxSimultaneous: 3,
      colleagueLeave: [{ start: '2026-01-01', end: '2026-12-31' }],
    });
    const result = optimise(input);
    const anyBreak = result.plans.flatMap((p) => p.breaks)[0];
    expect(anyBreak.colleagueOverlapDays).toBeDefined();
  });
});
