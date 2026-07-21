import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreferencesPanel } from '@/components/PreferencesPanel';
import { getRecordedEvents } from '@/lib/analytics';
import { PRIORITY_PRESETS, matchPreset } from '@/lib/priorityPresets';
import { renderWithProviders } from './utils';

describe('Priority presets', () => {
  it('leads with plain-language presets and hides the sliders by default', () => {
    renderWithProviders(<PreferencesPanel />);

    // The outcome-first question replaces the raw "Optimisation priorities" label.
    expect(screen.getByText('What matters most?')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Fewest leave days/ })).toBeInTheDocument();

    // The seven weight sliders are collapsed behind the fine-tune disclosure.
    expect(screen.queryByLabelText('Warm weather')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /Fine-tune priorities/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('applies a preset, marks it selected, and tracks the choice', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesPanel />);

    const longest = screen.getByRole('radio', { name: /Longest trips/ });
    await user.click(longest);

    expect(longest).toHaveAttribute('aria-checked', 'true');
    const selected = getRecordedEvents().filter((e) => e.name === 'priority_preset_selected');
    expect(selected.at(-1)?.props).toMatchObject({ preset: 'longest-trips' });
  });

  it('reveals the seven weight sliders when fine-tune is expanded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PreferencesPanel />);

    await user.click(screen.getByRole('button', { name: /Fine-tune priorities/ }));

    for (const label of [
      'Maximise consecutive days off',
      'Spend the least leave',
      'Warm weather',
      'Stay within budget',
      'Spread across the year',
      'Match my preferences',
      'Prefer long weekends',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('matchPreset recognises each preset and returns null for a custom mix', () => {
    for (const preset of PRIORITY_PRESETS) {
      expect(matchPreset(preset.weights)?.id).toBe(preset.id);
    }
    // A single weight nudged off the Balanced profile is no longer a preset.
    const custom = { ...PRIORITY_PRESETS[0].weights, warmWeather: 5 };
    expect(matchPreset(custom)).toBeNull();
  });
});
