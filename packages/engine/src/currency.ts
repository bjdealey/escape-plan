/**
 * Pure, deterministic money conversion for the client.
 *
 * All monetary fixtures in this package (destination costs, the default budget)
 * are denominated in GBP. When the app runs for a non-GBP user we must convert
 * those amounts — not merely relabel the currency symbol — or every cost and
 * budget figure is wrong. The deployed web app is static (GitHub Pages) with no
 * reliable server, so we convert against a small, static GBP-based reference
 * table rather than a live rate feed.
 *
 * These are approximate reference rates for planning estimates only (the UI
 * already frames costs as "estimated"/"nominal"). They are NOT live quotes; a
 * server-backed build can substitute the Frankfurter provider if desired.
 */
import type { BudgetConfig, Destination } from './types.js';

/** Approximate units of each currency per 1 GBP. Static reference values. */
export const REFERENCE_RATES_GBP: Record<string, number> = {
  GBP: 1,
  EUR: 1.17,
  USD: 1.27,
  CHF: 1.12,
  CAD: 1.73,
  AUD: 1.93,
  JPY: 190,
};

/** Cross-rate to convert 1 unit of `from` into `to` via GBP. */
export function exchangeRate(from: string, to: string): number {
  if (from === to) return 1;
  const f = REFERENCE_RATES_GBP[from];
  const t = REFERENCE_RATES_GBP[to];
  // Unknown currency ⇒ no conversion, so we never fabricate a bogus figure.
  if (!f || !t) return 1;
  return t / f;
}

/** Convert a whole-unit amount between currencies, rounded to an integer. */
export function convertAmount(amount: number, from: string, to: string): number {
  return Math.round(amount * exchangeRate(from, to));
}

/**
 * Convert a budget into `toCurrency`. Amounts are read in `budget.currency`
 * (their current denomination) so user-edited values are preserved rather than
 * reset. Returns a new budget stamped with `toCurrency`.
 */
export function localiseBudget(budget: BudgetConfig, toCurrency: string): BudgetConfig {
  const from = budget.currency;
  if (from === toCurrency) return budget;
  return {
    ...budget,
    currency: toCurrency,
    holidayFund: convertAmount(budget.holidayFund, from, toCurrency),
    monthlySavings: convertAmount(budget.monthlySavings, from, toCurrency),
    maxTripBudget: convertAmount(budget.maxTripBudget, from, toCurrency),
  };
}

/**
 * Convert every cost field on a list of destinations from `fromCurrency` into
 * `toCurrency`. Destinations are non-editable fixtures, so callers can always
 * pass the canonical GBP list to re-derive costs deterministically.
 */
export function localiseDestinations(
  destinations: Destination[],
  fromCurrency: string,
  toCurrency: string,
): Destination[] {
  if (fromCurrency === toCurrency) return destinations;
  return destinations.map((d) => ({
    ...d,
    flightCost: convertAmount(d.flightCost, fromCurrency, toCurrency),
    accommodationPerNight: convertAmount(d.accommodationPerNight, fromCurrency, toCurrency),
    dailySpend: convertAmount(d.dailySpend, fromCurrency, toCurrency),
  }));
}
