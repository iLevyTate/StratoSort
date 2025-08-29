import React, { lazy, Suspense, useEffect } from 'react';
import './tailwind.css';

import { AppShell } from './components/layout';
import AppProviders from './components/AppProviders';
import ErrorBoundary from './components/ErrorBoundary';

// Lazy-load heavy components to improve initial render performance
const PhaseRendererLazy = lazy(() => import('./components/PhaseRenderer'));
const TooltipManagerLazy = lazy(() => import('./components/TooltipManager'));
const NavigationBarLazy = lazy(() => import('./components/NavigationBar'));
const FirstRunWizardLazy = lazy(() => import('./components/setup'));

// ProgressIndicator folded into NavigationBar

function App() {
  // Hide the initial loading screen once React mounts
  useEffect(() => {
    const el = document.getElementById('initial-loading');
    if (el) {
      el.style.display = 'none';
    }
  }, []);

  return (
    <ErrorBoundary>
      <AppProviders>
        <AppShell
          header={
            <Suspense fallback={<div />}>
              <NavigationBarLazy />
            </Suspense>
          }
        >
          <Suspense fallback={null}>
            <PhaseRendererLazy />
            <TooltipManagerLazy />
            <FirstRunWizardLazy
              onComplete={() => {
                /* no-op: hidden after connect ok */
              }}
            />
          </Suspense>
        </AppShell>
      </AppProviders>
    </ErrorBoundary>
  );
}

export default App;
