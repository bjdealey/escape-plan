import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { PlannerProvider } from './store/planner';
import { NotificationsProvider } from './store/notifications';
import { GroupsProvider } from './store/groups';
import { ThemeProvider } from './store/theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PlannerProvider>
        <NotificationsProvider>
          <GroupsProvider>
            <App />
          </GroupsProvider>
        </NotificationsProvider>
      </PlannerProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
