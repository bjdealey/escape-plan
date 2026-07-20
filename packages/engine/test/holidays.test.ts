import { describe, expect, it } from 'vitest';
import {
  HOLIDAYS_2026,
  UK_HOLIDAYS_2026,
  holidayDatesForCountry,
  holidaysForCountry,
} from '../src/index.js';

describe('per-country holidays', () => {
  it('keeps GB as the single source shared with the fixture', () => {
    expect(holidaysForCountry('GB')).toBe(UK_HOLIDAYS_2026);
    expect(UK_HOLIDAYS_2026).toBe(HOLIDAYS_2026.GB);
  });

  it('returns distinct national holidays per country', () => {
    const gb = holidayDatesForCountry('GB');
    const us = holidayDatesForCountry('US');
    const de = holidayDatesForCountry('DE');
    // US Thanksgiving and Independence Day are not UK holidays.
    expect(us).toContain('2026-11-26');
    expect(gb).not.toContain('2026-11-26');
    // Germany has no early-May bank holiday but does have Unity Day.
    expect(de).toContain('2026-10-03');
    expect(de).not.toContain('2026-05-04');
  });

  it('is case-insensitive and falls back to GB for unknown countries', () => {
    expect(holidaysForCountry('de')).toBe(HOLIDAYS_2026.DE);
    expect(holidaysForCountry('ZZ')).toBe(HOLIDAYS_2026.GB);
  });

  it('never presents another year’s dates as fact', () => {
    expect(holidaysForCountry('GB', 2027)).toEqual([]);
    expect(holidayDatesForCountry('US', 2025)).toEqual([]);
  });

  it('has valid, in-year, sorted ISO dates for every country', () => {
    for (const [code, list] of Object.entries(HOLIDAYS_2026)) {
      expect(list.length, code).toBeGreaterThan(0);
      const dates = list.map((h) => h.date);
      expect(dates.every((d) => /^2026-\d{2}-\d{2}$/.test(d)), code).toBe(true);
      expect([...dates].sort(), `${code} sorted`).toEqual(dates);
      expect(new Set(dates).size, `${code} unique`).toBe(dates.length);
    }
  });
});
