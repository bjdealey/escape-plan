import { z } from 'zod';
import { currencyForCountry } from '@escape-plan/engine';
import type { GeoLocation, LocationProvider } from '../integrations.js';
import { fetchJson } from './http.js';

/**
 * Real IP geolocation via ipwho.is (https://ipwho.is/), free + keyless over
 * HTTPS. Contract: GET https://ipwho.is/  (or https://ipwho.is/{ip})
 *   -> { "success": true, "country_code": "GB", "timezone": { "id": "Europe/London" }, ... }
 * Only country + timezone are used; currency is derived from the country. No
 * personal data is persisted. Verified live during development.
 */
const IpwhoSchema = z.object({
  success: z.boolean().optional(),
  message: z.string().optional(),
  country_code: z.string().length(2).optional(),
  timezone: z.object({ id: z.string().optional() }).optional(),
});

export function createIpwhoLocation(): LocationProvider {
  return {
    async locate(ip?: string): Promise<GeoLocation> {
      const url = ip ? `https://ipwho.is/${encodeURIComponent(ip)}` : 'https://ipwho.is/';
      const data = await fetchJson(url, IpwhoSchema);
      if (data.success === false) throw new Error(data.message ?? 'geolocation failed');
      const countryCode = (data.country_code ?? 'GB').toUpperCase();
      return {
        countryCode,
        currency: currencyForCountry(countryCode),
        timezone: data.timezone?.id,
      };
    },
  };
}
