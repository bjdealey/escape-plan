import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { PlannerProvider } from '@/store/planner';
import { ThemeProvider } from '@/store/theme';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PlannerProvider>{children}</PlannerProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}
