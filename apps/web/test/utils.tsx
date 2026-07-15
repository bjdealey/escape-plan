import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { PlannerProvider } from '@/store/planner';
import { GroupsProvider } from '@/store/groups';
import { ThemeProvider } from '@/store/theme';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PlannerProvider>
        <GroupsProvider>{children}</GroupsProvider>
      </PlannerProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}
