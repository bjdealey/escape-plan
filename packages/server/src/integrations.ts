/**
 * External-integration seam.
 *
 * Every third-party service the product will eventually use lives behind one of
 * these interfaces. The default implementations return deterministic, seeded
 * mock data and make NO network calls, so the app is fully explorable offline.
 * Swap the mock for a real client where marked.
 */
import { DEMO_DESTINATIONS } from '@escape-plan/engine';

export interface WeatherProvider {
  /** Average conditions for a destination in a given month. */
  forecast(destinationId: string, month: number): Promise<{
    avgTempC: number;
    rainfallMm: number;
    sunshineHours: number;
    hazard: boolean;
  } | null>;
}

export interface FlightProvider {
  /** Indicative return fare between airports on a date. */
  quote(from: string, to: string, date: string): Promise<{ price: number; currency: string }>;
}

export interface CurrencyProvider {
  rate(base: string, quote: string): Promise<number>;
}

export interface HrProvider {
  /** Approval-likelihood signal from the HR/team system. */
  approvalLikelihood(userId: number, start: string, end: string): Promise<number>;
}

export interface CalendarProvider {
  busyRanges(userId: number): Promise<{ start: string; end: string; label: string }[]>;
}

// ---------------------------------------------------------------------------
// Mock implementations (seeded). Replace with real clients when integrating.
// ---------------------------------------------------------------------------

export const mockWeather: WeatherProvider = {
  // TODO: real integration — Open-Meteo / OpenWeather. Swap this out.
  async forecast(destinationId, month) {
    const dest = DEMO_DESTINATIONS.find((d) => d.id === destinationId);
    const c = dest?.climate.find((m) => m.month === month);
    if (!c) return null;
    return {
      avgTempC: c.avgTempC,
      rainfallMm: c.rainfallMm,
      sunshineHours: c.sunshineHours,
      hazard: c.hazard,
    };
  },
};

export const mockFlights: FlightProvider = {
  // TODO: real integration — Skyscanner / Google Flights / Duffel.
  async quote(from, to, date) {
    // Deterministic pseudo-price derived from the route + date.
    const seed = [...`${from}${to}${date}`].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { price: 60 + (seed % 240), currency: 'GBP' };
  },
};

export const mockCurrency: CurrencyProvider = {
  // TODO: real integration — exchangerate.host / ECB feed.
  async rate(base, quote) {
    const table: Record<string, number> = { GBP: 1, EUR: 1.17, USD: 1.27, CHF: 1.12 };
    const b = table[base] ?? 1;
    const q = table[quote] ?? 1;
    return Math.round((q / b) * 10000) / 10000;
  },
};

export const mockHr: HrProvider = {
  // TODO: real integration — BambooHR / Workday / SAP SuccessFactors.
  async approvalLikelihood(_userId, start) {
    // Lower likelihood near quarter-end freezes; deterministic by month.
    const month = Number(start.slice(5, 7));
    const busy = [3, 6, 9, 12].includes(month);
    return busy ? 0.55 : 0.9;
  },
};

export const mockCalendar: CalendarProvider = {
  // TODO: real integration — Google / Microsoft 365 / Apple calendars.
  async busyRanges() {
    return [{ start: '2026-03-16', end: '2026-03-20', label: 'Project launch (busy)' }];
  },
};
