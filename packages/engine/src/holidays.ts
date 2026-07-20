/**
 * Bundled national public-holiday sets for 2026.
 *
 * The deployed web app runs the engine locally on fixtures, so it needs holiday
 * data on-device. Previously every user got UK bank holidays regardless of
 * country, which corrupts the core bridging logic (a German user's plan would
 * bridge Easter Monday / Spring bank holiday, days they don't actually get).
 *
 * These cover the countries the app can select as "home" (see HOME_CLIMATES).
 * Dates are the observed public holidays for 2026; floating and Easter-based
 * dates were resolved for that year. Regional/state-only holidays are excluded
 * to avoid over-claiming a day off nationwide. A server build can replace this
 * with the live holidays provider.
 */
import type { Holiday, ISODate } from './types.js';

/** England & Wales bank holidays for 2026 (also the default fallback set). */
const GB: Holiday[] = [
  { date: '2026-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2026-04-03', name: 'Good Friday', type: 'bank' },
  { date: '2026-04-06', name: 'Easter Monday', type: 'bank' },
  { date: '2026-05-04', name: 'Early May bank holiday', type: 'bank' },
  { date: '2026-05-25', name: 'Spring bank holiday', type: 'bank' },
  { date: '2026-08-31', name: 'Summer bank holiday', type: 'bank' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2026-12-28', name: 'Boxing Day (substitute)', type: 'bank' },
];

const IE: Holiday[] = [
  { date: '2026-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2026-02-02', name: "St Brigid's Day", type: 'bank' },
  { date: '2026-03-17', name: "St Patrick's Day", type: 'bank' },
  { date: '2026-04-06', name: 'Easter Monday', type: 'bank' },
  { date: '2026-05-04', name: 'May Day', type: 'bank' },
  { date: '2026-06-01', name: 'June Holiday', type: 'bank' },
  { date: '2026-08-03', name: 'August Holiday', type: 'bank' },
  { date: '2026-10-26', name: 'October Holiday', type: 'bank' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'bank' },
  { date: '2026-12-28', name: "St Stephen's Day (substitute)", type: 'bank' },
];

const FR: Holiday[] = [
  { date: '2026-01-01', name: "Jour de l'An", type: 'bank' },
  { date: '2026-04-06', name: 'Lundi de Pâques', type: 'bank' },
  { date: '2026-05-01', name: 'Fête du Travail', type: 'bank' },
  { date: '2026-05-08', name: 'Victoire 1945', type: 'bank' },
  { date: '2026-05-14', name: 'Ascension', type: 'bank' },
  { date: '2026-05-25', name: 'Lundi de Pentecôte', type: 'bank' },
  { date: '2026-07-14', name: 'Fête nationale', type: 'bank' },
  { date: '2026-08-15', name: 'Assomption', type: 'bank' },
  { date: '2026-11-01', name: 'Toussaint', type: 'bank' },
  { date: '2026-11-11', name: 'Armistice 1918', type: 'bank' },
  { date: '2026-12-25', name: 'Noël', type: 'bank' },
];

const DE: Holiday[] = [
  { date: '2026-01-01', name: 'Neujahr', type: 'bank' },
  { date: '2026-04-03', name: 'Karfreitag', type: 'bank' },
  { date: '2026-04-06', name: 'Ostermontag', type: 'bank' },
  { date: '2026-05-01', name: 'Tag der Arbeit', type: 'bank' },
  { date: '2026-05-14', name: 'Christi Himmelfahrt', type: 'bank' },
  { date: '2026-05-25', name: 'Pfingstmontag', type: 'bank' },
  { date: '2026-10-03', name: 'Tag der Deutschen Einheit', type: 'bank' },
  { date: '2026-12-25', name: '1. Weihnachtstag', type: 'bank' },
  { date: '2026-12-26', name: '2. Weihnachtstag', type: 'bank' },
];

const ES: Holiday[] = [
  { date: '2026-01-01', name: 'Año Nuevo', type: 'bank' },
  { date: '2026-01-06', name: 'Epifanía del Señor', type: 'bank' },
  { date: '2026-04-03', name: 'Viernes Santo', type: 'bank' },
  { date: '2026-05-01', name: 'Fiesta del Trabajo', type: 'bank' },
  { date: '2026-08-15', name: 'Asunción de la Virgen', type: 'bank' },
  { date: '2026-10-12', name: 'Fiesta Nacional de España', type: 'bank' },
  { date: '2026-11-01', name: 'Todos los Santos', type: 'bank' },
  { date: '2026-12-06', name: 'Día de la Constitución', type: 'bank' },
  { date: '2026-12-08', name: 'Inmaculada Concepción', type: 'bank' },
  { date: '2026-12-25', name: 'Navidad', type: 'bank' },
];

const US: Holiday[] = [
  { date: '2026-01-01', name: "New Year's Day", type: 'bank' },
  { date: '2026-01-19', name: 'Birthday of Martin Luther King, Jr.', type: 'bank' },
  { date: '2026-02-16', name: "Washington's Birthday", type: 'bank' },
  { date: '2026-05-25', name: 'Memorial Day', type: 'bank' },
  { date: '2026-06-19', name: 'Juneteenth National Independence Day', type: 'bank' },
  { date: '2026-07-03', name: 'Independence Day (observed)', type: 'bank' },
  { date: '2026-09-07', name: 'Labor Day', type: 'bank' },
  { date: '2026-10-12', name: 'Columbus Day', type: 'bank' },
  { date: '2026-11-11', name: 'Veterans Day', type: 'bank' },
  { date: '2026-11-26', name: 'Thanksgiving Day', type: 'bank' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'bank' },
];

/** National public holidays for 2026, by ISO-3166 country code. */
export const HOLIDAYS_2026: Record<string, Holiday[]> = { GB, IE, FR, DE, ES, US };

/** The year for which bundled holiday data is available. */
export const HOLIDAY_YEAR = 2026;

/**
 * National public holidays for a country. Defaults to GB (and returns an empty
 * set for any year other than the bundled one, so we never present another
 * year's dates as fact).
 */
export function holidaysForCountry(countryCode: string, year: number = HOLIDAY_YEAR): Holiday[] {
  if (year !== HOLIDAY_YEAR) return [];
  return HOLIDAYS_2026[countryCode.toUpperCase()] ?? HOLIDAYS_2026.GB;
}

/** Convenience: dates only, for callers that just need the day set. */
export function holidayDatesForCountry(countryCode: string, year?: number): ISODate[] {
  return holidaysForCountry(countryCode, year).map((h) => h.date);
}
