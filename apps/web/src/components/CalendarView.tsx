import * as React from 'react';
import FullCalendar from '@fullcalendar/react';
import multiMonthPlugin from '@fullcalendar/multimonth';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import {
  CalendarPlus,
  RotateCcw,
  Plane,
  Landmark,
  Star,
  Users,
  Ban,
  Moon,
  GraduationCap,
  CalendarRange,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlanner } from '@/store/planner';
import { track } from '@/lib/analytics';
import { downloadPlanIcs } from '@/lib/icsExport';
import {
  CALENDAR_LEGEND,
  type CalendarLayer,
  buildCalendarEvents,
} from '@/lib/calendarEvents';

/** Icon per calendar layer — a colour-independent cue for each legend chip. */
const LAYER_ICON: Record<CalendarLayer, LucideIcon> = {
  leave: Plane,
  holiday: Landmark,
  personal: Star,
  colleague: Users,
  blackout: Ban,
  shutdown: Moon,
  school: GraduationCap,
};

interface Summary {
  label: string;
  value: React.ReactNode;
  icon: LucideIcon;
}

export function CalendarView() {
  const { input, result, selectedPlanId, colleagues } = usePlanner();
  const plan = result.plans.find((p) => p.id === selectedPlanId) ?? result.plans[0];
  const [hidden, setHidden] = React.useState<Set<CalendarLayer>>(new Set());

  const exportPlan = () => {
    const ok = downloadPlanIcs(plan);
    track('plan_exported', {
      planId: plan.id,
      breakCount: plan.breaks.length,
      format: 'ics',
      ok,
    });
  };

  const allEvents = React.useMemo(
    () => buildCalendarEvents(input, plan, colleagues),
    [input, plan, colleagues],
  );

  const events = React.useMemo(
    () =>
      allEvents.filter(
        (e) => !hidden.has((e.extendedProps as { layer: CalendarLayer }).layer),
      ),
    [allEvents, hidden],
  );

  const toggle = (layer: CalendarLayer) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });

  const summary: Summary[] = plan
    ? [
        { label: 'Days off', value: plan.totalDaysOff, icon: CalendarRange },
        { label: 'Leave used', value: plan.totalLeaveUsed, icon: Plane },
        { label: 'Breaks', value: plan.breaks.length, icon: Sparkles },
        { label: 'Longest run', value: `${plan.longestBreak} days`, icon: TrendingUp },
      ]
    : [];

  // Announce filter changes to assistive tech.
  const shownCount = CALENDAR_LEGEND.length - hidden.size;
  const liveMessage =
    hidden.size === 0
      ? 'Showing all calendar layers.'
      : `Showing ${shownCount} of ${CALENDAR_LEGEND.length} calendar layers.`;

  return (
    <Card glass className="animate-fade-in">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Your {input.year} at a glance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Toggle any layer — leave, holidays, colleagues, blackouts, weather &amp; budget.
          </p>
        </div>
        <Button variant="outline" className="shrink-0 gap-2" onClick={exportPlan}>
          <CalendarPlus className="h-4 w-4" />
          Add to calendar
        </Button>
      </CardHeader>
      <CardContent>
        {summary.length > 0 && (
          <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.map((s) => (
              <div
                key={s.label}
                className="flex items-center gap-3 rounded-xl border border-border/70 bg-card/60 p-3"
              >
                <div className="rounded-lg bg-primary/12 p-2 text-primary" aria-hidden>
                  <s.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-muted-foreground">{s.label}</dt>
                  <dd className="text-lg font-bold leading-tight tracking-tight">{s.value}</dd>
                </div>
              </div>
            ))}
          </dl>
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Toggle calendar layers"
          >
            {CALENDAR_LEGEND.map((item) => {
              const off = hidden.has(item.layer);
              const Icon = LAYER_ICON[item.layer];
              return (
                <button
                  key={item.layer}
                  type="button"
                  aria-pressed={!off}
                  onClick={() => toggle(item.layer)}
                  title={off ? `Show ${item.label}` : `Hide ${item.label}`}
                  className={`group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    off
                      ? 'border-dashed border-border bg-transparent text-muted-foreground opacity-70 hover:opacity-100'
                      : 'border-transparent bg-card text-foreground shadow-sm hover:shadow'
                  }`}
                >
                  <Icon
                    aria-hidden
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: off ? 'hsl(var(--muted-foreground))' : item.color }}
                  />
                  <span className={off ? 'line-through' : ''}>{item.label}</span>
                </button>
              );
            })}
          </div>
          {hidden.size > 0 && (
            <button
              type="button"
              onClick={() => setHidden(new Set())}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Show all
            </button>
          )}
        </div>

        <p className="sr-only" role="status" aria-live="polite">
          {liveMessage}
        </p>

        <div className="overflow-x-auto rounded-xl">
          <FullCalendar
            plugins={[multiMonthPlugin, dayGridPlugin, interactionPlugin]}
            initialView="multiMonthYear"
            initialDate={`${input.year}-01-01`}
            headerToolbar={{ left: 'title', center: '', right: 'multiMonthYear,dayGridMonth' }}
            buttonText={{ multiMonthYear: 'Year', dayGridMonth: 'Month' }}
            multiMonthMaxColumns={3}
            weekends
            firstDay={1}
            height="auto"
            fixedWeekCount={false}
            events={events}
            eventDisplay="block"
            displayEventTime={false}
            dayMaxEvents={3}
            eventDidMount={(info) => {
              // Native hover tooltip with the full event detail.
              info.el.setAttribute('title', info.event.title);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
