import * as React from 'react';
import { Building2, CalendarHeart, ChevronDown, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePlanner } from '@/store/planner';
import { track } from '@/lib/analytics';
import { PRIORITY_PRESETS, matchPreset } from '@/lib/priorityPresets';
import {
  OCCASION_KINDS,
  OCCASION_LABELS,
  SUPPORTED_CURRENCIES,
  availableLeaveDays,
  type OccasionKind,
  type PersonalDate,
  type Season,
  type Shutdown,
  type TripType,
  type Weights,
} from '@escape-plan/engine';

const WEIGHT_LABELS: { key: keyof Weights; label: string; hint: string }[] = [
  { key: 'maximiseConsecutive', label: 'Maximise consecutive days off', hint: 'Longer single breaks' },
  { key: 'minimiseLeave', label: 'Spend the least leave', hint: 'Squeeze value from bank holidays' },
  { key: 'warmWeather', label: 'Warm weather', hint: 'Favour sunny destinations' },
  { key: 'budget', label: 'Stay within budget', hint: 'Keep spend low' },
  { key: 'spreadEvenly', label: 'Spread across the year', hint: 'Breaks in every quarter' },
  { key: 'preferenceMatch', label: 'Match my preferences', hint: 'Seasons, months, trip length' },
  { key: 'longWeekends', label: 'Prefer long weekends', hint: 'Frequent 3–4 day escapes' },
];

const TRIP_TYPES: TripType[] = [
  'beach', 'city-break', 'road-trip', 'adventure', 'luxury', 'camping', 'skiing', 'walking', 'cruise',
];
const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const CURRENCIES = SUPPORTED_CURRENCIES;

