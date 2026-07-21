import type { EventInput } from '@fullcalendar/core';
import {
  type ColleagueLeave,
  type EngineInput,
  type Plan,
  addDays,
} from '@escape-plan/engine';
import { formatCurrency } from '@/lib/utils';

export type CalendarLayer =
  | 'leave'
  | 'holiday'
  | 'personal'
  | 'colleague'
  | 'blackout'
  | 'shutdown'
  | 'school';

export interface LegendItem {
  label: string;
  color: string;
  kind: 'block' | 'range';
  layer: CalendarLayer;
}

export const CALENDAR_LEGEND: LegendItem[] = [
  { label: 'Suggested / booked leave', color: 'hsl(var(--primary))', kind: 'block', layer: 'leave' },
  { label: 'Bank holiday', color: 'hsl(var(--accent))', kind: 'block', layer: 'holiday' },
  { label: 'Personal date', color: 'hsl(var(--warning))', kind: 'block', layer: 'personal' },
  { label: 'Colleague leave', color: 'hsl(var(--muted-foreground))', kind: 'block', layer: 'colleague' },
  { label: 'Company blackout', color: 'hsl(var(--destructive) / 0.85)', kind: 'range', layer: 'blackout' },
  { label: 'Shutdown', color: 'hsl(var(--muted-foreground) / 0.6)', kind: 'range', layer: 'shutdown' },
  { label: 'School holidays', color: 'hsl(var(--warning) / 0.8)', kind: 'range', layer: 'school' },
];

/**
 * Build the full layered event set for the yearly calendar from the engine
 * input, the currently selected plan, and colleague availability.
 */
export function buildCalendarEvents(
  input: EngineInput,
  plan: Plan | undefined,
  colleagues: ColleagueLeave[],
): EventInput[] {
  const events: EventInput[] = [];

  // Layer: bank / company holidays.
  for (const h of input.holidays) {
    events.push({
      title: h.name,
      start: h.date,
      allDay: true,
      backgroundColor: 'hsl(var(--accent))',
      borderColor: 'transparent',
      textColor: 'hsl(var(--accent-foreground))',
      classNames: ['ep-block', 'ep-block--holiday'],
      extendedProps: { layer: 'holiday' },
    });
  }

  // Layer: company shutdown (range background). A CSS pattern makes range
  // layers distinguishable without relying on colour alone.
  for (const s of input.leave.shutdowns) {
    events.push({
      title: s.label ?? 'Shutdown',
      start: s.start,
      end: addDays(s.end, 1),
      allDay: true,
      display: 'background',
      backgroundColor: 'hsl(var(--muted-foreground) / 0.28)',
      classNames: ['ep-range', 'ep-range--shutdown'],
      extendedProps: { layer: 'shutdown' },
    });
  }

  // Layer: blackout (range background).
  for (const b of input.blackouts) {
    events.push({
      title: b.label ?? 'Blackout',
      start: b.start,
      end: addDays(b.end, 1),
      allDay: true,
      display: 'background',
      backgroundColor: 'hsl(var(--destructive) / 0.28)',
      classNames: ['ep-range', 'ep-range--blackout'],
      extendedProps: { layer: 'blackout' },
    });
  }

  // Layer: school holidays (range background).
  for (const s of input.schoolHolidays) {
    events.push({
      title: s.label ?? 'School holidays',
      start: s.start,
      end: addDays(s.end, 1),
      allDay: true,
      display: 'background',
      backgroundColor: 'hsl(var(--warning) / 0.22)',
      classNames: ['ep-range', 'ep-range--school'],
      extendedProps: { layer: 'school' },
    });
  }

  // Layer: colleague leave.
  for (const c of colleagues) {
    events.push({
      title: `${c.colleague} off`,
      start: c.start,
      end: addDays(c.end, 1),
      allDay: true,
      backgroundColor: 'hsl(var(--muted-foreground))',
      borderColor: 'transparent',
      textColor: 'hsl(var(--background))',
      classNames: ['ep-block', 'ep-block--colleague'],
      extendedProps: { layer: 'colleague', status: c.status },
    });
  }

  // Layer: personal dates.
  for (const p of input.preferences.personalDates) {
    events.push({
      title: `★ ${p.label}`,
      start: p.date,
      allDay: true,
      backgroundColor: 'hsl(var(--warning))',
      borderColor: 'transparent',
      textColor: 'hsl(var(--warning-foreground))',
      classNames: ['ep-block', 'ep-block--personal'],
      extendedProps: { layer: 'personal' },
    });
  }

  // Layer: the selected plan's breaks (suggested leave + weather + budget).
  if (plan) {
    for (const brk of plan.breaks) {
      const weather = brk.suggestion
        ? ` · ${Math.round(brk.suggestion.weather.avgTempC)}°C`
        : brk.homeWeather
          ? ` · ${Math.round(brk.homeWeather.avgTempC)}°C home`
          : '';
      const cost = brk.estimatedCost
        ? ` · ${formatCurrency(brk.estimatedCost, input.budget.currency)}`
        : ' · staycation';
      const dest = brk.suggestion ? ` → ${brk.suggestion.destinationName}` : '';
      const title = brk.anchorLabel
        ? `${brk.totalDaysOff} days off · ${brk.anchorLabel}`
        : `${brk.totalDaysOff} days off${dest}${weather}${cost}`;
      events.push({
        title,
        start: brk.start,
        end: addDays(brk.end, 1),
        allDay: true,
        backgroundColor: 'hsl(var(--primary))',
        borderColor: 'transparent',
        textColor: 'hsl(var(--primary-foreground))',
        classNames: ['ep-block', 'ep-block--leave'],
        extendedProps: { layer: 'leave' },
      });
    }
  }

  return events;
}
