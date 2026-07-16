import { RotateCcw } from 'lucide-react';
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
import { SUPPORTED_CURRENCIES, type Season, type TripType, type Weights } from '@escape-plan/engine';

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
  const { input, updateWeights, updateLeave, updateBudget, updatePreferences, toggleTripType, reset } =
    usePlanner();
  const { preferences, leave, budget } = input;

  const toggleSeason = (s: Season) => {
    const has = preferences.preferredSeasons.includes(s);
    updatePreferences({
      preferredSeasons: has
        ? preferences.preferredSeasons.filter((x) => x !== s)
        : [...preferences.preferredSeasons, s],
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2 animate-fade-in">
      <Card glass>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Optimisation priorities</CardTitle>
            <p className="text-sm text-muted-foreground">
              Plans re-rank instantly as you adjust weights.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
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
              max={leave.remaining}
              onChange={(v) => updateLeave({ reserveDays: v })}
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
                onValueChange={(v) => updateBudget({ currency: v })}
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
