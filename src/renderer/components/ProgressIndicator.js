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
    <div className="glass-card border-0 rounded-none shadow-lg backdrop-blur-lg px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Current Phase Info */}
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
            <span className="text-2xl">{metadata.icon}</span>
          </div>
          <div>
            <div className="font-semibold text-gray-900">{metadata.title}</div>
            <div className="text-sm text-gray-500">Step {currentIndex + 1} of {phases.length}</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-700">{progress}%</span>
            <div className="w-48 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
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
                  w-2 h-2 rounded-full transition-all duration-300
                  ${index <= currentIndex ? 'bg-blue-600' : 'bg-gray-300'}
                  ${index === currentIndex ? 'w-3 h-3' : ''}
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
