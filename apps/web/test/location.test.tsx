import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { detectLocaleLocation } from '@/lib/detectLocation';
import { PlannerProvider, usePlanner } from '@/store/planner';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <PlannerProvider>{children}</PlannerProvider>
);

afterEach(() => {
  vi.restoreAllMocks();
  try {
    window.localStorage?.clear();
  } catch {
    /* ignore */
  }
});

describe('locale detection', () => {
  it('reads the browser timezone/language to guess country + currency', () => {
    vi.spyOn(Intl, 'DateTimeFormat').mockReturnValue({
      resolvedOptions: () => ({ timeZone: 'Europe/Paris' }),
    } as unknown as Intl.DateTimeFormat);
    const guess = detectLocaleLocation();
    expect(guess).toMatchObject({ countryCode: 'FR', currency: 'EUR' });
  });
});

describe('planner store applies detected location', () => {
  it('a fresh user gets a home profile so staycations carry local weather', () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    // home is always present (feature migration / fresh detection).
    expect(result.current.input.home).toBeDefined();
    expect(result.current.homeCountry).toBeTruthy();
    // Every staycation break in the demo plans has local weather.
    const stays = result.current.result.plans
      .flatMap((p) => p.breaks)
      .filter((b) => !b.suggestion);
    for (const s of stays) expect(s.homeWeather).toBeDefined();
  });

  it('changing home country updates the currency and home profile', () => {
    const { result } = renderHook(() => usePlanner(), { wrapper });
    act(() => result.current.setHomeCountry('ES'));
    expect(result.current.homeCountry).toBe('ES');
    expect(result.current.input.budget.currency).toBe('EUR');
    expect(result.current.input.home?.label).toBe('Spain');
  });
});
