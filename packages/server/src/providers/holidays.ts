import { z } from 'zod';
import type { HolidayProvider } from '../integrations.js';
import { fetchJson } from './http.js';

/**
 * Real public-holiday data from Nager.Date (https://date.nager.at), a free,
 * keyless open API.
 * Contract: GET https://date.nager.at/api/v3/PublicHolidays/{year}/{cc}
 *   -> [ { "date": "2026-01-01", "name": "New Year's Day", ... }, ... ]
 */
const NagerSchema = z.array(
  z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    name: z.string(),
    localName: z.string().optional(),
  }),
);

const HOST = 'https://date.nager.at';

export function createNagerHolidays(): HolidayProvider {
  return {
    async holidays(year, countryCode) {
      const url = `${HOST}/api/v3/PublicHolidays/${year}/${encodeURIComponent(countryCode)}`;
      const data = await fetchJson(url, NagerSchema);
      // Sanitise: strip anything but plain date + name; de-duplicate by date.
      const seen = new Set<string>();
      const out: { date: string; name: string }[] = [];
      for (const h of data) {
        if (seen.has(h.date)) continue;
        seen.add(h.date);
        out.push({ date: h.date, name: String(h.name).slice(0, 120) });
      }
      return out;
    },
  };
}
