import React from 'react';
import { PHASES, PHASE_TRANSITIONS, PHASE_METADATA } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { UndoRedoToolbar } from './UndoRedoSystem';

function NavigationBar() {
  const { currentPhase, actions } = usePhase();

  const handlePhaseChange = (newPhase) => {
    const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
    if (allowedTransitions.includes(newPhase) || newPhase === currentPhase) {
      actions.advancePhase(newPhase);
    }
  };

  return (
    <nav className="glass-card border-b border-border-light px-fib-21 py-fib-13 sticky top-0 z-40">
      <div className="container-enhanced">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-fib-21">
            <div className="flex items-center space-x-fib-8">
              <div className="text-fib-21 animate-float">🚀</div>
              <h1 className="text-xl font-bold">
                <span className="text-gradient">StratoSort</span>
              </h1>
            </div>
            <div className="flex items-center space-x-fib-5">
              {Object.entries(PHASES).map(([key, phase]) => {
                const isActive = currentPhase === phase;
                const metadata = PHASE_METADATA[phase];
                const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
                const canNavigate = allowedTransitions.includes(phase) || isActive;
                return (
                  <button
                    key={phase}
                    onClick={() => handlePhaseChange(phase)}
                    disabled={!canNavigate}
                    className={`
                      flex items-center space-x-fib-5 px-fib-13 py-fib-8 rounded-lg text-sm font-medium transition-all
                      ${isActive 
                        ? 'bg-stratosort-blue text-white shadow-sm' 
                        : canNavigate
                          ? 'text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-50'
                          : 'text-system-gray-400 cursor-not-allowed'
                      }
                    `}
                  >
                    <span>{metadata.icon}</span>
                    <span className="hidden md:inline">{metadata.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center space-x-fib-13">
            <UndoRedoToolbar />
            <button
              onClick={actions.toggleSettings}
              className="p-fib-8 text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-100 rounded-lg transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <span role="img" aria-label="settings">⚙️</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavigationBar;


