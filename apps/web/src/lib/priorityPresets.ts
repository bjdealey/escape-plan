/**
 * Plain-language priority presets.
 *
 * The optimisation engine is driven by seven 0–5 weights (see `Weights`). Asking
 * a non-technical user to balance all seven against each other is a high
 * cognitive-load task (Hick's Law: choice count and interaction complexity slow
 * the decision). These presets collapse that into a handful of one-click
 * choices phrased around the outcome the user actually wants — "fewest leave
 * days", "longest trips" — while the raw sliders stay available behind a
 * fine-tune disclosure for the minority who want them.
 *
 * Each preset sets ALL seven weights so switching between them is fully
 * deterministic and never leaves a stale weight from a previous choice.
 */
import type { Weights } from '@escape-plan/engine';

export interface PriorityPreset {
  id: string;
  label: string;
  /** One-line, outcome-first description shown under the label. */
  description: string;
  weights: Weights;
}

export const PRIORITY_PRESETS: PriorityPreset[] = [
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'A sensible all-rounder — a bit of everything.',
    // Matches DEFAULT_WEIGHTS so a fresh user starts on a recognised preset.
    weights: {
      maximiseConsecutive: 4,
      minimiseLeave: 3,
      warmWeather: 2,
      budget: 3,
      spreadEvenly: 2,
      preferenceMatch: 2,
      longWeekends: 2,
    },
  },
  {
    id: 'fewest-leave',
    label: 'Fewest leave days',
    description: 'Most days off from the least leave used.',
    weights: {
      maximiseConsecutive: 3,
      minimiseLeave: 5,
      warmWeather: 1,
      budget: 2,
      spreadEvenly: 1,
      preferenceMatch: 2,
      longWeekends: 3,
    },
  },
  {
    id: 'longest-trips',
    label: 'Longest trips',
    description: 'Fewer, longer holidays over lots of short ones.',
    weights: {
      maximiseConsecutive: 5,
      minimiseLeave: 2,
      warmWeather: 2,
      budget: 2,
      spreadEvenly: 1,
      preferenceMatch: 2,
      longWeekends: 0,
    },
  },
  {
    id: 'spread-out',
    label: 'Spread through the year',
    description: 'A break to look forward to in every season.',
    weights: {
      maximiseConsecutive: 2,
      minimiseLeave: 3,
      warmWeather: 2,
      budget: 2,
      spreadEvenly: 5,
      preferenceMatch: 2,
      longWeekends: 3,
    },
  },
  {
    id: 'lowest-cost',
    label: 'Lowest cost',
    description: 'Keep spend down and stay on budget.',
    weights: {
      maximiseConsecutive: 2,
      minimiseLeave: 4,
      warmWeather: 1,
      budget: 5,
      spreadEvenly: 2,
      preferenceMatch: 1,
      longWeekends: 3,
    },
  },
  {
    id: 'warm-sunny',
    label: 'Warm & sunny',
    description: 'Chase the best weather wherever it is.',
    weights: {
      maximiseConsecutive: 3,
      minimiseLeave: 2,
      warmWeather: 5,
      budget: 2,
      spreadEvenly: 2,
      preferenceMatch: 3,
      longWeekends: 2,
    },
  },
];

const WEIGHT_KEYS = [
  'maximiseConsecutive',
  'minimiseLeave',
  'warmWeather',
  'budget',
  'spreadEvenly',
  'preferenceMatch',
  'longWeekends',
] as const;

/**
 * Return the preset whose weights exactly match `weights`, or `null` when the
 * user has fine-tuned into a combination no preset represents ("Custom").
 */
export function matchPreset(weights: Weights): PriorityPreset | null {
  return (
    PRIORITY_PRESETS.find((preset) =>
      WEIGHT_KEYS.every((k) => preset.weights[k] === weights[k]),
    ) ?? null
  );
}
