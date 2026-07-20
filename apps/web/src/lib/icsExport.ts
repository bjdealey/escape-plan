/**
 * Client-side iCalendar (.ics) export for a plan's breaks.
 *
 * The whole app optimises a plan and then, until now, dead-ended: the calendar
 * was display-only and there was no way to act on the result. This turns a
 * finished plan into a standard `.ics` file the user can import into any
 * calendar — entirely on-device, nothing leaves the browser.
 *
 * All-day events per RFC 5545: DTSTART uses VALUE=DATE and DTEND is the day
 * *after* the last day off (the end is exclusive for date-value events).
 */
import { PURPOSE_LABELS, type Break, type Plan } from '@escape-plan/engine';

/** Escape TEXT values per RFC 5545 §3.3.11 (backslash, semicolon, comma, newline). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** `YYYY-MM-DD` → `YYYYMMDD`. */
function toDateValue(iso: string): string {
  return iso.replace(/-/g, '');
}

/** DTEND for an all-day event is exclusive: the day after `iso`. */
function exclusiveEnd(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return toDateValue(d.toISOString().slice(0, 10));
}

/** Current instant as a UTC timestamp value, e.g. `20260720T101500Z`. */
function stamp(now: Date): string {
  return `${now.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** Human summary for a break, mirroring the label logic used in the plan cards. */
function summaryFor(b: Break): string {
  if (b.anchorLabel) return `${b.anchorLabel} (${PURPOSE_LABELS[b.purpose ?? 'event']})`;
  if (b.suggestion) {
    return `${b.suggestion.destinationName} (${b.suggestion.tripType.replace('-', ' ')})`;
  }
  return 'Time off (staycation)';
}

function descriptionFor(b: Break): string {
  const parts = [`${b.totalDaysOff} days off · ${b.leaveDaysUsed} leave day(s) used`];
  if (b.bridgedHolidays.length > 0) parts.push(`Bridges: ${b.bridgedHolidays.join(', ')}`);
  if (b.suggestion) parts.push(`Est. cost: ${Math.round(b.suggestion.estimatedCost)}`);
  return parts.join('\n');
}

/** Fold a content line to <=75 octets per RFC 5545 §3.1 (approximated by chars). */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    chunks.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest.length) chunks.push(` ${rest}`);
  return chunks.join('\r\n');
}

/** Build an iCalendar document (as a string) for every break in `plan`. */
export function planToIcs(plan: Plan, now: Date = new Date()): string {
  const dtstamp = stamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Escape Plan//Annual Leave Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const b of plan.breaks) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${plan.id}-${toDateValue(b.start)}@escape-plan`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${toDateValue(b.start)}`,
      `DTEND;VALUE=DATE:${exclusiveEnd(b.end)}`,
      `SUMMARY:${escapeText(summaryFor(b))}`,
      `DESCRIPTION:${escapeText(descriptionFor(b))}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n');
}

/** A safe, descriptive filename for a plan's export. */
export function icsFilename(plan: Plan): string {
  const slug = plan.strategyLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `escape-plan-${slug || plan.id}.ics`;
}

/**
 * Trigger a browser download of the plan as an `.ics` file. Returns `false` if
 * the environment can't perform a download (e.g. non-DOM), so callers can react.
 */
export function downloadPlanIcs(plan: Plan): boolean {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return false;
  const blob = new Blob([planToIcs(plan)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = icsFilename(plan);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}
