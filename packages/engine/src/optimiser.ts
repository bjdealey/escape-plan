import { buildCalendar, computeBreaks, generateCandidates } from './calendar.js';
import type { CandidateBreak, DayInfo } from './calendar.js';
import { suggestDestination, weatherSummaryFromClimate } from './destinations.js';
import { ISODate, addDays, dateRange, daysBetween, monthOf, seasonOf } from './dateutil.js';
import { purposeForKind } from './occasions.js';
import { availableLeaveDays, bookableLeaveDays, shutdownLeaveDays } from './leave.js';
import { explainPlan, scorePlan, summariseBreaks } from './scoring.js';
import { colleaguesOffOn } from './groups.js';
import type { Break, EngineInput, EngineResult, Plan, Weights } from './types.js';

/**
 * True when booking this candidate's leave dates would push the number of
 * colleagues off on any working day above `maxSimultaneous`. Only active in
 * group mode (both fields present); otherwise never constrains.
 */
function violatesCapacity(leaveDates: ISODate[], input: EngineInput): boolean {
  if (input.maxSimultaneous === undefined || !input.colleagueLeave?.length) return false;
  return leaveDates.some(
    (d) => colleaguesOffOn(input.colleagueLeave!, d) + 1 > input.maxSimultaneous!,
  );
}

function overlapDays(leaveDates: ISODate[], input: EngineInput): number | undefined {
  if (!input.colleagueLeave?.length) return undefined;
  return leaveDates.filter((d) => colleaguesOffOn(input.colleagueLeave!, d) > 0).length;
}

interface StrategyDef {
  key: string;
  label: string;
  /** Order candidates best-first for this strategy. */
  sort: (a: CandidateBreak, b: CandidateBreak, input: EngineInput) => number;
  /** Optional cap on number of breaks selected. */
  maxBreaks?: number;
  /** Optional filter of eligible candidates. */
  filter?: (c: CandidateBreak) => boolean;
}

function byTie(a: CandidateBreak, b: CandidateBreak): number {
  // Deterministic tie-break: earlier start, then more days off, then fewer leave.
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  if (a.totalDaysOff !== b.totalDaysOff) return b.totalDaysOff - a.totalDaysOff;
  return a.leaveDaysUsed - b.leaveDaysUsed;
}

function customHeuristic(c: CandidateBreak, w: Weights, input: EngineInput): number {
  const isLongWeekend = c.totalDaysOff >= 3 && c.totalDaysOff <= 4 && c.leaveDaysUsed <= 2;
  const monthPref =
    input.preferences.preferredMonths.length === 0 ||
    input.preferences.preferredMonths.includes(c.month)
      ? 1
      : 0;
  const seasonPref =
    input.preferences.preferredSeasons.length === 0 ||
    input.preferences.preferredSeasons.includes(c.season)
      ? 1
      : 0;
  return (
    w.maximiseConsecutive * (c.totalDaysOff / 16) +
    w.minimiseLeave * (c.efficiency - 1) +
    w.longWeekends * (isLongWeekend ? 1 : 0) +
    w.preferenceMatch * (0.5 * monthPref + 0.5 * seasonPref) +
    w.spreadEvenly * 0.1
  );
}

function buildStrategies(input: EngineInput): StrategyDef[] {
  const w = input.preferences.weights;
  const short = input.preferences.preferShortBreaks;
  return [
    {
      key: 'max-time-off',
      label: 'Maximise time off',
      maxBreaks: 4,
      sort: (a, b) => b.totalDaysOff - a.totalDaysOff || byTie(a, b),
    },
    {
      key: 'max-efficiency',
      label: 'Fewest leave days',
      maxBreaks: 6,
      sort: (a, b) => b.efficiency - a.efficiency || byTie(a, b),
    },
    {
      key: 'long-weekends',
      label: 'Frequent long weekends',
      maxBreaks: 6,
      filter: (c) => c.totalDaysOff >= 3 && c.leaveDaysUsed <= 2,
      sort: (a, b) => b.efficiency - a.efficiency || byTie(a, b),
    },
    {
      key: 'one-long-holiday',
      label: 'One long holiday',
      maxBreaks: 1,
      sort: (a, b) => b.totalDaysOff - a.totalDaysOff || byTie(a, b),
    },
    {
      key: 'spread-evenly',
      label: 'Spread across the year',
      maxBreaks: 4,
      sort: (a, b) => b.efficiency - a.efficiency || byTie(a, b),
    },
    {
      key: 'custom',
      label: 'Tuned to your priorities',
      maxBreaks: short ? 6 : 5,
      sort: (a, b) =>
        customHeuristic(b, w, input) - customHeuristic(a, w, input) || byTie(a, b),
    },
  ];
}

