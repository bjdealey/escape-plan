import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCalendarProvider,
  getCurrencyProvider,
  getFlightProvider,
  getHolidayProvider,
  getWeatherProvider,
  providerStatus,
} from '../src/providers/index.js';
import { createFrankfurterCurrency } from '../src/providers/currency.js';
import { createNagerHolidays } from '../src/providers/holidays.js';
import { createOpenMeteoWeather } from '../src/providers/weather.js';
import { createAmadeusFlights } from '../src/providers/flights.js';

function fakeResponse(json: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => json } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of [
    'CURRENCY_PROVIDER',
    'HOLIDAY_PROVIDER',
    'WEATHER_PROVIDER',
    'AMADEUS_CLIENT_ID',
    'AMADEUS_CLIENT_SECRET',
    'GOOGLE_ACCESS_TOKEN',
  ]) {
    delete process.env[k];
  }
});

describe('provider factory', () => {
  it('defaults every provider to the seeded mock', () => {
    expect(providerStatus()).toMatchObject({
      currency: 'mock',
      weather: 'mock',
      holidays: 'mock',
      flights: 'mock',
      calendar: 'mock',
    });
  });

  it('selects the live adapter when the env flag is set', () => {
    process.env.CURRENCY_PROVIDER = 'frankfurter';
    process.env.WEATHER_PROVIDER = 'open-meteo';
    process.env.HOLIDAY_PROVIDER = 'nager';
    expect(providerStatus()).toMatchObject({
      currency: 'live',
      weather: 'live',
      holidays: 'live',
    });
    // getters return functioning adapters
    expect(getCurrencyProvider()).toHaveProperty('rate');
    expect(getWeatherProvider()).toHaveProperty('forecast');
    expect(getHolidayProvider()).toHaveProperty('holidays');
    expect(getFlightProvider()).toHaveProperty('quote');
    expect(getCalendarProvider()).toHaveProperty('busyRanges');
  });
});

describe('Frankfurter currency adapter', () => {
  it('parses the ECB rate response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ base: 'GBP', date: '2026-01-01', rates: { EUR: 1.1752 } })),
    );
    const rate = await createFrankfurterCurrency().rate('GBP', 'EUR');
    expect(rate).toBeCloseTo(1.1752, 4);
  });

  it('short-circuits identical currencies without a network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await createFrankfurterCurrency().rate('GBP', 'GBP')).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a malformed response (untrusted input)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeResponse({ nonsense: true })));
    await expect(createFrankfurterCurrency().rate('GBP', 'EUR')).rejects.toThrow();
  });
});

describe('Nager.Date holidays adapter', () => {
  it('parses, sanitises, and de-duplicates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse([
          { date: '2026-01-01', name: "New Year's Day", localName: 'x' },
          { date: '2026-01-01', name: 'Duplicate' },
          { date: '2026-12-25', name: 'Christmas Day' },
        ]),
      ),
    );
    const out = await createNagerHolidays().holidays(2026, 'GB');
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ date: '2026-01-01', name: "New Year's Day" });
  });
});

describe('Open-Meteo weather adapter', () => {
  it('averages daily archive values into monthly climate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse({
          daily: {
            time: ['2023-07-01', '2023-07-02'],
            temperature_2m_mean: [24, 26],
            precipitation_sum: [1, 3],
            sunshine_duration: [36000, 36000], // 10h + 10h
          },
        }),
      ),
    );
    const out = await createOpenMeteoWeather().forecast('barcelona', 7);
    expect(out).toEqual({ avgTempC: 25, rainfallMm: 4, sunshineHours: 20, hazard: false });
  });

  it('returns null for an unknown destination without a network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await createOpenMeteoWeather().forecast('atlantis', 1)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('Amadeus flights adapter (documented contract)', () => {
  it('exchanges credentials for a token then returns a quote', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('oauth2/token')) {
        return fakeResponse({ access_token: 'tok', expires_in: 1800, token_type: 'Bearer' });
      }
      return fakeResponse({ data: [{ price: { total: '184.30', currency: 'GBP' } }] });
    });
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const quote = await createAmadeusFlights({ clientId: 'a', clientSecret: 'b' }).quote(
      'LHR',
      'BCN',
      '2026-06-01',
    );
    expect(quote).toEqual({ price: 184, currency: 'GBP' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
