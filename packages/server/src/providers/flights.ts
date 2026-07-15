import { z } from 'zod';
import type { FlightProvider } from '../integrations.js';
import { fetchJson } from './http.js';

/**
 * Real flight quotes from the Amadeus Self-Service API (documented, requires a
 * free developer key). Implemented against the published contract; NOT verified
 * live (no account available in this environment) — see ITERATION-NOTES.md.
 *
 * Token:  POST {host}/v1/security/oauth2/token  (client_credentials)
 * Offers: GET  {host}/v2/shopping/flight-offers?originLocationCode=&destinationLocationCode=
 *              &departureDate=&adults=1&max=1&currencyCode=
 */
const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });
const OffersSchema = z.object({
  data: z.array(z.object({ price: z.object({ total: z.string(), currency: z.string() }) })),
});

export interface AmadeusConfig {
  clientId: string;
  clientSecret: string;
  hostname?: string; // 'test.api.amadeus.com' (default) or 'api.amadeus.com'
  currency?: string;
}

export function createAmadeusFlights(cfg: AmadeusConfig): FlightProvider {
  const host = `https://${cfg.hostname ?? 'test.api.amadeus.com'}`;
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && token.expiresAt > Date.now() + 30_000) return token.value;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    });
    const data = await fetchJson(`${host}/v1/security/oauth2/token`, TokenSchema, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return token.value;
  }

  return {
    async quote(from, to, date) {
      const access = await getToken();
      const currency = cfg.currency ?? 'GBP';
      const url =
        `${host}/v2/shopping/flight-offers?originLocationCode=${from}` +
        `&destinationLocationCode=${to}&departureDate=${date}&adults=1&max=1&currencyCode=${currency}`;
      const data = await fetchJson(url, OffersSchema, {
        headers: { Authorization: `Bearer ${access}` },
      });
      const offer = data.data[0];
      if (!offer) throw new Error('No flight offers returned');
      const price = Number(offer.price.total);
      if (!Number.isFinite(price)) throw new Error('Invalid price in flight offer');
      return { price: Math.round(price), currency: offer.price.currency };
    },
  };
}
