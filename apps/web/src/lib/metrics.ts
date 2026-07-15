import { type EngineInput, type Plan, monthOf } from '@escape-plan/engine';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export interface MonthlyBudgetPoint {
  month: string;
  saved: number;
  spent: number;
  balance: number;
}

/** Month-by-month affordability across the year for a plan. */
export function monthlyBudget(input: EngineInput, plan: Plan): MonthlyBudgetPoint[] {
  const spendByMonth = new Array(12).fill(0);
  for (const b of plan.breaks) spendByMonth[monthOf(b.start) - 1] += b.estimatedCost;

  const points: MonthlyBudgetPoint[] = [];
  let cumulativeSpent = 0;
  for (let i = 0; i < 12; i++) {
    const saved = input.budget.holidayFund + input.budget.monthlySavings * i;
    cumulativeSpent += spendByMonth[i];
    points.push({
      month: MONTH_LABELS[i],
      saved: Math.round(saved),
      spent: Math.round(cumulativeSpent),
      balance: Math.round(saved - cumulativeSpent),
    });
  }
  return points;
}

export interface DaysOffPoint {
  month: string;
  daysOff: number;
  leave: number;
}

export function daysOffByMonth(plan: Plan): DaysOffPoint[] {
  const off = new Array(12).fill(0);
  const leave = new Array(12).fill(0);
  for (const b of plan.breaks) {
    off[monthOf(b.start) - 1] += b.totalDaysOff;
    leave[monthOf(b.start) - 1] += b.leaveDaysUsed;
  }
  return MONTH_LABELS.map((m, i) => ({ month: m, daysOff: off[i], leave: leave[i] }));
}

export interface Countdown {
  days: number | null;
  next?: Plan['breaks'][number];
}

/** Days until the next break that starts after `today` (ISO). */
export function countdown(plan: Plan, today: string): Countdown {
  const upcoming = plan.breaks
    .filter((b) => b.start > today)
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  if (upcoming.length === 0) return { days: null };
  const next = upcoming[0];
  const ms = Date.parse(next.start) - Date.parse(today);
  return { days: Math.max(0, Math.round(ms / 86_400_000)), next };
}
