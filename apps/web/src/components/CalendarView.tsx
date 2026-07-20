import * as React from 'react';
import FullCalendar from '@fullcalendar/react';
import multiMonthPlugin from '@fullcalendar/multimonth';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { CalendarPlus } from 'lucide-react';
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
        <div
          className="mb-4 flex flex-wrap gap-2"
          role="group"
          aria-label="Toggle calendar layers"
        >
          {CALENDAR_LEGEND.map((item) => {
            const off = hidden.has(item.layer);
            return (
              <button
                key={item.layer}
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(item.layer)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                  off
                    ? 'border-border bg-transparent text-muted-foreground line-through opacity-60'
                    : 'border-border bg-card text-foreground'
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-[4px] border border-border"
                  style={{ background: off ? 'transparent' : item.color }}
                />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="overflow-x-auto">
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
