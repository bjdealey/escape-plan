import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlansView } from '@/components/PlansView';
import { usePlanner } from '@/store/planner';
import { renderWithProviders } from './utils';

function SelectedProbe() {
  const { selectedPlanId } = usePlanner();
  return <div data-testid="selected">{selectedPlanId}</div>;
}

// jsdom under Node 26 doesn't expose localStorage (the app guards every access);
// install a minimal in-memory Storage so we can assert the persistence path.
function installMemoryStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}

describe('planner persistence', () => {
  beforeEach(() => installMemoryStorage());
  afterEach(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: undefined });
  });

  it('persists the committed plan to localStorage', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <PlansView />
        <SelectedProbe />
      </>,
    );

    const buttons = screen.getAllByRole('button', { name: /use this plan/i });
    await user.click(buttons[0]);

    // The store wrote the choice; a return visit will read it back.
    expect(window.localStorage.getItem('escape-plan-selected')).toBe(
      screen.getByTestId('selected').textContent,
    );
    expect(screen.getByTestId('selected').textContent).not.toBe('');
  });

  it('restores the previously selected plan on a fresh mount', () => {
    window.localStorage.setItem('escape-plan-selected', 'plan-2');
    renderWithProviders(<SelectedProbe />);
    expect(screen.getByTestId('selected')).toHaveTextContent('plan-2');
  });
});
