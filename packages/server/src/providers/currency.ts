import { z } from 'zod';
import type { CurrencyProvider } from '../integrations.js';
import { fetchJson } from './http.js';

/**
 * Real currency rates from Frankfurter (https://frankfurter.dev), a free,
 * keyless API backed by European Central Bank reference rates.
 * Contract: GET https://api.frankfurter.app/latest?base=GBP&symbols=EUR
 *   -> { "amount": 1.0, "base": "GBP", "date": "...", "rates": { "EUR": 1.17 } }
 */
const FrankfurterSchema = z.object({
  base: z.string(),
  rates: z.record(z.string(), z.number()),
});

const HOST = 'https://api.frankfurter.app';

export function createFrankfurterCurrency(): CurrencyProvider {
  return {
    async rate(base, quote) {
      if (base === quote) return 1;
      const url = `${HOST}/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;
      const data = await fetchJson(url, FrankfurterSchema);
      const value = data.rates[quote];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`No rate for ${base}->${quote}`);
      }
      return Math.round(value * 10000) / 10000;
    },
  };
}
