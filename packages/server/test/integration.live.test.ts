/**
 * LIVE integration smoke tests — real network, real providers.
 *
 * SKIPPED BY DEFAULT so the offline suite and CI stay green with no keys and no
 * egress. Opt in with RUN_LIVE_INTEGRATION=1; each provider additionally runs
 * only when its own flag/credentials are present, so a partial set still
 * verifies what it can:
 *
 *   RUN_LIVE_INTEGRATION=1 \
 *   CURRENCY_PROVIDER=frankfurter HOLIDAY_PROVIDER=nager \
 *   WEATHER_PROVIDER=open-meteo LOCATION_PROVIDER=ipwho \
 *   AMADEUS_CLIENT_ID=... AMADEUS_CLIENT_SECRET=... \
 *   RESEND_API_KEY=... NOTIFY_EMAIL_FROM='You <you@dom>' LIVE_EMAIL_TO=you@dom \
 *     npm run test:integration:live --workspace @escape-plan/server
 *
 * These convert every adapter from "implemented against the documented contract"
 * to "verified against the live service" wherever it can actually reach it.
 */
import { describe, expect, it } from 'vitest';
import { createFrankfurterCurrency } from '../src/providers/currency.js';
import { createNagerHolidays } from '../src/providers/holidays.js';
import { createOpenMeteoWeather } from '../src/providers/weather.js';
import { createIpwhoLocation } from '../src/providers/location.js';
import { createAmadeusFlights } from '../src/providers/flights.js';
import { ResendEmailChannel } from '../src/notifications/channels.js';

const LIVE = process.env.RUN_LIVE_INTEGRATION === '1';
const on = (cond: unknown) => LIVE && Boolean(cond);

// A generous timeout — real APIs are slower than the in-process mocks.
const T = 20_000;

describe.runIf(LIVE)('LIVE integrations', () => {
  it.runIf(on(process.env.CURRENCY_PROVIDER === 'frankfurter'))(
    'Frankfurter returns a plausible GBP→EUR rate',
    async () => {
      const rate = await createFrankfurterCurrency().rate('GBP', 'EUR');
      expect(rate).toBeGreaterThan(0.5);
      expect(rate).toBeLessThan(2.5);
    },
    T,
  );

  it.runIf(on(process.env.HOLIDAY_PROVIDER === 'nager'))(
    'Nager.Date returns UK public holidays including Christmas',
    async () => {
      const holidays = await createNagerHolidays().holidays(2026, 'GB');
      expect(holidays.length).toBeGreaterThan(0);
      expect(holidays.some((h) => /christmas/i.test(h.name))).toBe(true);
    },
    T,
  );

  it.runIf(on(process.env.WEATHER_PROVIDER === 'open-meteo'))(
    'Open-Meteo returns a warm July for Barcelona',
    async () => {
      const w = await createOpenMeteoWeather().forecast('barcelona', 7);
      expect(w).not.toBeNull();
      expect(w!.avgTempC).toBeGreaterThan(15);
      expect(w!.sunshineHours).toBeGreaterThan(0);
    },
    T,
  );

  it.runIf(on(process.env.LOCATION_PROVIDER === 'ipwho'))(
    'ipwho.is resolves a 2-letter country and a currency',
    async () => {
      const loc = await createIpwhoLocation().locate();
      expect(loc.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(loc.currency).toMatch(/^[A-Z]{3}$/);
    },
    T,
  );

  it.runIf(on(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET))(
    'Amadeus returns a real fare for LHR→BCN',
    async () => {
      const flights = createAmadeusFlights({
        clientId: process.env.AMADEUS_CLIENT_ID!,
        clientSecret: process.env.AMADEUS_CLIENT_SECRET!,
        hostname: process.env.AMADEUS_HOSTNAME,
      });
      const quote = await flights.quote('LHR', 'BCN', futureDate());
      expect(quote.price).toBeGreaterThan(0);
      expect(quote.currency).toMatch(/^[A-Z]{3}$/);
    },
    T,
  );

  it.runIf(on(process.env.RESEND_API_KEY && process.env.LIVE_EMAIL_TO))(
    'Resend accepts a real transactional email',
    async () => {
      const channel = new ResendEmailChannel(
        process.env.RESEND_API_KEY!,
        process.env.NOTIFY_EMAIL_FROM ?? 'Escape Plan <notify@escape-plan.app>',
        process.env.APP_BASE_URL ?? 'http://localhost:5173',
      );
      // Resolves (no throw) only when Resend returns a 2xx.
      await expect(
        channel.send({
          to: process.env.LIVE_EMAIL_TO!,
          subject: 'Escape Plan live integration test',
          body: 'This is a live smoke test of the Resend adapter.',
          link: '/plans',
        }),
      ).resolves.toBeUndefined();
    },
    T,
  );
});

/** ~60 days out, YYYY-MM-DD — a date real flight inventory should exist for. */
function futureDate(): string {
  const d = new Date(Date.now() + 60 * 86_400_000);
  return d.toISOString().slice(0, 10);
}
