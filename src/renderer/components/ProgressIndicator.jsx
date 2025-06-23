import React from 'react';

import { usePhase } from '../contexts/PhaseContext';

const { PHASES, PHASE_METADATA } = require('../../shared/constants');

function ProgressIndicator() {
  const { currentPhase } = usePhase();
  const phases = Object.values(PHASES);
  const currentIndex = phases.indexOf(currentPhase);
  const metadata = PHASE_METADATA[currentPhase];
  const progress = Math.round(((currentIndex + 1) / phases.length) * 100);

  return (
    <div className="glass-card border-0 rounded-none shadow-lg backdrop-blur-lg bg-white/10 px-6 py-3">
      <div className="flex items-center justify-between">
        {/* Current Phase Info */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 glass-card flex items-center justify-center shadow-md">
            <span className="text-xl">{metadata.icon}</span>
          </div>
          <div>
            <div className="font-semibold text-on-glass">{metadata.title}</div>
            <div className="text-sm text-readable-light">Step {currentIndex + 1} of {phases.length}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-on-glass">{progress}%</span>
            <div className="w-48 h-2 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-700 ease-out shadow-sm"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          
          {/* Phase Dots */}
          <div className="flex items-center gap-2 ml-4">
            {phases.map((phase, index) => (
              <div
                key={phase}
                className={`
                  rounded-full transition-all duration-300 backdrop-blur-sm
                  ${index <= currentIndex 
                ? 'bg-gradient-to-br from-blue-500 to-purple-600 shadow-sm' 
                : 'bg-white/30'
              }
                  ${index === currentIndex ? 'w-3 h-3 scale-110' : 'w-2 h-2'}
                `}
                title={PHASE_METADATA[phase].title}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressIndicator;
