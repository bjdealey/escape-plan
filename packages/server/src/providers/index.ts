/**
 * Provider factory. Each getter returns a real, env-gated adapter when its
 * flag/key is present, and otherwise the existing seeded mock — so a fresh
 * clone with no configuration behaves exactly as before.
 */
import {
  mockCalendar,
  mockCurrency,
  mockFlights,
  mockHoliday,
  mockHr,
  mockLocation,
  mockWeather,
  type CalendarProvider,
  type CurrencyProvider,
  type FlightProvider,
  type HolidayProvider,
  type HrProvider,
  type LocationProvider,
  type WeatherProvider,
} from '../integrations.js';
import { createFrankfurterCurrency } from './currency.js';
import { createNagerHolidays } from './holidays.js';
import { createOpenMeteoWeather } from './weather.js';
import { createAmadeusFlights } from './flights.js';
import { createGoogleCalendar } from './calendar.js';
import { createIpwhoLocation } from './location.js';

export function getLocationProvider(): LocationProvider {
  return process.env.LOCATION_PROVIDER === 'ipwho' ? createIpwhoLocation() : mockLocation;
}

export function getCurrencyProvider(): CurrencyProvider {
  return process.env.CURRENCY_PROVIDER === 'frankfurter'
    ? createFrankfurterCurrency()
    : mockCurrency;
}

export function getHolidayProvider(): HolidayProvider {
  return process.env.HOLIDAY_PROVIDER === 'nager' ? createNagerHolidays() : mockHoliday;
}

export function getWeatherProvider(): WeatherProvider {
  return process.env.WEATHER_PROVIDER === 'open-meteo' ? createOpenMeteoWeather() : mockWeather;
}

export function getFlightProvider(): FlightProvider {
  const clientId = process.env.AMADEUS_CLIENT_ID;
  const clientSecret = process.env.AMADEUS_CLIENT_SECRET;
  if (clientId && clientSecret) {
    return createAmadeusFlights({
      clientId,
      clientSecret,
      hostname: process.env.AMADEUS_HOSTNAME,
    });
  }
  return mockFlights;
}

export function getCalendarProvider(): CalendarProvider {
  const token = process.env.GOOGLE_ACCESS_TOKEN;
  return token ? createGoogleCalendar(token) : mockCalendar;
}

export function getHrProvider(): HrProvider {
  // No free HR provider; the mock approval-likelihood signal is the default.
  return mockHr;
}

/** Which providers are live vs. mock — surfaced on /api/health for visibility. */
export function providerStatus(): Record<string, 'live' | 'mock'> {
  return {
    currency: process.env.CURRENCY_PROVIDER === 'frankfurter' ? 'live' : 'mock',
    holidays: process.env.HOLIDAY_PROVIDER === 'nager' ? 'live' : 'mock',
    weather: process.env.WEATHER_PROVIDER === 'open-meteo' ? 'live' : 'mock',
    flights:
      process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET ? 'live' : 'mock',
    calendar: process.env.GOOGLE_ACCESS_TOKEN ? 'live' : 'mock',
    hr: 'mock',
    location: process.env.LOCATION_PROVIDER === 'ipwho' ? 'live' : 'mock',
  };
}
