import { describe, expect, it } from 'vitest';
import { DEMO_COLLEAGUES, demoInput, optimise } from '@escape-plan/engine';
import { CALENDAR_LEGEND, buildCalendarEvents } from '@/lib/calendarEvents';

const input = demoInput();
const plan = optimise(input).plans[0];
const events = buildCalendarEvents(input, plan, DEMO_COLLEAGUES);

function layers(): string[] {
  return [...new Set(events.map((e) => (e.extendedProps as { layer: string }).layer))];
}

describe('buildCalendarEvents', () => {
  it('emits every calendar layer', () => {
    const found = layers();
    for (const layer of ['holiday', 'shutdown', 'blackout', 'school', 'colleague', 'personal', 'leave']) {
      expect(found).toContain(layer);
    }
  });

  it('renders one event per bank holiday', () => {
    const holidayEvents = events.filter((e) => (e.extendedProps as { layer: string }).layer === 'holiday');
    expect(holidayEvents.length).toBe(input.holidays.length);
  });

  it('shows destination, weather, and budget in leave-event titles', () => {
    const leave = events.filter((e) => (e.extendedProps as { layer: string }).layer === 'leave');
    expect(leave.length).toBe(plan.breaks.length);
    const withTrip = plan.breaks.find((b) => b.suggestion);
    if (withTrip) {
      const ev = leave.find((e) => e.start === withTrip.start)!;
      expect(String(ev.title)).toContain(withTrip.suggestion!.destinationName);
      expect(String(ev.title)).toMatch(/°C/);
    }
  });

  it('range layers use background display and end-exclusive dates', () => {
    const blackout = events.find((e) => (e.extendedProps as { layer: string }).layer === 'blackout')!;
    expect(blackout.display).toBe('background');
    // blackout seeded 2026-11-23..2026-11-30 -> end exclusive 2026-12-01
    expect(blackout.end).toBe('2026-12-01');
  });

  it('exposes a legend covering block and range kinds', () => {
    expect(CALENDAR_LEGEND.some((l) => l.kind === 'block')).toBe(true);
    expect(CALENDAR_LEGEND.some((l) => l.kind === 'range')).toBe(true);
  });
});
