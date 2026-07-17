import { clamp, daysBetween } from './dateutil.js';
import type {
  ClimateMonth,
  Destination,
  EngineInput,
  TripSuggestion,
  WeatherSummary,
} from './types.js';
import type { CandidateBreak } from './calendar.js';

function climateFor(dest: Destination, month: number) {
  return dest.climate.find((c) => c.month === month) ?? dest.climate[0];
}

/**
 * Deterministic weather score for a destination in a given month.
 * Rewards warmth near the user's preferred minimum, sunshine, and low rain;
 * hard-penalises hazard (monsoon/hurricane) seasons.
 */
export function weatherScore(
  dest: Destination,
  month: number,
  input: EngineInput,
): number {
  const c = climateFor(dest, month);
  if (c.hazard) return 0.05;
  const minTemp = input.preferences.minPreferredTempC;
  const wantsSki = input.preferences.tripTypes.includes('skiing');

  // Warmth: 1.0 when at/above preferred min, tapering below.
  const warmth = clamp((c.avgTempC - (minTemp - 12)) / 12);
  const cold = clamp((5 - c.avgTempC) / 10) * (wantsSki ? 1 : 0); // ski bonus for cold
  const sunshine = clamp(c.sunshineHours / 320);
  const dryness = clamp(1 - c.rainfallMm / 200);
  const suitability = wantsSki ? c.skiScore : c.beachScore;

  const base = 0.4 * Math.max(warmth, cold) + 0.25 * sunshine + 0.2 * dryness + 0.15 * suitability;
  return clamp(base);
}

/** Summarise a monthly climate profile into a human-readable weather summary. */
export function weatherSummaryFromClimate(
  climate: ClimateMonth[],
  month: number,
): WeatherSummary {
  const c = climate.find((x) => x.month === month) ?? climate[0];
  const label = c.hazard
    ? 'Hazard season'
    : c.avgTempC >= 24
      ? 'Hot & sunny'
      : c.avgTempC >= 16
        ? 'Warm & pleasant'
        : c.avgTempC >= 8
          ? 'Mild'
          : 'Cold';
  return {
    avgTempC: c.avgTempC,
    sunshineHours: c.sunshineHours,
    hazard: c.hazard,
    label,
  };
}

export function weatherSummary(dest: Destination, month: number): WeatherSummary {
  return weatherSummaryFromClimate(dest.climate, month);
}

export interface CostBreakdown {
  total: number;
  flight: number;
  accommodation: number;
  spending: number;
}

/** Deterministic cost estimate for a candidate break at a destination. */
export function estimateCost(dest: Destination, candidate: CandidateBreak): CostBreakdown {
  const nights = Math.max(0, daysBetween(candidate.start, candidate.end) - 1);
  const days = daysBetween(candidate.start, candidate.end);
  const flight = dest.flightCost;
  const accommodation = dest.accommodationPerNight * nights;
  const spending = dest.dailySpend * days;
  return {
    total: Math.round(flight + accommodation + spending),
    flight,
    accommodation,
    spending,
  };
}

/**
 * Pick the best-fitting destination for a candidate break, respecting the
 * per-trip budget cap. Returns undefined when nothing fits the budget
 * (the break becomes a staycation with zero cost).
 */
export function suggestDestination(
  candidate: CandidateBreak,
  input: EngineInput,
): { suggestion: TripSuggestion; cost: number } | undefined {
  const prefs = input.preferences;
  const wantTypes = prefs.tripTypes;
  const scope = prefs.travelScope ?? 'any';
  const avoid = prefs.avoidCountries ?? [];
  const preferred = prefs.preferredCountries ?? [];
  let best: { suggestion: TripSuggestion; cost: number; rank: number } | undefined;

  for (const dest of input.destinations) {
    // --- Hard filters: only suggest what the user's preferences allow -------
    // Trip type: if the user selected any, require the destination to offer one.
    if (wantTypes.length > 0 && !dest.tripTypes.some((t) => wantTypes.includes(t))) continue;
    // Domestic / international scope.
    if (scope === 'domestic' && !dest.domestic) continue;
    if (scope === 'international' && dest.domestic) continue;
    // Country allow/block lists.
    if (avoid.includes(dest.countryCode)) continue;
    if (preferred.length > 0 && !preferred.includes(dest.countryCode)) continue;
    // Max flight time.
    if (prefs.maxFlightHours !== undefined && dest.flightHours > prefs.maxFlightHours) continue;
    // Budget.
    const cost = estimateCost(dest, candidate);
    if (cost.total > input.budget.maxTripBudget) continue;

    const wScore = weatherScore(dest, candidate.month, input);
    // Everything here already matches the trip type; rank on weather, then a
    // small boost for preferred countries.
    const rank = wScore + (preferred.includes(dest.countryCode) ? 0.05 : 0);
    const tripType =
      dest.tripTypes.find((t) => wantTypes.includes(t)) ?? dest.tripTypes[0];
    const candidateSuggestion = {
      suggestion: {
        destinationId: dest.id,
        destinationName: dest.name,
        country: dest.country,
        tripType,
        estimatedCost: cost.total,
        weather: weatherSummary(dest, candidate.month),
        weatherScore: wScore,
      },
      cost: cost.total,
      rank,
    };
    if (
      !best ||
      candidateSuggestion.rank > best.rank ||
      (candidateSuggestion.rank === best.rank &&
        dest.id < best.suggestion.destinationId)
    ) {
      best = candidateSuggestion;
    }
  }
  if (!best) return undefined;
  return { suggestion: best.suggestion, cost: best.cost };
}
