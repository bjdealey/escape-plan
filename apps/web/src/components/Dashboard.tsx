import * as React from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  CalendarDays,
  Gauge,
  PiggyBank,
  Plane,
  Sun,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bot } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { usePlanner } from '@/store/planner';
import { useThemeColors } from '@/lib/useThemeColors';
import { countdown, daysOffByMonth, monthlyBudget, todayISO } from '@/lib/metrics';
import { SUGGESTED_QUESTIONS } from '@/lib/assistant';
import { track } from '@/lib/analytics';
import { formatCurrency, formatDateShort } from '@/lib/utils';

// A couple of genuinely useful, engine-answerable prompts to surface as a nudge.
const NUDGE_QUESTIONS = [
  SUGGESTED_QUESTIONS.find((s) => /extra leave/i.test(s.q))?.q ?? SUGGESTED_QUESTIONS[0].q,
  SUGGESTED_QUESTIONS.find((s) => /cheaper/i.test(s.q))?.q ?? SUGGESTED_QUESTIONS[1].q,
];

export function Dashboard({
  onAsk,
  onNavigate,
}: { onAsk?: (q: string) => void; onNavigate?: (tab: string) => void } = {}) {
  const { input, result, selectedPlanId } = usePlanner();
  const colors = useThemeColors();
  const plan = result.plans.find((p) => p.id === selectedPlanId) ?? result.plans[0];

  const today = todayISO();
  const budgetSeries = React.useMemo(() => monthlyBudget(input, plan), [input, plan]);
  const offSeries = React.useMemo(() => daysOffByMonth(plan), [plan]);
  const cd = React.useMemo(() => countdown(plan, today), [plan, today]);

  const used = plan.totalLeaveUsed;
  const reserve = input.leave.reserveDays;
  const unused = Math.max(0, result.bookableLeave - used);
  const currency = input.budget.currency;
  const budgetRemaining = input.budget.holidayFund - plan.totalEstimatedCost;

  // Savings-progress + efficiency readouts.
  const totalCost = plan.totalEstimatedCost;
  const fund = input.budget.holidayFund;
  const yearEndFund = fund + input.budget.monthlySavings * 12;
  const fundCoverage = totalCost > 0 ? Math.min(100, Math.round((fund / totalCost) * 100)) : 100;
  const yearEndCoverage =
    totalCost > 0 ? Math.min(100, Math.round((yearEndFund / totalCost) * 100)) : 100;
  // Normalise efficiency against a 4× "excellent" reference for the bar.
  const effPct = Math.min(100, Math.round((plan.efficiency / 4) * 100));

  const leaveData = [
    { name: 'Leave spent', value: used, color: colors.primary },
    { name: 'Unused bookable', value: unused, color: colors.accent },
    { name: 'Emergency reserve', value: reserve, color: colors['muted-foreground'] },
  ].filter((d) => d.value > 0);

  const warmest = plan.breaks
    .map((b) => b.suggestion)
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => b.weather.avgTempC - a.weather.avgTempC)[0];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero — the plan's headline outcome, elevated from the grey subtitle so
          the "aha" (many days off from few leave days) is the first thing a
          returning user sees, with a direct route to act on it. */}
      <Card glass className="border-primary/30 bg-primary/[0.06]">
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Your plan</Badge>
              <span className="text-sm font-medium text-muted-foreground">
                {plan.strategyLabel}
              </span>
            </div>
            <h2 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              <span className="text-primary">{plan.totalDaysOff} days off</span> from just{' '}
              {plan.totalLeaveUsed} leave {plan.totalLeaveUsed === 1 ? 'day' : 'days'}
            </h2>
            <p className="text-sm text-muted-foreground">
              That&rsquo;s {plan.efficiency.toFixed(2)}× per leave day · longest break{' '}
              {plan.longestBreak} days
              {cd.days !== null && cd.next ? ` · next escape in ${cd.days} days` : ''}.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:items-end">
            <Button
              onClick={() => {
                track('hero_view_plan_clicked', { planId: plan.id });
                onNavigate?.('plans');
              }}
              className="gap-1.5"
            >
              View &amp; request breaks <ArrowRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">
              {plan.tripCount} {plan.tripCount === 1 ? 'trip' : 'trips'} ·{' '}
              {formatCurrency(plan.totalEstimatedCost, currency)} est. spend
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Remaining leave"
          value={`${result.bookableLeave - used} days`}
          sub={`${result.availableLeave} available · ${reserve} reserved`}
          icon={<CalendarDays />}
        />
        <StatCard
          label="Days off achieved"
          value={plan.totalDaysOff}
          sub={`from ${plan.totalLeaveUsed} leave days`}
          icon={<Sun />}
        />
        <StatCard
          label="Leave efficiency"
          value={`${plan.efficiency.toFixed(2)}×`}
          sub="days off per leave day"
          icon={<Gauge />}
        />
        <StatCard
          label="Longest break"
          value={`${plan.longestBreak} days`}
          sub={`${plan.tripCount} trips planned`}
          icon={<TrendingUp />}
        />
        <StatCard
          label="Budget remaining"
          value={formatCurrency(budgetRemaining, currency)}
          sub={`of ${formatCurrency(input.budget.holidayFund, currency)} fund`}
          icon={<PiggyBank />}
        />
        <StatCard
          label="Next escape"
          value={cd.days === null ? '—' : `${cd.days} days`}
          sub={cd.next ? `${formatDateShort(cd.next.start)} · ${cd.next.totalDaysOff} days off` : 'No upcoming break'}
          icon={<Timer />}
        />
        <StatCard
          label="Trips planned"
          value={plan.tripCount}
          sub={`${plan.breaks.filter((b) => b.suggestion).length} with a destination`}
          icon={<Plane />}
        />
        <StatCard
          label="Warmest trip"
          value={warmest ? `${Math.round(warmest.weather.avgTempC)}°C` : '—'}
          sub={warmest ? `${warmest.destinationName} · ${warmest.weather.label}` : 'Staycations only'}
          icon={<Sun />}
        />
      </div>

      {onAsk ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-primary/5 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Bot className="h-4 w-4 text-primary" aria-hidden />
            Curious? Ask the assistant:
          </span>
          {NUDGE_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                track('assistant_nudge_clicked', { question: q });
                onAsk(q);
              }}
              className="rounded-full border border-primary/30 bg-card px-3 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card glass>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leave efficiency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold tracking-tight text-primary">
                {plan.efficiency.toFixed(2)}×
              </span>
              <span className="text-xs text-muted-foreground">
                {plan.totalDaysOff} days off ÷ {plan.totalLeaveUsed} leave
              </span>
            </div>
            <Progress value={effPct} className="mt-3" aria-label="Leave efficiency" />
            <p className="mt-2 text-xs text-muted-foreground">
              {plan.efficiency >= 3
                ? 'Excellent — bank holidays are doing the heavy lifting.'
                : plan.efficiency >= 2
                  ? 'Good use of weekends and holidays.'
                  : 'Raise “Spend the least leave” to stretch each day further.'}
            </p>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Savings progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-bold tracking-tight">
                {formatCurrency(fund, currency)}
              </span>
              <span className="text-xs text-muted-foreground">
                fund vs {formatCurrency(totalCost, currency)} planned
              </span>
            </div>
            <Progress
              value={fundCoverage}
              className="mt-3"
              indicatorClassName="bg-success"
              aria-label="Fund coverage of planned spend"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {fundCoverage >= 100
                ? 'Your fund already covers every planned trip.'
                : `Fund covers ${fundCoverage}% now · ${yearEndCoverage}% by year-end with ${formatCurrency(input.budget.monthlySavings, currency)}/mo.`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Leave allocation</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={leaveData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {leaveData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <RTooltip
                  contentStyle={tooltipStyle(colors)}
                  formatter={(v: number, n: string) => [`${v} days`, n]}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: colors.foreground }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card glass className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Budget affordability across {input.year}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={budgetSeries} margin={{ left: -18, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="savedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.success} stopOpacity={0.5} />
                    <stop offset="100%" stopColor={colors.success} stopOpacity={0.05} />
                  </linearGradient>
                  <linearGradient id="spentFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.primary} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={colors.primary} stopOpacity={0.04} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke={colors['muted-foreground']} fontSize={11} />
                <YAxis stroke={colors['muted-foreground']} fontSize={11} width={54} />
                <RTooltip
                  contentStyle={tooltipStyle(colors)}
                  formatter={(v: number, n: string) => [formatCurrency(v, currency), n]}
                />
                <Area
                  type="monotone"
                  dataKey="saved"
                  name="Saved"
                  stroke={colors.success}
                  fill="url(#savedFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="spent"
                  name="Spent"
                  stroke={colors.primary}
                  fill="url(#spentFill)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card glass>
        <CardHeader>
          <CardTitle className="text-base">Days off &amp; leave spent by month</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={offSeries} margin={{ left: -18, right: 8, top: 4 }}>
              <XAxis dataKey="month" stroke={colors['muted-foreground']} fontSize={11} />
              <YAxis stroke={colors['muted-foreground']} fontSize={11} width={30} allowDecimals={false} />
              <RTooltip contentStyle={tooltipStyle(colors)} cursor={{ fill: colors.border, opacity: 0.3 }} />
              <Legend wrapperStyle={{ fontSize: 12, color: colors.foreground }} />
              <Bar dataKey="daysOff" name="Days off" fill={colors.primary} radius={[4, 4, 0, 0]} />
              <Bar dataKey="leave" name="Leave used" fill={colors.accent} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

function tooltipStyle(colors: Record<string, string>): React.CSSProperties {
  return {
    background: 'hsl(var(--popover))',
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    color: 'hsl(var(--popover-foreground))',
    fontSize: 12,
  };
}
