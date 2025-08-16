import React, { Suspense, lazy } from 'react';
import { useKeyboardShortcuts } from '../hooks';
import { usePhase } from '../contexts/PhaseContext';

const WelcomePhase = lazy(() => import('../phases/WelcomePhase'));
const SetupPhase = lazy(() => import('../phases/SetupPhase'));
const DiscoverPhase = lazy(() => import('../phases/DiscoverPhase'));
const OrganizePhase = lazy(() => import('../phases/OrganizePhase'));
const CompletePhase = lazy(() => import('../phases/CompletePhase'));
import SettingsPanel from './SettingsPanel';

const { PHASES } = require('../../shared/constants');

function PhaseRenderer() {
  const { currentPhase, showSettings } = usePhase();
  useKeyboardShortcuts();

  const renderCurrentPhase = () => {
    switch (currentPhase) {
      case PHASES.WELCOME: return <WelcomePhase />;
      case PHASES.SETUP: return <SetupPhase />;
      case PHASES.DISCOVER: return <DiscoverPhase />;
      case PHASES.ORGANIZE: return <OrganizePhase />;
      case PHASES.COMPLETE: return <CompletePhase />;
      default: return <WelcomePhase />;
    }
  };

  return (
    <>
      <Suspense fallback={<div className="p-13 text-system-gray-500">Loading…</div>}>
        {renderCurrentPhase()}
      </Suspense>
      {showSettings && <SettingsPanel />}
    </>
  );
}

export default PhaseRenderer;



