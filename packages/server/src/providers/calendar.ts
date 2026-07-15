import { z } from 'zod';
import type { CalendarEvent, CalendarProvider } from '../integrations.js';
import { fetchJson } from './http.js';

/**
 * Real Google Calendar adapter (documented API; requires an OAuth access token).
 * The full OAuth dance is out of scope for this seam — supply a token via
 * GOOGLE_ACCESS_TOKEN. Implemented against the published contract; NOT verified
 * live (no account) — see ITERATION-NOTES.md.
 *
 * Free/busy: POST https://www.googleapis.com/calendar/v3/freeBusy
 * Insert:    POST https://www.googleapis.com/calendar/v3/calendars/primary/events
 */
const FreeBusySchema = z.object({
  calendars: z.record(
    z.string(),
    z.object({ busy: z.array(z.object({ start: z.string(), end: z.string() })) }),
  ),
});
const InsertedSchema = z.object({ id: z.string(), status: z.string() });

const BASE = 'https://www.googleapis.com/calendar/v3';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function createGoogleCalendar(accessToken: string): CalendarProvider {
  const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
  return {
    async busyRanges() {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 365 * 86_400_000).toISOString();
      const data = await fetchJson(`${BASE}/freeBusy`, FreeBusySchema, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
      });
      const busy = data.calendars.primary?.busy ?? [];
      return busy.map((b) => ({
        start: b.start.slice(0, 10),
        end: b.end.slice(0, 10),
        label: 'Busy (calendar)',
      }));
    },
    async createEvent(_userId: number, event: CalendarEvent) {
      // Validate/sanitise the event before writing anything back.
      if (!event || typeof event.title !== 'string' || !event.title.trim()) {
        throw new Error('Event title is required');
      }
      if (!ISO_DATE.test(event.start) || !ISO_DATE.test(event.end)) {
        throw new Error('Event start/end must be YYYY-MM-DD dates');
      }
      const body = {
        summary: event.title.slice(0, 200),
        start: { date: event.start },
        end: { date: event.end },
      };
      const data = await fetchJson(`${BASE}/calendars/primary/events`, InsertedSchema, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify(body),
      });
      return { id: data.id, status: data.status };
    },
  };
}
