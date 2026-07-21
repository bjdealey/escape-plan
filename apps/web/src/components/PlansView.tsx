import * as React from 'react';
import { Check, ChevronDown, Info, MapPin, Sparkles } from 'lucide-react';
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
import type { ApprovalOutlook, Break, ISODate, Plan } from '@escape-plan/engine';

/** Capacity-grounded approval outlook for a date range. */
type ApprovalFor = (start: ISODate, end: ISODate) => ApprovalOutlook;

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
    ? (start, end) => g.approvalOutlook(teamId, start, end)
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

  // The score breakdown and trade-offs are reassurance for skeptics, not the
  // decision itself — collapse them so the ranked list stays scannable
  // (progressive disclosure) and each card leads with its four headline metrics.
  const [showReasoning, setShowReasoning] = React.useState(false);

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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                setShowReasoning((v) => {
                  if (!v) track('plan_reasoning_expanded', { planId: plan.id, rank });
                  return !v;
                })
              }
              aria-expanded={showReasoning}
              className="flex items-center gap-1.5 text-sm font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showReasoning ? 'rotate-180' : ''}`}
              />
              Why this scored well
            </button>
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

          {showReasoning ? (
            <div className="mt-3 space-y-4">
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
            </div>
          ) : null}
        </div>

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
                <ApprovalHint outlook={approvalFor(b.start, b.end)} teamName={teamName} />
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
 * A compact, honest indicator of whether this break is likely to clear the
 * user's team — a qualitative capacity signal derived from real colleague
 * overlap and the team's limit, deliberately NOT a manufactured probability.
 * The concrete basis is exposed in the accessible label.
 */
function ApprovalHint({ outlook, teamName }: { outlook: ApprovalOutlook; teamName?: string }) {
  const tone =
    outlook.level === 'clear' || outlook.level === 'open'
      ? 'text-success'
      : outlook.level === 'limited'
        ? 'text-warning'
        : 'text-destructive';
  const where = teamName ? `${teamName}'s` : 'your team’s';
  const label = `${outlook.label}: ${outlook.detail} Based on ${where} real leave overlap and team capacity — not a probability.`;
  return (
    <span className={`font-medium ${tone}`} title={label} aria-label={label}>
      · {outlook.label}
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