export function PreferencesPanel() {
  const { input, updateWeights, updateLeave, updateBudget, updatePreferences, toggleTripType, setCurrency, reset } =
    usePlanner();
  const { preferences, leave, budget } = input;

  const activePreset = matchPreset(preferences.weights);
  // Open the fine-tune sliders straight away only when the user is already on a
  // custom mix (e.g. returning after tuning) so their current settings aren't
  // hidden. Fresh/preset users get the calm, low-choice default.
  const [advancedOpen, setAdvancedOpen] = React.useState(() => activePreset === null);

  const applyPreset = (id: string) => {
    const preset = PRIORITY_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    updateWeights(preset.weights);
    track('priority_preset_selected', { preset: id });
  };

  const toggleSeason = (s: Season) => {
    const has = preferences.preferredSeasons.includes(s);
    updatePreferences({
      preferredSeasons: has
        ? preferences.preferredSeasons.filter((x) => x !== s)
        : [...preferences.preferredSeasons, s],
    });
  };

  // Travel preferences drive which destinations the engine may suggest.
  const countries = Array.from(
    new Map(input.destinations.map((d) => [d.countryCode, d.country])).entries(),
  ).map(([code, name]) => ({ code, name }));
  const scope = preferences.travelScope ?? 'any';
  const avoid = preferences.avoidCountries ?? [];
  const flightLimit = preferences.maxFlightHours ?? 14;
  const toggleAvoid = (code: string) =>
    updatePreferences({
      avoidCountries: avoid.includes(code) ? avoid.filter((c) => c !== code) : [...avoid, code],
    });

  // "Book time off for anything" — manage the personal dates the planner uses.
  const occasions = preferences.personalDates;
  const setOccasions = (next: PersonalDate[]) => updatePreferences({ personalDates: next });
  const updateOccasion = (i: number, patch: Partial<PersonalDate>) =>
    setOccasions(occasions.map((o, idx) => (idx === i ? { ...o, ...patch } : o)));
  const addOccasion = () =>
    setOccasions([
      ...occasions,
      { date: `${input.year}-06-15`, label: 'New occasion', kind: 'event', bookAround: true, daysAround: 3 },
    ]);
  const removeOccasion = (i: number) => setOccasions(occasions.filter((_, idx) => idx !== i));

  // Company shutdowns — closures the employer imposes. Each either comes out of
  // the annual allowance ('deducted') or is a free paid closure ('paid').
  const shutdowns = leave.shutdowns;
  const setShutdowns = (next: Shutdown[]) => updateLeave({ shutdowns: next });
  const updateShutdown = (i: number, patch: Partial<Shutdown>) =>
    setShutdowns(shutdowns.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addShutdown = () =>
    setShutdowns([
      ...shutdowns,
      {
        start: `${input.year}-12-24`,
        end: `${input.year}-12-31`,
        label: 'Company shutdown',
        policy: 'deducted',
      },
    ]);
  const removeShutdown = (i: number) => setShutdowns(shutdowns.filter((_, idx) => idx !== i));

  return (
    <div className="grid gap-4 lg:grid-cols-2 animate-fade-in">
      <Card glass>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">What matters most?</CardTitle>
            <p className="text-sm text-muted-foreground">
              Pick a starting point — plans re-rank instantly.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="radiogroup"
            aria-label="Priority preset"
            className="grid gap-2 sm:grid-cols-2"
          >
            {PRIORITY_PRESETS.map((preset) => {
              const active = activePreset?.id === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => applyPreset(preset.id)}
                  className={`rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    active
                      ? 'border-primary bg-primary/10 ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-secondary'
                  }`}
                >
                  <span className="block text-sm font-semibold">{preset.label}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {preset.description}
                  </span>
                </button>
              );
            })}
          </div>

          {activePreset === null && (
            <p className="text-xs font-medium text-primary">
              Custom mix — fine-tuned below.
            </p>
          )}

          <div className="border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
              className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4" /> Fine-tune priorities
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {advancedOpen && (
              <div className="mt-4 space-y-5">
                {WEIGHT_LABELS.map(({ key, label, hint }) => (
                  <div key={key}>
                    <div className="mb-2 flex items-center justify-between">
                      <Label htmlFor={`w-${key}`}>{label}</Label>
                      <span className="text-sm font-semibold tabular-nums text-primary">
                        {preferences.weights[key]}
                      </span>
                    </div>
                    <Slider
                      id={`w-${key}`}
                      value={[preferences.weights[key]]}
                      min={0}
                      max={5}
                      step={1}
                      onValueChange={([v]) => updateWeights({ [key]: v } as Partial<Weights>)}
                      aria-label={label}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Leave &amp; budget</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <NumberField
              id="remaining"
              label="Remaining leave (days)"
              value={leave.remaining}
              min={0}
              max={60}
              onChange={(v) => updateLeave({ remaining: v })}
            />
            <NumberField
              id="reserve"
              label="Reserve for emergencies"
              value={leave.reserveDays}
              min={0}
              max={availableLeaveDays(leave)}
              onChange={(v) => updateLeave({ reserveDays: v })}
            />
            <NumberField
              id="carryover"
              label="Carry-over days"
              value={leave.carryOver}
              min={0}
              max={30}
              onChange={(v) => updateLeave({ carryOver: v })}
            />
            <NumberField
              id="purchased"
              label="Purchased days"
              value={leave.purchasedDays}
              min={0}
              max={30}
              onChange={(v) => updateLeave({ purchasedDays: v })}
            />
            <NumberField
              id="sold"
              label="Sold-back days"
              value={leave.soldDays}
              min={0}
              max={30}
              onChange={(v) => updateLeave({ soldDays: v })}
            />
            <NumberField
              id="fund"
              label="Holiday fund"
              value={budget.holidayFund}
              min={0}
              max={50000}
              step={100}
              onChange={(v) => updateBudget({ holidayFund: v })}
            />
            <NumberField
              id="maxtrip"
              label="Max per-trip budget"
              value={budget.maxTripBudget}
              min={0}
              max={20000}
              step={50}
              onChange={(v) => updateBudget({ maxTripBudget: v })}
            />
            <NumberField
              id="savings"
              label="Monthly savings"
              value={budget.monthlySavings}
              min={0}
              max={5000}
              step={25}
              onChange={(v) => updateBudget({ monthlySavings: v })}
            />
            <div>
              <Label htmlFor="currency" className="mb-2 block">
                Currency
              </Label>
              <Select
                value={budget.currency}
                onValueChange={(v) => setCurrency(v)}
              >
                <SelectTrigger id="currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card glass>
          <CardHeader>
            <CardTitle className="text-base">Personal preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label htmlFor="triplen">Preferred trip length</Label>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {preferences.preferredTripLength} days
                </span>
              </div>
              <Slider
                id="triplen"
                value={[preferences.preferredTripLength]}
                min={2}
                max={21}
                step={1}
                onValueChange={([v]) => updatePreferences({ preferredTripLength: v })}
              />
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label htmlFor="mintemp">Minimum “warm” temperature</Label>
                <span className="text-sm font-semibold tabular-nums text-primary">
                  {preferences.minPreferredTempC}°C
                </span>
              </div>
              <Slider
                id="mintemp"
                value={[preferences.minPreferredTempC]}
                min={5}
                max={35}
                step={1}
                onValueChange={([v]) => updatePreferences({ minPreferredTempC: v })}
              />
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Preferred seasons</legend>
              <div className="flex flex-wrap gap-2">
                {SEASONS.map((s) => {
                  const active = preferences.preferredSeasons.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleSeason(s)}
                      className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-secondary'
                      }`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Trip types</legend>
              <div className="flex flex-wrap gap-2">
                {TRIP_TYPES.map((t) => {
                  const active = preferences.tripTypes.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleTripType(t)}
                      className={`rounded-full border px-3 py-1 text-sm capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-foreground hover:bg-secondary'
                      }`}
                    >
                      {t.replace('-', ' ')}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">Avoid school holidays</span>
              <Switch
                checked={preferences.avoidSchoolHolidays}
                onCheckedChange={(v) => updatePreferences({ avoidSchoolHolidays: v })}
                aria-label="Avoid school holidays"
              />
            </label>
          </CardContent>
        </Card>
      </div>

      <Card glass className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Travel preferences</CardTitle>
          <p className="text-sm text-muted-foreground">
            These decide which destinations plans may suggest. Trip types (above) also apply — a
            break with no match becomes a staycation.
          </p>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-3">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Travel scope</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['any', 'Anywhere'],
                  ['domestic', 'Domestic only'],
                  ['international', 'International'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => updatePreferences({ travelScope: value })}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    scope === value
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:bg-secondary'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="max-flight">Max flight time</Label>
              <span className="text-sm font-semibold tabular-nums text-primary">
                {flightLimit >= 14 ? 'Any' : `${flightLimit}h`}
              </span>
            </div>
            <Slider
              id="max-flight"
              value={[flightLimit]}
              min={0}
              max={14}
              step={1}
              onValueChange={([v]) =>
                updatePreferences({ maxFlightHours: v >= 14 ? undefined : v })
              }
              aria-label="Maximum flight time"
            />
            <p className="mt-1 text-xs text-muted-foreground">0h keeps trips domestic.</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Countries to avoid</legend>
            <div className="flex flex-wrap gap-2">
              {countries.map((c) => {
                const active = avoid.includes(c.code);
                return (
                  <button
                    key={c.code}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAvoid(c.code)}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      active
                        ? 'border-destructive bg-destructive text-destructive-foreground'
                        : 'border-border bg-card text-foreground hover:bg-secondary'
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card glass className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-primary" /> Company shutdowns
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Periods your employer closes. Mark whether each one comes out of your allowance or
              is a free paid closure — only deducted days reduce your bookable leave.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addShutdown}
            className="gap-1.5"
            aria-label="Add shutdown period"
          >
            <Plus className="h-4 w-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {shutdowns.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No shutdowns — your company doesn’t impose any closures on you.
            </p>
          ) : (
            shutdowns.map((s, i) => {
              const deducted = s.policy !== 'paid';
              return (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
                >
                  <div className="min-w-[9rem] flex-1">
                    <Label htmlFor={`sd-label-${i}`} className="mb-1 block text-xs">
                      Name
                    </Label>
                    <Input
                      id={`sd-label-${i}`}
                      value={s.label ?? ''}
                      onChange={(e) => updateShutdown(i, { label: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`sd-start-${i}`} className="mb-1 block text-xs">
                      From
                    </Label>
                    <Input
                      id={`sd-start-${i}`}
                      type="date"
                      value={s.start}
                      onChange={(e) => updateShutdown(i, { start: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`sd-end-${i}`} className="mb-1 block text-xs">
                      To
                    </Label>
                    <Input
                      id={`sd-end-${i}`}
                      type="date"
                      value={s.end}
                      onChange={(e) => updateShutdown(i, { end: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 pb-2 text-sm">
                    <Switch
                      checked={deducted}
                      onCheckedChange={(v) =>
                        updateShutdown(i, { policy: v ? 'deducted' : 'paid' })
                      }
                      aria-label={`${s.label ?? 'Shutdown'} comes out of my allowance`}
                    />
                    {deducted ? 'Uses my leave' : 'Paid closure (free)'}
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeShutdown(i)}
                    aria-label={`Remove ${s.label ?? 'shutdown'}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card glass className="lg:col-span-2">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarHeart className="h-4 w-4 text-primary" /> Time off for anything
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Weddings, birthdays, moving house, appointments, a rest day — flag any date and the
              planner books time off around it (no trip suggested).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={addOccasion} className="gap-1.5">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {occasions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No occasions yet — add one above.</p>
          ) : (
            occasions.map((o, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
              >
                <div className="min-w-[9rem] flex-1">
                  <Label htmlFor={`occ-label-${i}`} className="mb-1 block text-xs">
                    What for
                  </Label>
                  <Input
                    id={`occ-label-${i}`}
                    value={o.label}
                    onChange={(e) => updateOccasion(i, { label: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`occ-date-${i}`} className="mb-1 block text-xs">
                    Date
                  </Label>
                  <Input
                    id={`occ-date-${i}`}
                    type="date"
                    value={o.date}
                    onChange={(e) => updateOccasion(i, { date: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs">Type</Label>
                  <Select
                    value={o.kind}
                    onValueChange={(v) => updateOccasion(i, { kind: v as OccasionKind })}
                  >
                    <SelectTrigger className="h-10 w-40" aria-label={`Type for ${o.label}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {OCCASION_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>
                          {OCCASION_LABELS[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm">
                  <Switch
                    checked={o.bookAround ?? false}
                    onCheckedChange={(v) => updateOccasion(i, { bookAround: v })}
                    aria-label={`Book time off around ${o.label}`}
                  />
                  Book time off
                </label>
                {o.bookAround ? (
                  <div className="w-20">
                    <Label htmlFor={`occ-days-${i}`} className="mb-1 block text-xs">
                      Days
                    </Label>
                    <Input
                      id={`occ-days-${i}`}
                      type="number"
                      min={1}
                      max={14}
                      value={o.daysAround ?? 3}
                      onChange={(e) => updateOccasion(i, { daysAround: Number(e.target.value) })}
                    />
                  </div>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOccasion(i)}
                  aria-label={`Remove ${o.label}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label htmlFor={id} className="mb-2 block">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </div>
  );
}
