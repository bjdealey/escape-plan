import type { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { PlannerProvider } from '@/store/planner';
import { NotificationsProvider } from '@/store/notifications';
import { GroupsProvider } from '@/store/groups';
import { ThemeProvider } from '@/store/theme';

function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <PlannerProvider>
        <NotificationsProvider>
          <GroupsProvider>{children}</GroupsProvider>
        </NotificationsProvider>
      </PlannerProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(ui: ReactElement) {
  return render(ui, { wrapper: Providers });
}
