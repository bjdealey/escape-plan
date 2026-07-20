import { describe, expect, it } from 'vitest';
import {
  type PersonalDate,
  demoInput,
  homeProfileForCountry,
  optimise,
  purposeForKind,
} from '../src/index.js';

function withAnchor(anchor: PersonalDate, overrides = {}) {
  const base = demoInput();
  return demoInput({
    preferences: { ...base.preferences, personalDates: [anchor] },
    ...overrides,
  });
}

describe('purpose mapping', () => {
  it('maps occasion kinds to non-travel purposes', () => {
    expect(purposeForKind('wedding')).toBe('event');
    expect(purposeForKind('family')).toBe('family');
    expect(purposeForKind('moving')).toBe('admin');
    expect(purposeForKind('rest')).toBe('rest');
  });
});

describe('event-anchored breaks', () => {
  const anchor: PersonalDate = {
    date: '2026-09-16',
    label: 'Our wedding',
    kind: 'wedding',
    bookAround: true,
    daysAround: 3,
  };

  it('books time off around the date in every plan, as a non-travel break', () => {
    const result = optimise(withAnchor(anchor));
    expect(result.plans.length).toBeGreaterThan(0);
    for (const plan of result.plans) {
      const brk = plan.breaks.find((b) => b.anchorLabel === 'Our wedding');
      expect(brk).toBeDefined();
      expect(brk!.start <= anchor.date && anchor.date <= brk!.end).toBe(true);
      expect(brk!.purpose).toBe('event');
      expect(brk!.suggestion).toBeUndefined(); // not a trip
      expect(brk!.leaveDaysUsed).toBeGreaterThan(0);
    }
  });

  it('carries local weather when a home is known', () => {
    const result = optimise(withAnchor(anchor, { home: homeProfileForCountry('GB') }));
    const brk = result.plans[0].breaks.find((b) => b.anchorLabel === 'Our wedding')!;
    expect(brk.homeWeather).toBeDefined();
  });

  it('explains the anchored time off in plain language', () => {
    const result = optimise(withAnchor(anchor));
    expect(result.plans[0].explanation).toMatch(/around Our wedding/i);
  });

  it('respects the emergency reserve (skipped rather than overspent)', () => {
    const result = optimise(
      withAnchor(anchor, {
        leave: { ...demoInput().leave, remaining: 3, reserveDays: 3, carryOver: 0 },
      }),
    );
    expect(result.bookableLeave).toBe(0);
    for (const plan of result.plans) {
      expect(plan.totalLeaveUsed).toBe(0);
      expect(plan.breaks.some((b) => b.anchorLabel)).toBe(false);
    }
  });

  it('is inert when no personal date opts in', () => {
    const noAnchors = demoInput({
      preferences: { ...demoInput().preferences, personalDates: [] },
    });
    const result = optimise(noAnchors);
    expect(result.plans.flatMap((p) => p.breaks).some((br) => br.anchorLabel)).toBe(false);
  });
});
