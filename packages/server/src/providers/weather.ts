import { z } from 'zod';
import type { WeatherProvider } from '../integrations.js';
import { fetchJson } from './http.js';

/**
 * Real climate data from Open-Meteo's ERA5 archive (https://open-meteo.com),
 * free and keyless. We average a representative reference year's daily values
 * for the requested month.
 * Contract: GET https://archive-api.open-meteo.com/v1/archive
 *   ?latitude=&longitude=&start_date=&end_date=
 *   &daily=temperature_2m_mean,precipitation_sum,sunshine_duration&timezone=GMT
 */
const ArchiveSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    temperature_2m_mean: z.array(z.number().nullable()),
    precipitation_sum: z.array(z.number().nullable()),
    sunshine_duration: z.array(z.number().nullable()),
  }),
});

// Representative coordinates for the seeded destinations. Kept here (not on the
// engine's Destination type) so the engine interface stays unchanged.
const COORDS: Record<string, { lat: number; lon: number }> = {
  cornwall: { lat: 50.26, lon: -5.05 },
  edinburgh: { lat: 55.95, lon: -3.19 },
  'lake-district': { lat: 54.46, lon: -3.09 },
  barcelona: { lat: 41.39, lon: 2.17 },
  algarve: { lat: 37.02, lon: -7.93 },
  amalfi: { lat: 40.63, lon: 14.6 },
  crete: { lat: 35.34, lon: 25.13 },
  reykjavik: { lat: 64.15, lon: -21.94 },
  chamonix: { lat: 45.92, lon: 6.87 },
};

const HOST = 'https://archive-api.open-meteo.com';
const REFERENCE_YEAR = 2023;

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const clean = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

export function createOpenMeteoWeather(): WeatherProvider {
  return {
    async forecast(destinationId, month) {
      const coord = COORDS[destinationId];
      if (!coord) return null;
      const mm = String(month).padStart(2, '0');
      const lastDay = new Date(Date.UTC(REFERENCE_YEAR, month, 0)).getUTCDate();
      const start = `${REFERENCE_YEAR}-${mm}-01`;
      const end = `${REFERENCE_YEAR}-${mm}-${String(lastDay).padStart(2, '0')}`;
      const url =
        `${HOST}/v1/archive?latitude=${coord.lat}&longitude=${coord.lon}` +
        `&start_date=${start}&end_date=${end}` +
        `&daily=temperature_2m_mean,precipitation_sum,sunshine_duration&timezone=GMT`;
      const data = await fetchJson(url, ArchiveSchema);
      return {
        avgTempC: Math.round(avg(clean(data.daily.temperature_2m_mean)) * 10) / 10,
        rainfallMm: Math.round(sum(clean(data.daily.precipitation_sum))),
        sunshineHours: Math.round(sum(clean(data.daily.sunshine_duration)) / 3600),
        hazard: false, // ERA5 archive does not classify monsoon/hurricane risk.
      };
    },
  };
}
