import {
  type EngineInput,
  type EngineResult,
  optimise,
  weatherScore,
} from '@escape-plan/engine';
import { formatCurrency, formatDateShort } from '@/lib/utils';

export interface Suggestion {
  q: string;
}

export const SUGGESTED_QUESTIONS: Suggestion[] = [
  { q: 'When is the best time to visit Italy this year?' },
  { q: 'I have £1,200 and 8 days left — where can I go?' },
  { q: 'Can I make another long weekend?' },
  { q: 'What if I buy five extra leave days?' },
  { q: 'What if a colleague books my week off?' },
  { q: 'Show me cheaper alternatives.' },
  { q: 'Optimise again for warmer destinations.' },
];

/**
 * Deterministic natural-language layer over the engine. Every answer is
 * computed from the engine's structured output — no LLM required. When the AI
 * flag is on, the same facts would simply be rephrased by an LLM.
 */
export function answer(query: string, input: EngineInput, result: EngineResult): string {
  const q = query.toLowerCase();
  const currency = input.budget.currency;
  const best = result.plans[0];

  // Best time to visit a named destination.
  const named = input.destinations.find((d) => q.includes(d.name.toLowerCase()) || q.includes(d.country.toLowerCase()));
  if (named || q.includes('italy') || q.includes('visit') || q.includes('best time')) {
    const dest =
      named ??
      input.destinations.find((d) => d.country.toLowerCase().includes('ital')) ??
      input.destinations[0];
    let bestMonth = 1;
    let bestScore = -1;
    for (let m = 1; m <= 12; m++) {
      const s = weatherScore(dest, m, input);
      if (s > bestScore) {
        bestScore = s;
        bestMonth = m;
      }
    }
    const c = dest.climate.find((x) => x.month === bestMonth)!;
    const monthName = new Date(Date.UTC(2026, bestMonth - 1, 1)).toLocaleString('en-GB', {
      month: 'long',
    });
    return `The best window for ${dest.name} (${dest.country}) is around ${monthName}: about ${Math.round(
      c.avgTempC,
    )}°C, ${Math.round(c.sunshineHours)} hours of sunshine and low hazard risk. A week there is roughly ${formatCurrency(
      dest.flightCost + dest.accommodationPerNight * 6 + dest.dailySpend * 7,
      currency,
    )}.`;
  }

  // Budget + days-left style questions.
  const money = q.match(/[£$€]?\s?(\d{3,5})/);
  const daysMatch = q.match(/(\d{1,2})\s*day/);
  if ((q.includes('budget') || money) && (q.includes('where') || q.includes('go') || daysMatch)) {
    const cap = money ? Number(money[1]) : input.budget.maxTripBudget;
    const affordable = input.destinations
      .map((d) => ({
        d,
        cost: d.flightCost + d.accommodationPerNight * 4 + d.dailySpend * 5,
      }))
      .filter((x) => x.cost <= cap)
      .sort((a, b) => a.cost - b.cost)
      .slice(0, 3);
    if (affordable.length === 0)
      return `Nothing fits ${formatCurrency(cap, currency)} for a 5-day trip — a UK staycation keeps the cost near zero.`;
    return `With about ${formatCurrency(cap, currency)} you could do: ${affordable
      .map((x) => `${x.d.name} (~${formatCurrency(x.cost, currency)})`)
      .join(', ')}. All keep you within your per-trip budget cap.`;
  }

  // Another long weekend?
  if (q.includes('long weekend')) {
    const lw = result.plans
      .flatMap((p) => p.breaks)
      .find((b) => b.totalDaysOff >= 3 && b.totalDaysOff <= 4 && b.leaveDaysUsed <= 2);
    if (lw)
      return `Yes — booking ${lw.leaveDatesUsed.map(formatDateShort).join(', ')} turns the surrounding weekend into a ${lw.totalDaysOff}-day break for just ${lw.leaveDaysUsed} leave day${lw.leaveDaysUsed === 1 ? '' : 's'}${lw.bridgedHolidays.length ? ` (bridging ${lw.bridgedHolidays.join(', ')})` : ''}.`;
    return 'Your current plan already uses the best long-weekend bridges; raise the “Prefer long weekends” weight to surface more.';
  }

  // Buy extra leave days.
  if (q.includes('extra leave') || q.includes('buy') && q.includes('day')) {
    const n = Number(daysMatch?.[1] ?? 5);
    const boosted = optimise({
      ...input,
      // purchasedDays now feeds the bookable pool directly (see leave.ts), so
      // bump only that — bumping remaining too would double-count.
      leave: { ...input.leave, purchasedDays: input.leave.purchasedDays + n },
    });
    const boostedBest = [...boosted.plans].sort((a, b) => b.totalDaysOff - a.totalDaysOff)[0];
    const gain = boostedBest.totalDaysOff - best.totalDaysOff;
    if (gain <= 0) {
      const unused = result.bookableLeave - best.totalLeaveUsed;
      return `Buying ${n} extra day${n === 1 ? '' : 's'} wouldn't help right now — leave isn't your limiting factor. The top plan already leaves ${unused} bookable day${unused === 1 ? '' : 's'} unused; raise the “Maximise time off” weight or budget first.`;
    }
    return `Buying ${n} extra day${n === 1 ? '' : 's'} could lift your best plan from ${best.totalDaysOff} to ${boostedBest.totalDaysOff} days off (+${gain}), at an efficiency of ${boostedBest.efficiency.toFixed(2)}×.`;
  }

  // Colleague books your week.
  if (q.includes('colleague')) {
    return `Colleague leave is shown on the calendar as a layer. Your team allows ${input.leave.allowHalfDays ? 'half-days and ' : ''}up to the team cap of simultaneous absences; if a colleague books your preferred week, re-run optimisation and the engine will route around the clash automatically (blackout/busy dates are already excluded).`;
  }

  // Cheaper alternatives.
  if (q.includes('cheaper') || q.includes('alternative')) {
    const cheapest = [...result.plans].sort((a, b) => a.totalEstimatedCost - b.totalEstimatedCost)[0];
    return `The most economical plan is “${cheapest.strategyLabel}” at ${formatCurrency(
      cheapest.totalEstimatedCost,
      currency,
    )} for ${cheapest.totalDaysOff} days off. Switching domestic destinations or shortening trips lowers cost further.`;
  }

  // Warmer optimisation.
  if (q.includes('warm')) {
    const warmed = optimise({
      ...input,
      preferences: {
        ...input.preferences,
        weights: { ...input.preferences.weights, warmWeather: 5 },
        minPreferredTempC: Math.max(input.preferences.minPreferredTempC, 24),
      },
    });
    const p = warmed.plans[0];
    const dests = Array.from(new Set(p.breaks.map((b) => b.suggestion?.destinationName).filter(Boolean)));
    return `Re-optimised for warmth: “${p.strategyLabel}” scores ${p.score}, featuring ${
      dests.length ? dests.join(', ') : 'sunny escapes'
    }. Bump the “Warm weather” weight on the Preferences tab to make this permanent.`;
  }

  return `Your best plan is “${best.strategyLabel}” — ${best.totalDaysOff} days off from ${best.totalLeaveUsed} leave days (score ${best.score}). Ask about destinations, budgets, long weekends, buying leave, or cheaper options.`;
}
