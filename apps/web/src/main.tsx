import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { PlannerProvider } from './store/planner';
import { GroupsProvider } from './store/groups';
import { ThemeProvider } from './store/theme';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <PlannerProvider>
        <GroupsProvider>
          <App />
        </GroupsProvider>
      </PlannerProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
