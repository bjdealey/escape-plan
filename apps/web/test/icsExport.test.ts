import { describe, expect, it } from 'vitest';
import { demoInput, optimise } from '@escape-plan/engine';
import { icsFilename, planToIcs } from '@/lib/icsExport';

const plan = optimise(demoInput()).plans[0];
const NOW = new Date('2026-07-20T10:15:00Z');

describe('icsExport', () => {
  it('produces a valid VCALENDAR with one VEVENT per break', () => {
    const ics = planToIcs(plan, NOW);
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');

    const events = ics.match(/BEGIN:VEVENT/g) ?? [];
    expect(events.length).toBe(plan.breaks.length);
    expect(plan.breaks.length).toBeGreaterThan(0);
  });

  it('emits all-day dates with an exclusive DTEND (last day + 1)', () => {
    const ics = planToIcs(plan, NOW);
    const first = plan.breaks[0];
    expect(ics).toContain(`DTSTART;VALUE=DATE:${first.start.replace(/-/g, '')}`);

    // end + 1 day, still same-format basic date
    const end = new Date(`${first.end}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    const exclusive = end.toISOString().slice(0, 10).replace(/-/g, '');
    expect(ics).toContain(`DTEND;VALUE=DATE:${exclusive}`);
  });

  it('uses CRLF line endings and a stable timestamp', () => {
    const ics = planToIcs(plan, NOW);
    expect(ics).toContain('\r\n');
    expect(ics).toContain('DTSTAMP:20260720T101500Z');
  });

  it('escapes TEXT special characters in summaries/descriptions', () => {
    // Craft a break whose label needs escaping.
    const crafted = {
      ...plan,
      breaks: [
        {
          ...plan.breaks[0],
          anchorLabel: 'Dad; Mum, & co\\home',
          purpose: 'event' as const,
          suggestion: undefined,
        },
      ],
    };
    const ics = planToIcs(crafted, NOW);
    expect(ics).toContain('Dad\\; Mum\\, & co\\\\home');
  });

  it('builds a filesystem-safe filename from the strategy label', () => {
    expect(icsFilename(plan)).toMatch(/^escape-plan-[a-z0-9-]+\.ics$/);
  });
});
