import React, { useEffect } from 'react';

import { usePhase } from '../contexts/PhaseContext';

const { PHASES, PHASE_METADATA } = require('../../shared/constants');

function NavigationBar() {
  const { currentPhase, actions } = usePhase();
  const phases = Object.values(PHASES);
  const currentIndex = phases.indexOf(currentPhase);

  // Remove navigation restrictions - allow free navigation
  const canNavigate = (phase) => {
    return true; // Always allow navigation to any phase
  };

  // Handle arrow key navigation
  useEffect(() => {
    const handleGlobalKeyDown = (event) => {
      // Only handle if no input/textarea is focused
      if (document.activeElement?.tagName === 'INPUT' || 
          document.activeElement?.tagName === 'TEXTAREA' ||
          document.activeElement?.contentEditable === 'true') {
        return;
      }

      if (event.key === 'ArrowLeft' && currentIndex > 0) {
        event.preventDefault();
        actions.advancePhase(phases[currentIndex - 1]);
      } else if (event.key === 'ArrowRight' && currentIndex < phases.length - 1) {
        event.preventDefault();
        actions.advancePhase(phases[currentIndex + 1]);
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [currentIndex, phases, actions]);

  // Handle keyboard navigation
  const handleKeyDown = (event, phase) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      actions.advancePhase(phase);
    }
  };

  const handleSettingsKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      actions.toggleSettings();
    }
  };

  return (
    <nav 
      className="flex-shrink-0 glass-card border-0 rounded-none shadow-lg backdrop-blur-lg bg-white/10"
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Skip to main content link for screen readers */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-blue-600 text-white px-4 py-2 rounded-md z-50"
        aria-label="Skip to main content"
      >
        Skip to main content
      </a>

      <div className="px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <div 
                className="w-8 h-8 glass-card flex items-center justify-center shadow-lg"
                role="img"
                aria-label="StratoSort logo"
              >
                <span className="text-sm" aria-hidden="true">🚀</span>
              </div>
              <h1 className="text-sm font-bold text-on-glass">
                StratoSort
              </h1>
            </div>
          </div>

          {/* Phase Navigation */}
          <div className="flex-1 flex items-center justify-center">
            <div 
              className="flex items-center gap-2"
              role="tablist"
              aria-label="Workflow phases"
            >
              {phases.map((phase, index) => {
                const metadata = PHASE_METADATA[phase];
                const isActive = phase === currentPhase;
                const isNavigable = canNavigate(phase);
                const isCompleted = index < currentIndex;

                return (
                  <React.Fragment key={phase}>
                    <button
                      onClick={() => actions.advancePhase(phase)}
                      onKeyDown={(e) => handleKeyDown(e, phase)}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls={`phase-${phase}-panel`}
                      aria-label={`${metadata.title} phase${isCompleted ? ' (completed)' : ''}${isActive ? ' (current)' : ''}`}
                      tabIndex={0}
                      className={`
                        group flex items-center gap-2 px-3 py-2
                        transition-all duration-300 text-sm font-medium rounded-lg
                        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
                        cursor-pointer hover:scale-105
                        ${isActive 
                    ? 'glass-button-primary scale-105' 
                    : 'glass-card hover:glass-card-strong text-on-glass hover:bg-white/20'
                  }
                      `}
                      title={`${metadata.title}${metadata.description ? ` - ${metadata.description}` : ''} (Click to navigate)`}
                    >
                      {/* Step Number */}
                      <div className={`
                        flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                        backdrop-filter backdrop-blur-sm transition-all duration-300
                        ${isActive 
                    ? 'bg-white/90 text-blue-600 shadow-lg' 
                    : isCompleted
                      ? 'bg-green-500/80 text-white shadow-md'
                      : 'bg-white/60 text-gray-600 group-hover:bg-white/80'
                  }
                      `}>
                        {isCompleted && !isActive ? '✓' : index + 1}
                      </div>
                      
                      {/* Phase Name */}
                      <span className={`
                        font-semibold text-sm
                        ${isActive ? 'text-white' : 'text-on-glass group-hover:text-white'}
                      `}>
                        {metadata.title.split(' ')[0]}
                      </span>

                      {/* Icon */}
                      <span 
                        className={`text-sm transition-transform duration-300 ${
                          isActive ? 'animate-pulse scale-110' : 'group-hover:scale-110'
                        }`}
                        aria-hidden="true"
                      >
                        {metadata.icon}
                      </span>
                    </button>

                    {/* Connector Line */}
                    {index < phases.length - 1 && (
                      <div 
                        className={`
                          w-4 h-0.5 flex-shrink-0 rounded-full transition-all duration-300
                          ${isCompleted ? 'bg-green-400/60 shadow-sm' : 'bg-white/30'}
                        `} 
                        aria-hidden="true"
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Settings Button */}
          <div className="flex-shrink-0">
            <button
              onClick={actions.toggleSettings}
              onKeyDown={handleSettingsKeyDown}
              className="glass-button w-10 h-10 flex items-center justify-center hover:scale-105 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Open settings"
              title="Settings (Ctrl+,)"
            >
              <span className="text-sm" aria-hidden="true">⚙️</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavigationBar;
