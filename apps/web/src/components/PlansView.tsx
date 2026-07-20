import * as React from 'react';
import { Check, Info, MapPin, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PURPOSE_LABELS } from '@escape-plan/engine';
import { usePlanner } from '@/store/planner';
import { useGroups } from '@/store/groups';
import { track } from '@/lib/analytics';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import type { Break, ISODate, Plan } from '@escape-plan/engine';

/** Likelihood of leave being approved for a date range, or `null` if N/A. */
type ApprovalFor = (start: ISODate, end: ISODate) => number;

export function PlansView({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { result, selectedPlanId, setSelectedPlanId, input } = usePlanner();
  const g = useGroups();

  // Approval likelihood only means something where leave needs approving: a
  // *team* the user belongs to (households auto-approve). Prefer the currently
  // selected group if it's a team, else their first team; otherwise show none.
  const teamId = React.useMemo(() => {
    const selected = g.myGroups.find(
      (x) => x.group.id === g.selectedGroupId && x.group.type === 'team',
    );
    return (selected ?? g.myGroups.find((x) => x.group.type === 'team'))?.group.id ?? null;
  }, [g.myGroups, g.selectedGroupId]);

  const teamName = teamId ? g.groups.find((x) => x.id === teamId)?.name : undefined;
  const approvalFor: ApprovalFor | undefined = teamId
    ? (start, end) => g.approvalLikelihood(teamId, start, end)
    : undefined;

  // One-click: stage a break's dates into the team's approval form and jump
  // there, so the user never re-types dates the plan already knows.
  const requestBreak = teamId
    ? (b: Break) => {
        g.selectGroup(teamId);
        g.setRequestDraft({ start: b.start, end: b.end });
        track('leave_request_prefilled', { start: b.start, end: b.end, groupId: teamId });
        onNavigate?.('group');
      }
    : undefined;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>
          {result.plans.length} plans ranked by a transparent score. Every plan honours your{' '}
          {input.leave.reserveDays}-day emergency reserve and per-trip budget cap.
        </span>
      </div>
      {result.plans.map((plan, i) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          rank={i + 1}
          currency={input.budget.currency}
          selected={plan.id === selectedPlanId}
          approvalFor={approvalFor}
          teamName={teamName}
          onRequestBreak={requestBreak}
          onSelect={() => {
            track('plan_selected', { planId: plan.id, rank: i + 1, score: plan.score });
            setSelectedPlanId(plan.id);
          }}
        />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  rank,
  currency,
  selected,
  approvalFor,
  teamName,
  onRequestBreak,
  onSelect,
}: {
  plan: Plan;
  rank: number;
  currency: string;
  selected: boolean;
  approvalFor?: ApprovalFor;
  teamName?: string;
  onRequestBreak?: (b: Break) => void;
  onSelect: () => void;
}) {
  const topCriteria = [...plan.scoreBreakdown]
    .filter((b) => b.weight > 0)
    .sort((a, b) => b.contribution - a.contribution);

  return (
    <Card
      glass
      className={selected ? 'ring-2 ring-primary transition-shadow' : 'transition-shadow'}
    >
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={rank === 1 ? 'default' : 'secondary'}>#{rank}</Badge>
            <CardTitle className="text-lg">{plan.strategyLabel}</CardTitle>
            {selected ? (
              <Badge variant="success" className="gap-1">
                <Check className="h-3 w-3" /> Selected
              </Badge>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{plan.explanation}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-3xl font-bold tracking-tight text-primary">{plan.score}</div>
          <div className="text-xs text-muted-foreground">score / 100</div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Days off" value={String(plan.totalDaysOff)} />
          <Metric label="Leave used" value={String(plan.totalLeaveUsed)} />
          <Metric label="Efficiency" value={`${plan.efficiency.toFixed(2)}×`} />
          <Metric label="Est. spend" value={formatCurrency(plan.totalEstimatedCost, currency)} />
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            Why this scored well
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="How the score is computed">
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  Score = weighted average of each criterion (0–1) using your priority weights,
                  scaled to 100.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <ul className="space-y-2">
            {topCriteria.slice(0, 4).map((c) => (
              <li key={c.criterion} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="truncate text-muted-foreground">{c.criterion}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(c.score * 100)}% · w{c.weight}
                    </span>
                  </div>
                  <Progress value={c.score * 100} />
                </div>
              </li>
            ))}
          </ul>
        </div>

        {plan.tradeoffs.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Trade-offs
            </p>
            <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
              {plan.tradeoffs.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {plan.breaks.map((b) => (
            <div
              key={b.start}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs"
            >
              <MapPin className="h-3 w-3 text-primary" />
              <span className="font-medium">
                {formatDateShort(b.start)}–{formatDateShort(b.end)}
              </span>
              <span className="text-muted-foreground">
                {b.totalDaysOff}d · {b.leaveDaysUsed} leave
                {b.anchorLabel
                  ? ` · ${b.anchorLabel} (${PURPOSE_LABELS[b.purpose ?? 'event']})`
                  : b.suggestion
                    ? ` · ${b.suggestion.destinationName} (${b.suggestion.tripType.replace('-', ' ')})`
                    : b.homeWeather
                      ? ` · staycation · ${Math.round(b.homeWeather.avgTempC)}°C home`
                      : ' · staycation'}
              </span>
              {approvalFor && b.leaveDaysUsed > 0 ? (
                <ApprovalHint
                  likelihood={approvalFor(b.start, b.end)}
                  teamName={teamName}
                />
              ) : null}
              {selected && onRequestBreak && b.leaveDaysUsed > 0 ? (
                <button
                  type="button"
                  onClick={() => onRequestBreak(b)}
                  title={`Request ${formatDateShort(b.start)}–${formatDateShort(b.end)} off from ${teamName ?? 'your team'}`}
                  className="ml-0.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                >
                  Request
                </button>
              ) : null}
            </div>
          ))}
        </div>

        <Button
          onClick={onSelect}
          variant={selected ? 'secondary' : 'default'}
          className="w-full sm:w-auto"
        >
          {selected ? 'Selected — shown on calendar & dashboard' : 'Use this plan'}
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * A compact, honest indicator of how likely this break is to be approved by the
 * user's team — derived from real colleague overlap and the team's capacity, not
 * a manufactured number. Renders the provenance in the accessible label so the
 * figure is never presented as pressure.
 */
function ApprovalHint({ likelihood, teamName }: { likelihood: number; teamName?: string }) {
  const pct = Math.round(likelihood * 100);
  const tone =
    likelihood >= 0.75 ? 'text-success' : likelihood >= 0.5 ? 'text-warning' : 'text-destructive';
  const where = teamName ? `${teamName}'s` : 'your team’s';
  const label = `${pct}% likely to be approved, based on ${where} real leave overlap and capacity`;
  return (
    <span className={`font-medium ${tone}`} title={label} aria-label={label}>
      · {pct}% approval
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
