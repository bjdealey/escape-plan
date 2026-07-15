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
  CalendarDays,
  Gauge,
  PiggyBank,
  Plane,
  Sun,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/StatCard';
import { usePlanner } from '@/store/planner';
import { useThemeColors } from '@/lib/useThemeColors';
import { countdown, daysOffByMonth, monthlyBudget } from '@/lib/metrics';
import { formatCurrency, formatDateShort } from '@/lib/utils';

const TODAY = '2026-07-15';

export function Dashboard() {
  const { input, result, selectedPlanId } = usePlanner();
  const colors = useThemeColors();
  const plan = result.plans.find((p) => p.id === selectedPlanId) ?? result.plans[0];

  const budgetSeries = React.useMemo(() => monthlyBudget(input, plan), [input, plan]);
  const offSeries = React.useMemo(() => daysOffByMonth(plan), [plan]);
  const cd = React.useMemo(() => countdown(plan, TODAY), [plan]);

  const used = plan.totalLeaveUsed;
  const reserve = input.leave.reserveDays;
  const unused = Math.max(0, result.bookableLeave - used);
  const currency = input.budget.currency;
  const budgetRemaining = input.budget.holidayFund - plan.totalEstimatedCost;

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
