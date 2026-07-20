import * as React from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, Compass, MapPin, Plane } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlanner } from '@/store/planner';
import { track } from '@/lib/analytics';
import {
  HOME_CLIMATES,
  SUPPORTED_CURRENCIES,
  homeProfileForCountry,
  type Season,
  type TripType,
} from '@escape-plan/engine';

const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const TRIP_TYPES: TripType[] = ['beach', 'city-break', 'adventure', 'skiing', 'walking', 'luxury'];
const STEPS = ['Leave', 'Preferences', 'Location & budget', 'Priorities'];
const HOME_COUNTRIES = Object.values(HOME_CLIMATES).map((p) => ({ code: p.countryCode, label: p.label }));

export function Onboarding() {
  const {
    input,
    result,
    detectedLocation,
    homeCountry,
    setHomeCountry,
    updateLeave,
    updateBudget,
    updatePreferences,
    updateWeights,
    toggleTripType,
    setOnboarded,
  } = usePlanner();
  const [step, setStep] = React.useState(0);
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const { leave, budget, preferences } = input;

  const detectionSource =
    detectedLocation.source === 'timezone'
      ? "your device’s time zone"
      : detectedLocation.source === 'language'
        ? "your device’s language"
        : 'a default (we couldn’t tell)';

  const toggleSeason = (s: Season) => {
    const has = preferences.preferredSeasons.includes(s);
    updatePreferences({
      preferredSeasons: has
        ? preferences.preferredSeasons.filter((x) => x !== s)
        : [...preferences.preferredSeasons, s],
    });
  };

  const next = () => {
    track('onboarding_step_completed', { step, label: STEPS[step] });
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };
  const prev = () => setStep((s) => Math.max(0, s - 1));

  const finish = (via: 'finish' | 'skip') => {
    track('onboarding_completed', { via, step });
    setOnboarded(true);
  };

  return (
    <div className="app-gradient flex min-h-screen items-center justify-center p-4">
      <Card glass className="w-full max-w-xl animate-scale-in">
        <CardHeader>
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Compass className="h-6 w-6" />
            <span className="text-lg font-bold tracking-tight text-foreground">Escape Plan</span>
          </div>
          <CardTitle className="text-xl">Let’s build your {input.year} plan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Four quick steps — under two minutes. Everything is pre-filled with a sensible demo you
            can tweak later.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Progress value={((step + 1) / STEPS.length) * 100} className="flex-1" />
            <span className="text-xs font-medium text-muted-foreground">
              Step {step + 1} / {STEPS.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 0 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Total allowance (days)">
                  <Input
                    type="number"
                    value={leave.allowance}
                    min={0}
                    max={60}
                    onChange={(e) => updateLeave({ allowance: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Days remaining">
                  <Input
                    type="number"
                    value={leave.remaining}
                    min={0}
                    max={60}
                    onChange={(e) => updateLeave({ remaining: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                  aria-controls="advanced-leave"
                  className="flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                  Advanced — emergency reserve &amp; carry-over
                </button>

                {showAdvanced ? (
                  <div id="advanced-leave" className="mt-3 grid grid-cols-2 gap-4">
                    <Field label="Reserve for emergencies">
                      <Input
                        type="number"
                        value={leave.reserveDays}
                        min={0}
                        max={leave.remaining}
                        onChange={(e) => updateLeave({ reserveDays: Number(e.target.value) })}
                      />
                    </Field>
                    <Field label="Carry-over days">
                      <Input
                        type="number"
                        value={leave.carryOver}
                        min={0}
                        max={30}
                        onChange={(e) => updateLeave({ carryOver: Number(e.target.value) })}
                      />
                    </Field>
                  </div>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Keeping {leave.reserveDays} day{leave.reserveDays === 1 ? '' : 's'} in reserve and{' '}
                    {leave.carryOver} carried over — expand to change.
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {homeProfileForCountry(homeCountry).label} 2026 public holidays and a December
                company shutdown are already loaded — set your country in step 3.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Preferred seasons</legend>
                <div className="flex flex-wrap gap-2">
                  {SEASONS.map((s) => {
                    const active = preferences.preferredSeasons.includes(s);
                    return (
                      <Chip key={s} active={active} onClick={() => toggleSeason(s)}>
                        {s}
                      </Chip>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">What kind of trips?</legend>
                <div className="flex flex-wrap gap-2">
                  {TRIP_TYPES.map((t) => (
                    <Chip
                      key={t}
                      active={preferences.tripTypes.includes(t)}
                      onClick={() => toggleTripType(t)}
                    >
                      {t.replace('-', ' ')}
                    </Chip>
                  ))}
                </div>
              </fieldset>
              <div>
                <div className="mb-2 flex justify-between">
                  <Label>Ideal trip length</Label>
                  <span className="text-sm font-semibold text-primary">
                    {preferences.preferredTripLength} days
                  </span>
                </div>
                <Slider
                  value={[preferences.preferredTripLength]}
                  min={2}
                  max={21}
                  step={1}
                  onValueChange={([v]) => updatePreferences({ preferredTripLength: v })}
                  aria-label="Ideal trip length"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p className="text-sm font-medium text-foreground">Where are you based?</p>
                    <p>
                      We’ve guessed{' '}
                      <span className="font-medium text-foreground">
                        {homeProfileForCountry(homeCountry).label}
                      </span>{' '}
                      from {detectionSource} — no GPS, no IP lookup, and nothing leaves your device.
                      Please confirm or change it below.
                    </p>
                    <p>
                      This sets your <span className="font-medium text-foreground">currency</span>, your
                      local <span className="font-medium text-foreground">staycation weather</span>, and
                      your <span className="font-medium text-foreground">bank-holiday</span> country.
                      School-holiday dates are UK-only for now.
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Home country">
                  <Select value={homeCountry} onValueChange={(v) => setHomeCountry(v)}>
                    <SelectTrigger aria-label="Home country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOME_COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Currency">
                  <Select value={budget.currency} onValueChange={(v) => updateBudget({ currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Holiday fund">
                  <Input
                    type="number"
                    value={budget.holidayFund}
                    min={0}
                    step={100}
                    onChange={(e) => updateBudget({ holidayFund: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Max per-trip budget">
                  <Input
                    type="number"
                    value={budget.maxTripBudget}
                    min={0}
                    step={50}
                    onChange={(e) => updateBudget({ maxTripBudget: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Monthly savings">
                  <Input
                    type="number"
                    value={budget.monthlySavings}
                    min={0}
                    step={25}
                    onChange={(e) => updateBudget({ monthlySavings: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground">
                Slide what matters most. You’ll get {result.plans.length} ranked plans immediately —
                fine-tune any time on the Preferences tab.
              </p>
              {(
                [
                  ['maximiseConsecutive', 'Longer breaks'],
                  ['minimiseLeave', 'Spend less leave'],
                  ['warmWeather', 'Warm weather'],
                  ['budget', 'Stay on budget'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <div className="mb-2 flex justify-between">
                    <Label>{label}</Label>
                    <span className="text-sm font-semibold text-primary">
                      {preferences.weights[key]}
                    </span>
                  </div>
                  <Slider
                    value={[preferences.weights[key]]}
                    min={0}
                    max={5}
                    step={1}
                    onValueChange={([v]) => updateWeights({ [key]: v })}
                    aria-label={label}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={prev} disabled={step === 0} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={next} className="gap-1.5">
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={() => finish('finish')} className="gap-1.5">
                <Plane className="h-4 w-4" /> Generate my plans
              </Button>
            )}
          </div>

          {step < STEPS.length - 1 && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => finish('skip')}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Skip setup — explore the seeded demo
              </button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactElement }) {
  // Associate the label with its control for screen readers and keyboard users.
  const id = React.useId();
  return (
    <div>
      <Label htmlFor={id} className="mb-2 block">
        {label}
      </Label>
      {React.cloneElement(children, { id } as Record<string, unknown>)}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-card text-foreground hover:bg-secondary'
      }`}
    >
      {active ? <Check className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}