function overlaps(occupied: Set<ISODate>, start: ISODate, end: ISODate): boolean {
  return dateRange(start, end).some((d) => occupied.has(d));
}

function markOccupied(occupied: Set<ISODate>, start: ISODate, end: ISODate): void {
  for (const d of dateRange(start, end)) occupied.add(d);
}

function candidateToBreak(c: CandidateBreak, input: EngineInput): Break {
  const dest = suggestDestination(c, input);
  return {
    start: c.start,
    end: c.end,
    leaveDatesUsed: c.leaveDates,
    leaveDaysUsed: c.leaveDaysUsed,
    totalDaysOff: c.totalDaysOff,
    bridgedHolidays: c.bridgedHolidays,
    month: c.month,
    season: c.season,
    suggestion: dest?.suggestion,
    estimatedCost: dest?.cost ?? 0,
    colleagueOverlapDays: overlapDays(c.leaveDates, input),
    // Staycation (no trip) → show the user's local weather when home is known.
    homeWeather:
      !dest && input.home ? weatherSummaryFromClimate(input.home.climate, c.month) : undefined,
    purpose: dest ? 'getaway' : input.home ? 'staycation' : 'rest',
  };
}

/** Strip the travel suggestion so a break becomes a zero-cost staycation. */
function toStaycation(brk: Break, input: EngineInput): Break {
  return {
    ...brk,
    suggestion: undefined,
    estimatedCost: 0,
    homeWeather: input.home
      ? weatherSummaryFromClimate(input.home.climate, brk.month)
      : brk.homeWeather,
    // Keep an explicit non-travel purpose (e.g. anchored breaks stay 'event').
    purpose: brk.purpose && brk.purpose !== 'getaway' ? brk.purpose : 'staycation',
  };
}

/** Build forced breaks from mandatory leave dates. */
function forcedBreaks(
  calendar: Map<ISODate, DayInfo>,
  input: EngineInput,
): { breaks: Break[]; occupied: Set<ISODate>; leaveUsed: number } {
  const occupied = new Set<ISODate>();
  const mandatory = new Set(
    input.leave.mandatoryDates.filter((d) => calendar.get(d)?.bookable),
  );
  if (mandatory.size === 0) return { breaks: [], occupied, leaveUsed: 0 };

  const raw = computeBreaks(calendar, mandatory, input.year);
  const breaks = raw.map((r) => {
    const cand: CandidateBreak = {
      start: r.start,
      end: r.end,
      leaveDates: r.leaveDatesUsed,
      leaveDaysUsed: r.leaveDatesUsed.length,
      totalDaysOff: r.totalDaysOff,
      bridgedHolidays: dateRange(r.start, r.end)
        .map((d) => calendar.get(d)?.holidayName)
        .filter((n): n is string => Boolean(n)),
      month: monthOf(r.start),
      season: seasonOf(r.start),
      efficiency: r.totalDaysOff / r.leaveDatesUsed.length,
    };
    markOccupied(occupied, r.start, r.end);
    return candidateToBreak(cand, input);
  });
  const leaveUsed = breaks.reduce((s, b) => s + b.leaveDaysUsed, 0);
  return { breaks, occupied, leaveUsed };
}

/**
 * Find the cheapest `target`-day window that contains `anchor` — i.e. the fewest
 * leave days needed to take a break around a date the user cares about, using
 * nearby weekends/holidays where possible. Windows crossing a blackout are
 * rejected. Returns the window expanded to its full contiguous days-off run.
 */
