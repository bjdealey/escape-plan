/**
 * Pure, keyless location heuristics — the single source of truth for turning a
 * browser locale (or an IP-geolocation result) into a country, currency, and a
 * seeded "home" climate profile. Deterministic, no I/O, unit-testable.
 *
 * These are best-effort guesses; the user can always override them in the UI.
 */
import type { ClimateMonth } from './types.js';

/** ISO-4217 currency by ISO-3166 country code (common subset). */
export const COUNTRY_CURRENCY: Record<string, string> = {
  GB: 'GBP',
  IE: 'EUR', ES: 'EUR', FR: 'EUR', DE: 'EUR', IT: 'EUR', PT: 'EUR', GR: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', FI: 'EUR', LU: 'EUR',
  US: 'USD', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY',
  CH: 'CHF', SE: 'SEK', NO: 'NOK', DK: 'DKK',
};

/** Currencies the UI offers (detection results always land in this set). */
export const SUPPORTED_CURRENCIES = ['GBP', 'EUR', 'USD', 'CHF', 'CAD', 'AUD', 'JPY'];

export function currencyForCountry(countryCode: string): string {
  const cur = COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? 'GBP';
  return SUPPORTED_CURRENCIES.includes(cur) ? cur : 'GBP';
}

// Common IANA timezone → ISO country. Kept small + explicit; unknown ⇒ default.
const TZ_COUNTRY: Record<string, string> = {
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Madrid': 'ES',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Rome': 'IT',
  'Europe/Lisbon': 'PT',
  'Europe/Athens': 'GR',
  'Europe/Amsterdam': 'NL',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
  'Asia/Tokyo': 'JP',
};

export interface LocaleHint {
  language?: string; // e.g. 'en-GB'
  timeZone?: string; // e.g. 'Europe/London'
}

export interface GuessedLocation {
  countryCode: string;
  currency: string;
  source: 'timezone' | 'language' | 'default';
}

/**
 * Guess a location from a browser locale. Prefers the IANA timezone (most
 * reliable), then the language region tag, then falls back to GB.
 */
export function guessLocationFromLocale(hint: LocaleHint): GuessedLocation {
  const tz = hint.timeZone && TZ_COUNTRY[hint.timeZone];
  if (tz) return { countryCode: tz, currency: currencyForCountry(tz), source: 'timezone' };

  const region = hint.language?.split('-')[1]?.toUpperCase();
  if (region && /^[A-Z]{2}$/.test(region)) {
    return { countryCode: region, currency: currencyForCountry(region), source: 'language' };
  }
  return { countryCode: 'GB', currency: 'GBP', source: 'default' };
}

// --- Seeded home-climate profiles (northern-hemisphere monthly averages) ----

function climate(temps: number[], rain: number[], sun: number[]): ClimateMonth[] {
  return temps.map((_, i) => ({
    month: i + 1,
    avgTempC: temps[i],
    rainfallMm: rain[i],
    sunshineHours: sun[i],
    beachScore: 0,
    skiScore: 0,
    hazard: false,
  }));
}

export interface HomeProfile {
  countryCode: string;
  label: string;
  climate: ClimateMonth[];
}

/**
 * Representative home-climate profiles used for staycation weather examples.
 * Approximate national averages — seeded so the feature works offline.
 */
export const HOME_CLIMATES: Record<string, HomeProfile> = {
  GB: {
    countryCode: 'GB',
    label: 'United Kingdom',
    climate: climate(
      [5, 6, 8, 11, 14, 17, 19, 19, 16, 12, 8, 6],
      [55, 40, 40, 45, 50, 45, 45, 50, 50, 70, 60, 55],
      [60, 80, 110, 150, 190, 180, 190, 180, 140, 110, 70, 50],
    ),
  },
  IE: {
    countryCode: 'IE',
    label: 'Ireland',
    climate: climate(
      [5, 6, 7, 9, 12, 15, 17, 16, 14, 11, 7, 6],
      [65, 50, 55, 50, 55, 60, 55, 70, 60, 70, 65, 65],
      [55, 75, 100, 150, 190, 160, 150, 150, 120, 95, 65, 50],
    ),
  },
  ES: {
    countryCode: 'ES',
    label: 'Spain',
    climate: climate(
      [6, 8, 11, 13, 17, 23, 27, 26, 22, 15, 10, 7],
      [35, 35, 25, 45, 45, 25, 10, 10, 25, 50, 60, 50],
      [150, 170, 220, 240, 290, 320, 360, 330, 250, 190, 150, 130],
    ),
  },
  FR: {
    countryCode: 'FR',
    label: 'France',
    climate: climate(
      [5, 6, 9, 12, 16, 19, 21, 21, 17, 13, 8, 6],
      [50, 45, 45, 45, 55, 50, 55, 50, 45, 55, 55, 55],
      [60, 90, 130, 170, 200, 210, 230, 220, 170, 120, 70, 50],
    ),
  },
  DE: {
    countryCode: 'DE',
    label: 'Germany',
    climate: climate(
      [1, 2, 6, 10, 15, 18, 20, 19, 15, 10, 5, 2],
      [40, 30, 40, 40, 55, 70, 55, 60, 45, 40, 45, 45],
      [45, 70, 120, 160, 220, 220, 220, 210, 150, 110, 50, 40],
    ),
  },
  US: {
    countryCode: 'US',
    label: 'United States',
    climate: climate(
      [2, 4, 8, 14, 19, 24, 27, 26, 22, 15, 9, 4],
      [60, 55, 70, 80, 90, 90, 95, 85, 80, 70, 70, 65],
      [150, 170, 210, 240, 280, 300, 310, 290, 260, 220, 160, 140],
    ),
  },
};

/** Home profile for a country, defaulting to GB when unseeded. */
export function homeProfileForCountry(countryCode: string): HomeProfile {
  return HOME_CLIMATES[countryCode.toUpperCase()] ?? HOME_CLIMATES.GB;
}
