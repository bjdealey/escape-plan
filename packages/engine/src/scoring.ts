import { clamp, monthOf } from './dateutil.js';
import type { Break, EngineInput, Plan, ScoreBreakdown, Weights } from './types.js';

/** Reference longest-break length that maps to a perfect "time off" score. */
const IDEAL_LONGEST = 16;

interface Metrics {
  totalLeaveUsed: number;
  totalDaysOff: number;
  longestBreak: number;
  efficiency: number;
  totalCost: number;
}

export function summariseBreaks(breaks: Break[]): Metrics {
  const totalLeaveUsed = breaks.reduce((s, b) => s + b.leaveDaysUsed, 0);
  const totalDaysOff = breaks.reduce((s, b) => s + b.totalDaysOff, 0);
  const longestBreak = breaks.reduce((m, b) => Math.max(m, b.totalDaysOff), 0);
  const totalCost = breaks.reduce((s, b) => s + b.estimatedCost, 0);
  return {
    totalLeaveUsed,
    totalDaysOff,
    longestBreak,
    efficiency: totalLeaveUsed > 0 ? totalDaysOff / totalLeaveUsed : 0,
    totalCost,
  };
}

function quartersCovered(breaks: Break[]): number {
  const q = new Set(breaks.map((b) => Math.floor((monthOf(b.start) - 1) / 3)));
  return q.size;
}

function isLongWeekend(b: Break): boolean {
  return b.totalDaysOff >= 3 && b.totalDaysOff <= 4 && b.leaveDaysUsed <= 2;
}

/** Per-criterion scores in [0,1]. */
export function criterionScores(breaks: Break[], input: EngineInput) {
  const m = summariseBreaks(breaks);
  const bookable = input.leave.remaining - input.leave.reserveDays;

  const consecutive = clamp(m.longestBreak / IDEAL_LONGEST);

  // Efficiency of leave spend: 1 leave day → some days off. 2.0 ratio = great.
  const minimiseLeave = clamp((m.efficiency - 1) / 1.5);

  const weatherVals = breaks
    .map((b) => b.suggestion?.weatherScore)
    .filter((v): v is number => v !== undefined);
  const warmWeather =
    weatherVals.length > 0
      ? weatherVals.reduce((s, v) => s + v, 0) / weatherVals.length
      : 0;

  const budget =
    input.budget.holidayFund > 0
      ? clamp(1 - m.totalCost / input.budget.holidayFund)
      : 1;

  const spreadEvenly = breaks.length > 0 ? quartersCovered(breaks) / 4 : 0;

  // Preference match: month/season alignment + trip-length closeness.
  let prefHits = 0;
  for (const b of breaks) {
    const monthOk =
      input.preferences.preferredMonths.length === 0 ||
      input.preferences.preferredMonths.includes(monthOf(b.start));
    const seasonOk =
      input.preferences.preferredSeasons.length === 0 ||
      input.preferences.preferredSeasons.includes(b.season);
    const lenCloseness = clamp(
      1 - Math.abs(b.totalDaysOff - input.preferences.preferredTripLength) / 10,
    );
    prefHits += (monthOk ? 0.4 : 0) + (seasonOk ? 0.3 : 0) + lenCloseness * 0.3;
  }
  const preferenceMatch = breaks.length > 0 ? clamp(prefHits / breaks.length) : 0;

  const longWeekends =
    breaks.length > 0
      ? breaks.filter(isLongWeekend).length / breaks.length
      : 0;

  // Leave-conservation nudge folded into minimiseLeave when reserve matters.
  const conservation = bookable > 0 ? clamp(1 - m.totalLeaveUsed / bookable) : 1;

  return {
    maximiseConsecutive: consecutive,
    minimiseLeave: clamp(0.7 * minimiseLeave + 0.3 * conservation),
    warmWeather,
    budget,
    spreadEvenly: clamp(spreadEvenly),
    preferenceMatch,
    longWeekends,
  } satisfies Record<keyof Weights, number>;
}

const CRITERION_LABELS: Record<keyof Weights, string> = {
  maximiseConsecutive: 'Maximise consecutive days off',
  minimiseLeave: 'Spend the least leave',
  warmWeather: 'Warm weather',
  budget: 'Stay within budget',
  spreadEvenly: 'Spread evenly across the year',
  preferenceMatch: 'Match personal preferences',
  longWeekends: 'Prefer long weekends',
};

