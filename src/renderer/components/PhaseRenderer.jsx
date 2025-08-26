import React, { Suspense, lazy, useMemo, useCallback } from 'react';
import { useKeyboardShortcuts } from '../hooks';
import { usePhase } from '../contexts/PhaseContext';

const WelcomePhase = lazy(() => import('../phases/WelcomePhase'));
const AISetupPhase = lazy(() => import('../phases/AISetupPhase'));
const SetupPhase = lazy(() => import('../phases/SetupPhase'));
const DiscoverPhase = lazy(() => import('../phases/DiscoverPhase'));
const OrganizePhase = lazy(() => import('../phases/OrganizePhase'));
const CompletePhase = lazy(() => import('../phases/CompletePhase'));
import SettingsPanel from './SettingsPanel';
import ErrorBoundary from './ErrorBoundary';
import { PHASES } from '../../shared/constants';

function PhaseRenderer() {
  const { currentPhase, showSettings } = usePhase();
  useKeyboardShortcuts();

  const renderCurrentPhase = useCallback(() => {
    switch (currentPhase) {
      case PHASES.WELCOME:
        return (
          <ErrorBoundary fallbackTitle="Welcome Phase Error">
            <WelcomePhase />
          </ErrorBoundary>
        );
      case PHASES.AI_SETUP:
        return (
          <ErrorBoundary fallbackTitle="AI Setup Phase Error">
            <AISetupPhase />
          </ErrorBoundary>
        );
      case PHASES.SETUP:
        return (
          <ErrorBoundary fallbackTitle="Setup Phase Error">
            <SetupPhase />
          </ErrorBoundary>
        );
      case PHASES.DISCOVER:
        return (
          <ErrorBoundary fallbackTitle="Discover Phase Error">
            <DiscoverPhase />
          </ErrorBoundary>
        );
      case PHASES.ORGANIZE:
        return (
          <ErrorBoundary fallbackTitle="Organize Phase Error">
            <OrganizePhase />
          </ErrorBoundary>
        );
      case PHASES.COMPLETE:
        return (
          <ErrorBoundary fallbackTitle="Complete Phase Error">
            <CompletePhase />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary fallbackTitle="Welcome Phase Error">
            <WelcomePhase />
          </ErrorBoundary>
        );
    }
  }, [currentPhase]);

  return (
    <>
      <Suspense
        fallback={<div className="p-13 text-system-gray-500">Loading…</div>}
      >
        {renderCurrentPhase()}
      </Suspense>
      {showSettings && <SettingsPanel />}
    </>
  );
}

export default React.memo(PhaseRenderer);
