import React from 'react';
import './tailwind.css';

import { AppShell } from './components/layout';
import TooltipManager from './components/TooltipManager';
import NavigationBar from './components/NavigationBar';
import ProgressIndicator from './components/ProgressIndicator';
// Removed SystemMonitoring per request (no real-time stats at bottom)
import PhaseRenderer from './components/PhaseRenderer';

import AppProviders from './components/AppProviders';

function App() {
  return (
    <AppProviders>
      <AppShell header={<NavigationBar />} subheader={<ProgressIndicator />}>
        <PhaseRenderer />
        <TooltipManager />
      </AppShell>
    </AppProviders>
  );
}

export default App;


