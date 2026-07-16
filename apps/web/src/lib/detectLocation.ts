import { type GuessedLocation, guessLocationFromLocale } from '@escape-plan/engine';

/**
 * Keyless, no-prompt location guess from the browser locale. Reads the IANA
 * timezone and language — no permission dialog, nothing leaves the device.
 */
export function detectLocaleLocation(): GuessedLocation {
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    timeZone = undefined;
  }
  const language = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return guessLocationFromLocale({ timeZone, language });
}

/**
 * Optional refinement via the server's IP-geolocation adapter (env-gated,
 * mock by default). Never blocks the UI; returns null if unavailable.
 */
export async function detectServerLocation(): Promise<{ countryCode: string; currency: string } | null> {
  try {
    const res = await fetch('/api/integrations/location', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const data = (await res.json()) as { countryCode?: string; currency?: string };
    if (typeof data.countryCode === 'string' && typeof data.currency === 'string') {
      return { countryCode: data.countryCode, currency: data.currency };
    }
    return null;
  } catch {
    return null;
  }
}
