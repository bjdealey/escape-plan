import { describe, expect, it } from 'vitest';
import {
  addDays,
  clamp,
  dateRange,
  dayOfWeek,
  daysBetween,
  isWeekend,
  monthOf,
  seasonOf,
} from '../src/index.js';

describe('dateutil', () => {
  it('addDays crosses month and year boundaries in UTC', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('daysBetween is inclusive', () => {
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(1);
    expect(daysBetween('2026-01-01', '2026-01-07')).toBe(7);
  });

  it('dayOfWeek and isWeekend agree (2026-01-01 is a Thursday)', () => {
    expect(dayOfWeek('2026-01-01')).toBe(4);
    expect(isWeekend('2026-01-03')).toBe(true); // Saturday
    expect(isWeekend('2026-01-01')).toBe(false);
    // custom weekend (Fri/Sat)
    expect(isWeekend('2026-01-02', [5, 6])).toBe(true);
  });

  it('seasonOf maps months to northern-hemisphere seasons', () => {
    expect(seasonOf('2026-01-15')).toBe('winter');
    expect(seasonOf('2026-04-15')).toBe('spring');
    expect(seasonOf('2026-07-15')).toBe('summer');
    expect(seasonOf('2026-10-15')).toBe('autumn');
  });

  it('dateRange and monthOf', () => {
    expect(dateRange('2026-01-01', '2026-01-03')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(monthOf('2026-08-15')).toBe(8);
  });

  it('clamp bounds values to [0,1] by default', () => {
    expect(clamp(-2)).toBe(0);
    expect(clamp(0.5)).toBe(0.5);
    expect(clamp(9)).toBe(1);
    expect(clamp(5, 0, 3)).toBe(3);
  });
});
