import { describe, expect, it } from 'vitest';
import {
  currencyForCountry,
  demoInput,
  guessLocationFromLocale,
  homeProfileForCountry,
  optimise,
} from '../src/index.js';

describe('locale → location guess', () => {
  it('prefers the IANA timezone', () => {
    const g = guessLocationFromLocale({ timeZone: 'Europe/London', language: 'en-US' });
    expect(g).toMatchObject({ countryCode: 'GB', currency: 'GBP', source: 'timezone' });
  });

  it('falls back to the language region', () => {
    const g = guessLocationFromLocale({ language: 'en-US' });
    expect(g).toMatchObject({ countryCode: 'US', currency: 'USD', source: 'language' });
  });

  it('defaults to GB when nothing is known', () => {
    expect(guessLocationFromLocale({})).toMatchObject({ countryCode: 'GB', source: 'default' });
  });

  it('maps countries to currencies (euro zone, unknown → GBP)', () => {
    expect(currencyForCountry('FR')).toBe('EUR');
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('ZZ')).toBe('GBP');
  });

  it('provides a home climate profile, defaulting to GB', () => {
    expect(homeProfileForCountry('ES').label).toBe('Spain');
    expect(homeProfileForCountry('ZZ').countryCode).toBe('GB');
  });
});

describe('home weather on staycations', () => {
  it('annotates staycation breaks with local weather when home is set', () => {
    const home = homeProfileForCountry('GB');
    // Tiny per-trip budget forces every break to a zero-cost staycation.
    const result = optimise(demoInput({ home, budget: { ...demoInput().budget, maxTripBudget: 10 } }));
    const breaks = result.plans.flatMap((p) => p.breaks);
    expect(breaks.length).toBeGreaterThan(0);
    for (const b of breaks) {
      expect(b.suggestion).toBeUndefined();
      expect(b.homeWeather).toBeDefined();
      expect(typeof b.homeWeather!.avgTempC).toBe('number');
    }
  });

  it('leaves homeWeather undefined when no home is supplied (solo unchanged)', () => {
    const result = optimise(demoInput({ budget: { ...demoInput().budget, maxTripBudget: 10 } }));
    for (const b of result.plans.flatMap((p) => p.breaks)) {
      expect(b.homeWeather).toBeUndefined();
    }
  });

  it('trips abroad keep destination weather, not home weather', () => {
    const home = homeProfileForCountry('GB');
    const result = optimise(demoInput({ home }));
    const trip = result.plans.flatMap((p) => p.breaks).find((b) => b.suggestion);
    if (trip) {
      expect(trip.homeWeather).toBeUndefined();
      expect(trip.suggestion!.weather).toBeDefined();
    }
  });
});
