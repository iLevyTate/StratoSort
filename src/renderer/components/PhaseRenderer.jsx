import React from 'react';
import { useKeyboardShortcuts } from '../hooks';
import { usePhase } from '../contexts/PhaseContext';

import WelcomePhase from '../phases/WelcomePhase';
import SetupPhase from '../phases/SetupPhase';
import DiscoverPhase from '../phases/DiscoverPhase';
import OrganizePhase from '../phases/OrganizePhase';
import CompletePhase from '../phases/CompletePhase';
import SettingsPanel from './SettingsPanel';

const { PHASES } = require('../../shared/constants');

function PhaseRenderer() {
  const { currentPhase, showSettings } = usePhase();
  useKeyboardShortcuts();

  const renderCurrentPhase = () => {
    switch (currentPhase) {
      case PHASES.WELCOME:
        return <WelcomePhase />;
      case PHASES.SETUP:
        return <SetupPhase />;
      case PHASES.DISCOVER:
        return <DiscoverPhase />;
      case PHASES.ORGANIZE:
        return <OrganizePhase />;
      case PHASES.COMPLETE:
        return <CompletePhase />;
      default:
        return <WelcomePhase />;
    }
  };

  return (
    <>
      {renderCurrentPhase()}
      {showSettings && <SettingsPanel />}
    </>
  );
}

export default PhaseRenderer;
