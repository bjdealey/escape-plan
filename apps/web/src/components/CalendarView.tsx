import * as React from 'react';
import FullCalendar from '@fullcalendar/react';
import multiMonthPlugin from '@fullcalendar/multimonth';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePlanner } from '@/store/planner';
import { CALENDAR_LEGEND, buildCalendarEvents } from '@/lib/calendarEvents';

export function CalendarView() {
  const { input, result, selectedPlanId, colleagues } = usePlanner();
  const plan = result.plans.find((p) => p.id === selectedPlanId) ?? result.plans[0];

  const events = React.useMemo(
    () => buildCalendarEvents(input, plan, colleagues),
    [input, plan, colleagues],
  );

  return (
    <Card glass className="animate-fade-in">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Your {input.year} at a glance</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every layer — leave, holidays, colleagues, blackouts, weather &amp; budget.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Calendar legend">
          {CALENDAR_LEGEND.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                aria-hidden
                className="inline-block h-3 w-3 rounded-[4px] border border-border"
                style={{ background: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
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
          />
        </div>
      </CardContent>
    </Card>
  );
}