function cheapestWindowContaining(
  calendar: Map<ISODate, DayInfo>,
  anchor: ISODate,
  target: number,
  year: number,
): { start: ISODate; end: ISODate; leaveDates: ISODate[] } | undefined {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  let best: { start: ISODate; end: ISODate; leaveDates: ISODate[] } | undefined;
  for (let offset = 0; offset < target; offset++) {
    const start = addDays(anchor, -offset);
    const end = addDays(start, target - 1);
    if (start < yearStart || end > yearEnd) continue;
    const days = dateRange(start, end);
    const blocked = days.some((d) => {
      const info = calendar.get(d);
      return info && !info.naturallyOff && !info.bookable; // blackout working day
    });
    if (blocked) continue;
    const leaveDates = days.filter((d) => calendar.get(d)?.bookable);
    if (leaveDates.length === 0) continue; // already off — nothing to book
    if (
      !best ||
      leaveDates.length < best.leaveDates.length ||
      (leaveDates.length === best.leaveDates.length && start < best.start)
    ) {
      best = { start, end, leaveDates };
    }
  }
  if (!best) return undefined;
  const leaveSet = new Set(best.leaveDates);
  const isOff = (d: ISODate) => {
    const info = calendar.get(d);
    return Boolean(info && (info.naturallyOff || leaveSet.has(d)));
  };
  let s = best.start;
  while (calendar.has(addDays(s, -1)) && isOff(addDays(s, -1))) s = addDays(s, -1);
  let e = best.end;
  while (calendar.has(addDays(e, 1)) && isOff(addDays(e, 1))) e = addDays(e, 1);
  return { start: s, end: e, leaveDates: best.leaveDates };
}

/**
 * Build forced breaks anchored around personal dates flagged `bookAround`
 * (weddings, birthdays, moving day, etc.). These are non-travel by design and
 * respect the emergency reserve — anchors that don't fit are skipped.
 */
function anchoredBreaks(
  calendar: Map<ISODate, DayInfo>,
  input: EngineInput,
  occupied: Set<ISODate>,
  leaveUsedStart: number,
  bookableLeave: number,
): { breaks: Break[]; leaveUsed: number } {
  const breaks: Break[] = [];
  let leaveUsed = leaveUsedStart;
  const anchors = input.preferences.personalDates
    .filter((p) => p.bookAround && calendar.has(p.date))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const anchor of anchors) {
    const target = Math.max(
      1,
      anchor.daysAround ?? Math.min(4, input.preferences.preferredTripLength),
    );
    const win = cheapestWindowContaining(calendar, anchor.date, target, input.year);
    if (!win) continue;
    if (win.leaveDates.some((d) => occupied.has(d))) continue; // overlaps another break
    if (leaveUsed + win.leaveDates.length > bookableLeave) continue; // honour the reserve
    if (violatesCapacity(win.leaveDates, input)) continue; // honour max-colleagues-off

    const span = dateRange(win.start, win.end);
    const bridged = span
      .map((d) => calendar.get(d)?.holidayName)
      .filter((n): n is string => Boolean(n));
    const brk: Break = {
      start: win.start,
      end: win.end,
      leaveDatesUsed: win.leaveDates,
      leaveDaysUsed: win.leaveDates.length,
      totalDaysOff: daysBetween(win.start, win.end),
      bridgedHolidays: Array.from(new Set(bridged)),
      month: monthOf(win.start),
      season: seasonOf(win.start),
      suggestion: undefined, // anchored to a commitment — not a trip
      estimatedCost: 0,
      colleagueOverlapDays: overlapDays(win.leaveDates, input),
      homeWeather: input.home
        ? weatherSummaryFromClimate(input.home.climate, monthOf(win.start))
        : undefined,
      purpose: purposeForKind(anchor.kind),
      anchorLabel: anchor.label,
    };
    markOccupied(occupied, brk.start, brk.end);
    leaveUsed += brk.leaveDaysUsed;
    breaks.push(brk);
  }
  return { breaks, leaveUsed };
}

function selectForStrategy(
  strategy: StrategyDef,
  candidates: CandidateBreak[],
  input: EngineInput,
  bookableLeave: number,
  base: { breaks: Break[]; occupied: Set<ISODate>; leaveUsed: number },
): Break[] {
  const occupied = new Set(base.occupied);
  const breaks: Break[] = [...base.breaks];
  let leaveUsed = base.leaveUsed;
  let spend = base.breaks.reduce((s, b) => s + b.estimatedCost, 0);
  const fund = input.budget.holidayFund;
  const schoolHolidays = input.schoolHolidays;

  // Add a candidate, respecting the annual holiday fund: once the fund is
  // exhausted, remaining breaks are kept as zero-cost staycations rather than
  // pushing total spend over budget.
  const addBreak = (c: CandidateBreak) => {
    let brk = candidateToBreak(c, input);
    if (spend + brk.estimatedCost > fund) brk = toStaycation(brk, input);
    breaks.push(brk);
    markOccupied(occupied, c.start, c.end);
    leaveUsed += c.leaveDaysUsed;
    spend += brk.estimatedCost;
  };

  const pool = candidates
    .filter((c) => (strategy.filter ? strategy.filter(c) : true))
    .filter((c) => !violatesCapacity(c.leaveDates, input))
    .filter((c) => {
      if (!input.preferences.avoidSchoolHolidays) return true;
      return !dateRange(c.start, c.end).some((d) =>
        schoolHolidays.some((r) => d >= r.start && d <= r.end),
      );
    })
    .sort((a, b) => strategy.sort(a, b, input));

  const capReached = () =>
    strategy.maxBreaks !== undefined &&
    breaks.length - base.breaks.length >= strategy.maxBreaks;

  // For "spread evenly" we pick the best candidate per quarter first.
  if (strategy.key === 'spread-evenly') {
    const perQuarter = new Map<number, CandidateBreak>();
    for (const c of pool) {
      const q = Math.floor((c.month - 1) / 3);
      if (!perQuarter.has(q)) perQuarter.set(q, c);
    }
    for (const c of [...perQuarter.values()].sort(byTie)) {
      if (capReached()) break;
      if (leaveUsed + c.leaveDaysUsed > bookableLeave) continue;
      if (overlaps(occupied, c.start, c.end)) continue;
      addBreak(c);
    }
  }

  for (const c of pool) {
    if (capReached()) break;
    if (leaveUsed + c.leaveDaysUsed > bookableLeave) continue;
    if (overlaps(occupied, c.start, c.end)) continue;
    addBreak(c);
  }

  return breaks.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
}

