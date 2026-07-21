import * as React from 'react';
import { BarChart3, BellRing, Bot, CalendarDays, Compass, ListChecks, Moon, Sliders, Sun, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dashboard } from '@/components/Dashboard';
import { CalendarView } from '@/components/CalendarView';
import { PlansView } from '@/components/PlansView';
import { PreferencesPanel } from '@/components/PreferencesPanel';
import { AiPlanner } from '@/components/AiPlanner';
import { GroupView } from '@/components/GroupView';
import { NotificationCenter } from '@/components/NotificationCenter';
import { NotificationPreferences } from '@/components/NotificationPreferences';
import { Onboarding } from '@/components/Onboarding';
import { usePlanner } from '@/store/planner';
import { useGroups } from '@/store/groups';
import { useTheme } from '@/store/theme';
import { track } from '@/lib/analytics';

const TAB_KEY = 'escape-plan-tab';

// The "Viewing as" switcher stands in for real IdP login and is dev-only — the
// x-user-id it maps to is ignored under a real auth provider / in production.
// Hidden by default in production builds; a public demo can opt back in with
// VITE_SHOW_USER_SWITCHER=true. (import.meta.env is untyped here — cast as in
// lib/analytics.ts.)
const SHOW_USER_SWITCHER = (() => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    return env?.DEV === true || env?.VITE_SHOW_USER_SWITCHER === 'true';
  } catch {
    return false;
  }
})();

export default function App() {
  const { onboarded, result, selectedPlanId } = usePlanner();
  const groups = useGroups();
  const { theme, toggle } = useTheme();
  const [tab, setTab] = React.useState<string>(() => {
    try {
      return localStorage.getItem(TAB_KEY) ?? 'dashboard';
    } catch {
      return 'dashboard';
    }
  });

  const [assistantSeed, setAssistantSeed] = React.useState<string | null>(null);

  // Persist the active tab so a return visit reopens where the user left off,
  // and record tab views so section engagement can be measured.
  const changeTab = React.useCallback((t: string) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
    track('tab_viewed', { tab: t });
  }, []);

  // A dashboard nudge stages a question, then opens the Assistant to ask it.
  const askAssistant = React.useCallback(
    (q: string) => {
      setAssistantSeed(q);
      changeTab('assistant');
    },
    [changeTab],
  );

  if (!onboarded) return <Onboarding />;

  const selected = result.plans.find((p) => p.id === selectedPlanId) ?? result.plans[0];

  return (
    <div className="app-gradient min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-primary/12 p-1.5 text-primary">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold leading-none tracking-tight">Escape Plan</p>
              <p className="text-xs text-muted-foreground">Smart annual-leave planner</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {SHOW_USER_SWITCHER ? (
              <div className="hidden items-center gap-2 sm:flex">
                <Label htmlFor="act-as" className="text-xs text-muted-foreground">
                  Viewing as
                </Label>
                <Select value={String(groups.currentUser.id)} onValueChange={(v) => groups.actAs(Number(v))}>
                  <SelectTrigger id="act-as" className="h-9 w-40" aria-label="Act as user (dev)">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.users.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <NotificationCenter onNavigate={(t) => changeTab(t)} />
            <Button
              variant="outline"
              size="icon"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main id="main" className="container py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">Your 2026 escape plan</h1>
          <p className="text-sm text-muted-foreground">
            Currently showing <span className="font-medium text-foreground">{selected.strategyLabel}</span>{' '}
            — {selected.totalDaysOff} days off from {selected.totalLeaveUsed} leave days (score{' '}
            {selected.score}).
          </p>
        </div>

        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList
            className="flex w-full flex-wrap justify-start gap-1"
            aria-label="Planner sections"
          >
            <TabsTrigger value="dashboard">
              <BarChart3 className="h-4 w-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="h-4 w-4" /> Calendar
            </TabsTrigger>
            <TabsTrigger value="plans">
              <ListChecks className="h-4 w-4" /> Plans
            </TabsTrigger>
            <TabsTrigger value="assistant">
              <Bot className="h-4 w-4" /> Assistant
            </TabsTrigger>
            <TabsTrigger value="group">
              <Users className="h-4 w-4" /> Group
            </TabsTrigger>
            <TabsTrigger value="alerts">
              <BellRing className="h-4 w-4" /> Alerts
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <Sliders className="h-4 w-4" /> Preferences
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard onAsk={askAssistant} onNavigate={changeTab} />
          </TabsContent>
          <TabsContent value="calendar">
            <CalendarView />
          </TabsContent>
          <TabsContent value="plans">
            <PlansView onNavigate={changeTab} />
          </TabsContent>
          <TabsContent value="assistant">
            <AiPlanner
              seedQuestion={assistantSeed}
              onSeedConsumed={() => setAssistantSeed(null)}
            />
          </TabsContent>
          <TabsContent value="group">
            <GroupView />
          </TabsContent>
          <TabsContent value="alerts">
            <NotificationPreferences />
          </TabsContent>
          <TabsContent value="preferences">
            <PreferencesPanel />
          </TabsContent>
        </Tabs>

        <footer className="mt-10 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            Deterministic optimisation engine · seeded demo data · no external accounts or live API
            calls. Integrations (weather, flights, currency, HR, calendars) are stubbed behind local
            interfaces.
          </p>
        </footer>
      </main>
    </div>
  );
}
