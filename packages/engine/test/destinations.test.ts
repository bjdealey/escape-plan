import { describe, expect, it } from 'vitest';
import {
  DEMO_DESTINATIONS,
  demoInput,
  estimateCost,
  suggestDestination,
  weatherScore,
} from '../src/index.js';
import type { CandidateBreak } from '../src/index.js';

const crete = DEMO_DESTINATIONS.find((d) => d.id === 'crete')!;
const chamonix = DEMO_DESTINATIONS.find((d) => d.id === 'chamonix')!;

function candidate(start: string, end: string, leaveDays = 3): CandidateBreak {
  return {
    start,
    end,
    leaveDates: [],
    leaveDaysUsed: leaveDays,
    totalDaysOff: 7,
    bridgedHolidays: [],
    month: Number(start.slice(5, 7)),
    season: 'summer',
    efficiency: 7 / leaveDays,
  };
}

describe('weatherScore', () => {
  it('rewards warm, sunny months for a beach lover', () => {
    const input = demoInput();
    const july = weatherScore(crete, 7, input);
    const january = weatherScore(crete, 1, input);
    expect(july).toBeGreaterThan(january);
    expect(july).toBeGreaterThan(0.6);
  });

  it('hard-penalises hazard months', () => {
    const input = demoInput();
    // Force a hazard month on a clone.
    const hazardDest = {
      ...crete,
      climate: crete.climate.map((c) => (c.month === 7 ? { ...c, hazard: true } : c)),
    };
    expect(weatherScore(hazardDest, 7, input)).toBeLessThan(0.1);
  });

  it('rewards cold months when the user wants skiing', () => {
    const input = demoInput({
      preferences: { ...demoInput().preferences, tripTypes: ['skiing'] },
    });
    expect(weatherScore(chamonix, 1, input)).toBeGreaterThan(weatherScore(chamonix, 7, input));
  });
});

describe('estimateCost', () => {
  it('sums flight, accommodation, and daily spend deterministically', () => {
    const cost = estimateCost(crete, candidate('2026-07-01', '2026-07-07'));
    // 7 days -> 6 nights
    const expected =
      crete.flightCost + crete.accommodationPerNight * 6 + crete.dailySpend * 7;
    expect(cost.total).toBe(Math.round(expected));
    expect(cost.flight).toBe(crete.flightCost);
  });
});

describe('suggestDestination', () => {
  it('returns undefined (staycation) when nothing fits the per-trip budget', () => {
    const input = demoInput({ budget: { ...demoInput().budget, maxTripBudget: 10 } });
    expect(suggestDestination(candidate('2026-07-01', '2026-07-07'), input)).toBeUndefined();
  });

  it('respects the per-trip budget cap when it does suggest', () => {
    const input = demoInput({ budget: { ...demoInput().budget, maxTripBudget: 900 } });
    const picked = suggestDestination(candidate('2026-07-01', '2026-07-04'), input);
    if (picked) expect(picked.cost).toBeLessThanOrEqual(900);
  });
});