export function scorePlan(
  breaks: Break[],
  input: EngineInput,
): { score: number; breakdown: ScoreBreakdown[] } {
  const scores = criterionScores(breaks, input);
  const weights = input.preferences.weights;
  const keys = Object.keys(scores) as (keyof Weights)[];
  const totalWeight = keys.reduce((s, k) => s + Math.max(0, weights[k]), 0);

  const breakdown: ScoreBreakdown[] = keys.map((k) => {
    const weight = Math.max(0, weights[k]);
    const score = scores[k];
    return {
      criterion: CRITERION_LABELS[k],
      weight,
      score,
      contribution: weight * score,
    };
  });

  const weighted =
    totalWeight > 0
      ? breakdown.reduce((s, b) => s + b.contribution, 0) / totalWeight
      : keys.reduce((s, k) => s + scores[k], 0) / keys.length;

  return { score: Math.round(clamp(weighted) * 1000) / 10, breakdown };
}

/** Human-readable rationale + trade-offs for a plan. */
export function explainPlan(plan: Omit<Plan, 'explanation' | 'tradeoffs'>, input: EngineInput): {
  explanation: string;
  tradeoffs: string[];
} {
  const bookable = input.leave.remaining - input.leave.reserveDays;
  const bridged = Array.from(
    new Set(plan.breaks.flatMap((b) => b.bridgedHolidays)),
  );
  const parts: string[] = [];
  parts.push(
    `This plan turns ${plan.totalLeaveUsed} day${plan.totalLeaveUsed === 1 ? '' : 's'} of leave into ${plan.totalDaysOff} day${plan.totalDaysOff === 1 ? '' : 's'} off across ${plan.tripCount} break${plan.tripCount === 1 ? '' : 's'}`,
  );
  parts.push(`an efficiency of ${plan.efficiency.toFixed(2)}× days off per leave day.`);
  if (bridged.length > 0) {
    parts.push(
      `It bridges ${bridged.slice(0, 3).join(', ')}${bridged.length > 3 ? ` and ${bridged.length - 3} more` : ''} to extend weekends into longer escapes.`,
    );
  }
  if (plan.longestBreak > 0) {
    parts.push(`The longest single break is ${plan.longestBreak} days.`);
  }
  const withTrips = plan.breaks.filter((b) => b.suggestion);
  if (withTrips.length > 0) {
    const dests = Array.from(
      new Set(withTrips.map((b) => b.suggestion!.destinationName)),
    ).slice(0, 3);
    parts.push(
      `Suggested destinations include ${dests.join(', ')}, all within your per-trip budget.`,
    );
  }
  const anchored = Array.from(
    new Set(plan.breaks.filter((b) => b.anchorLabel).map((b) => b.anchorLabel!)),
  );
  if (anchored.length > 0) {
    parts.push(
      `It also books time off around ${anchored.slice(0, 3).join(', ')}${anchored.length > 3 ? ` and ${anchored.length - 3} more` : ''}.`,
    );
  }

  const tradeoffs: string[] = [];
  if (plan.totalLeaveUsed < bookable) {
    tradeoffs.push(
      `${bookable - plan.totalLeaveUsed} bookable leave day${bookable - plan.totalLeaveUsed === 1 ? '' : 's'} left unused — room for more breaks.`,
    );
  }
  if (input.leave.reserveDays > 0) {
    tradeoffs.push(
      `${input.leave.reserveDays} day${input.leave.reserveDays === 1 ? '' : 's'} kept in reserve for emergencies, as requested.`,
    );
  }
  if (plan.tripCount === 1) {
    tradeoffs.push('Concentrates leave into one long holiday rather than several short breaks.');
  } else if (plan.tripCount >= 4) {
    tradeoffs.push('Spreads leave across many short breaks rather than one long holiday.');
  }
  if (plan.totalEstimatedCost > input.budget.holidayFund) {
    tradeoffs.push(
      `Estimated spend exceeds your holiday fund by ${Math.round(plan.totalEstimatedCost - input.budget.holidayFund)} ${input.budget.currency} — consider staycations.`,
    );
  }

  return { explanation: parts.join(' '), tradeoffs };
}
