import * as React from 'react';
import {
  ArrowLeft,
  BarChart3,
  Bot,
  CalendarDays,
  CalendarRange,
  Compass,
  ListChecks,
  Moon,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
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

// The three planning surfaces that live under one "Plan" tab as inner views.
const PLAN_VIEWS = ['dashboard', 'calendar', 'plans'] as const;
// Settings-like sections, reached from the header (gear / bell) rather than a tab.
const SETTINGS_VIEWS = ['preferences', 'alerts'] as const;
type View =
  | (typeof PLAN_VIEWS)[number]
  | (typeof SETTINGS_VIEWS)[number]
  | 'group'
  | 'assistant';

const isPlanView = (v: string): v is (typeof PLAN_VIEWS)[number] =>
  (PLAN_VIEWS as readonly string[]).includes(v);
const isSettingsView = (v: string): v is (typeof SETTINGS_VIEWS)[number] =>
  (SETTINGS_VIEWS as readonly string[]).includes(v);

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
  const [view, setView] = React.useState<View>(() => {
    try {
      return (localStorage.getItem(TAB_KEY) as View) ?? 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  // Remember the last plan sub-view so returning to the "Plan" tab reopens it.
  const [lastPlanView, setLastPlanView] = React.useState<(typeof PLAN_VIEWS)[number]>(() =>
    isPlanView(view) ? view : 'dashboard',
  );

  const [assistantSeed, setAssistantSeed] = React.useState<string | null>(null);

  // Persist the active view so a return visit reopens where the user left off,
  // and record views so section engagement can be measured. Deep-links from
  // notifications, the hero and the assistant nudge all funnel through here.
  const changeView = React.useCallback((v: string) => {
    const next = v as View;
    setView(next);
    if (isPlanView(next)) setLastPlanView(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      /* ignore */
    }
    track('tab_viewed', { tab: next });
  }, []);

  // Top-level tabs collapse the three planning surfaces into one "Plan" tab.
  const topTab = isPlanView(view) || isSettingsView(view) ? 'plan' : view;
  const onTopTabChange = React.useCallback(
    (t: string) => changeView(t === 'plan' ? lastPlanView : t),
    [changeView, lastPlanView],
  );

  // A dashboard nudge stages a question, then opens the Assistant to ask it.
  const askAssistant = React.useCallback(
    (q: string) => {
      setAssistantSeed(q);
      changeView('assistant');
    },
    [changeView],
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
            <NotificationCenter
              onNavigate={(t) => changeView(t)}
              onOpenSettings={() => changeView('alerts')}
            />
            <Button
              variant={view === 'preferences' ? 'default' : 'outline'}
              size="icon"
              onClick={() => changeView('preferences')}
              aria-label="Preferences"
            >
              <Settings className="h-4 w-4" />
            </Button>
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

        {isSettingsView(view) ? (
          <div className="animate-fade-in">
            <div className="mb-4 flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => changeView(lastPlanView)}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" /> Back to plan
              </Button>
              <span className="text-sm font-semibold">
                {view === 'preferences' ? 'Preferences' : 'Notification settings'}
              </span>
            </div>
            {view === 'preferences' ? <PreferencesPanel /> : <NotificationPreferences />}
          </div>
        ) : (
          <Tabs value={topTab} onValueChange={onTopTabChange}>
            <TabsList
              className="flex w-full flex-wrap justify-start gap-1"
              aria-label="Planner sections"
            >
              <TabsTrigger value="plan">
                <CalendarRange className="h-4 w-4" /> Plan
              </TabsTrigger>
              <TabsTrigger value="group">
                <Users className="h-4 w-4" /> Group
              </TabsTrigger>
              <TabsTrigger value="assistant">
                <Bot className="h-4 w-4" /> Assistant
              </TabsTrigger>
            </TabsList>

            <TabsContent value="plan">
              {/* Dashboard, Calendar and Plans are three views of one plan, so
                  they nest here as a sub-switcher instead of three top tabs. */}
              <Tabs
                value={isPlanView(view) ? view : 'dashboard'}
                onValueChange={changeView}
              >
                <TabsList aria-label="Plan views">
                  <TabsTrigger value="dashboard">
                    <BarChart3 className="h-4 w-4" /> Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="calendar">
                    <CalendarDays className="h-4 w-4" /> Calendar
                  </TabsTrigger>
                  <TabsTrigger value="plans">
                    <ListChecks className="h-4 w-4" /> Plans
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="dashboard">
                  <Dashboard onAsk={askAssistant} onNavigate={changeView} />
                </TabsContent>
                <TabsContent value="calendar">
                  <CalendarView />
                </TabsContent>
                <TabsContent value="plans">
                  <PlansView onNavigate={changeView} />
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="group">
              <GroupView />
            </TabsContent>
            <TabsContent value="assistant">
              <AiPlanner
                seedQuestion={assistantSeed}
                onSeedConsumed={() => setAssistantSeed(null)}
              />
            </TabsContent>
          </Tabs>
        )}

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
