import React from 'react';
import './tailwind.css';

import { AppShell } from './components/layout';
import TooltipManager from './components/TooltipManager';
import NavigationBar from './components/NavigationBar';
import PhaseRenderer from './components/PhaseRenderer';

import AppProviders from './components/AppProviders';
import ErrorBoundary from './components/ErrorBoundary';
import FirstRunWizard from './components/setup';
// ProgressIndicator folded into NavigationBar

function App() {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppShell header={<NavigationBar />}>
          <PhaseRenderer />
          <TooltipManager />
          <FirstRunWizard onComplete={() => { /* no-op: hidden after connect ok */ }} />
        </AppShell>
      </AppProviders>
    </ErrorBoundary>
  );
}

export default App;
