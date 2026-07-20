import { afterEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  __resetAnalytics,
  getRecordedEvents,
  setAnalyticsSink,
  track,
  type AnalyticsEvent,
} from '@/lib/analytics';
import { PlansView } from '@/components/PlansView';
import { renderWithProviders } from './utils';

afterEach(() => __resetAnalytics());

describe('analytics event layer', () => {
  it('records events on-device and forwards them to a registered sink', () => {
    const seen: AnalyticsEvent[] = [];
    setAnalyticsSink((e) => seen.push(e));

    track('plan_selected', { planId: 'plan-2', rank: 2 });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ name: 'plan_selected', props: { planId: 'plan-2', rank: 2 } });
    expect(getRecordedEvents().at(-1)?.name).toBe('plan_selected');
  });

  it('sends nothing off-device by default (no sink registered)', () => {
    // With no sink, track must not throw and must still record locally.
    expect(() => track('tab_viewed', { tab: 'calendar' })).not.toThrow();
    expect(getRecordedEvents().at(-1)).toMatchObject({ name: 'tab_viewed' });
  });

  it('never lets a throwing sink break the caller', () => {
    setAnalyticsSink(() => {
      throw new Error('sink exploded');
    });
    expect(() => track('invite_sent', { groupId: 'g1' })).not.toThrow();
  });

  it('fires plan_selected when a user commits to a plan', async () => {
    const user = userEvent.setup();
    const seen: AnalyticsEvent[] = [];
    setAnalyticsSink((e) => seen.push(e));

    renderWithProviders(<PlansView />);
    const buttons = screen.getAllByRole('button', { name: /use this plan/i });
    await user.click(buttons[0]);

    const selected = seen.filter((e) => e.name === 'plan_selected');
    expect(selected.length).toBeGreaterThanOrEqual(1);
    expect(selected[0].props).toHaveProperty('planId');
    expect(selected[0].props).toHaveProperty('rank');
  });
});