function assemblePlan(strategy: StrategyDef, breaks: Break[], input: EngineInput): Plan {
  const m = summariseBreaks(breaks);
  const { score, breakdown } = scorePlan(breaks, input);
  const partial = {
    id: `${strategy.key}`,
    strategy: strategy.key,
    strategyLabel: strategy.label,
    breaks,
    totalLeaveUsed: m.totalLeaveUsed,
    totalDaysOff: m.totalDaysOff,
    longestBreak: m.longestBreak,
    tripCount: breaks.length,
    efficiency: Math.round(m.efficiency * 100) / 100,
    totalEstimatedCost: m.totalCost,
    score,
    scoreBreakdown: breakdown,
  };
  const { explanation, tradeoffs } = explainPlan(partial, input);
  return { ...partial, explanation, tradeoffs };
}

/**
 * The public entry point. Deterministic, pure, LLM-free. Given typed input,
 * returns multiple ranked plans each with a transparent score, plain-language
 * explanation, and trade-offs.
 */
export function optimise(input: EngineInput): EngineResult {
  const calendar = buildCalendar(input);
  const availableLeave = availableLeaveDays(input.leave);
  const shutdownLeave = shutdownLeaveDays(input);
  const bookableLeave = bookableLeaveDays(input.leave, shutdownLeave);
  const candidates = generateCandidates(calendar, input);
  const forced = forcedBreaks(calendar, input);
  // Anchored breaks (birthdays, weddings, moving day…) join the forced base so
  // every plan honours them; `forced.occupied` is extended in place.
  const anchored = anchoredBreaks(
    calendar,
    input,
    forced.occupied,
    forced.leaveUsed,
    bookableLeave,
  );
  const base = {
    breaks: [...forced.breaks, ...anchored.breaks],
    occupied: forced.occupied,
    leaveUsed: anchored.leaveUsed,
  };
  const strategies = buildStrategies(input);

  const plans: Plan[] = [];
  const signatures = new Set<string>();
  for (const strategy of strategies) {
    const breaks = selectForStrategy(strategy, candidates, input, bookableLeave, base);
    if (breaks.length === 0) continue;
    const sig = breaks.map((b) => `${b.start}:${b.leaveDatesUsed.join('.')}`).join('|');
    if (signatures.has(sig)) continue;
    signatures.add(sig);
    plans.push(assemblePlan(strategy, breaks, input));
  }

  // Rank by score desc; deterministic tie-break by efficiency then id.
  plans.sort(
    (a, b) => b.score - a.score || b.efficiency - a.efficiency || a.id.localeCompare(b.id),
  );

  // Always return at least one plan — even with zero bookable leave — so
  // consumers never have to handle an empty result.
  if (plans.length === 0) {
    plans.push(
      assemblePlan(
        { key: 'none', label: 'No leave available to book', sort: () => 0 },
        base.breaks,
        input,
      ),
    );
  }

  const planCount = input.planCount ?? 5;
  const ranked = plans.slice(0, planCount).map((p, i) => ({ ...p, id: `plan-${i + 1}` }));

  return {
    input,
    availableLeave,
    bookableLeave,
    shutdownLeave,
    plans: ranked,
    generatedAt: new Date(0).toISOString(), // deterministic; overridden by callers if needed
  };
}
