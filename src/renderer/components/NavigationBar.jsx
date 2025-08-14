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
    <nav className="glass-card border-b border-border-light px-21 py-13 sticky top-0 z-40">
      <div className="container-enhanced">
        <div className="flex items-center justify-between min-h-[56px]">
          <div className="flex items-center space-x-21">
            <div className="flex items-center space-x-8">
              <div className="text-21 animate-float">🚀</div>
              <h1 className="text-xl font-bold">
                <span className="text-gradient">StratoSort</span>
              </h1>
            </div>
            <div className="flex-1 flex items-center space-x-5 overflow-x-auto whitespace-nowrap no-scrollbar">
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
                      shrink-0 flex items-center space-x-5 px-13 py-8 rounded-lg text-sm font-medium transition-all
                      ${isActive 
                        ? 'bg-stratosort-blue text-white shadow-sm' 
                        : canNavigate
                          ? 'text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-50'
                          : 'text-system-gray-400 cursor-not-allowed'
                      }
                    `}
                  >
                    <span className="text-lg" aria-hidden>{metadata.icon}</span>
                    <span className="hidden md:inline">{metadata.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center space-x-13 flex-shrink-0">
            <UndoRedoToolbar />
            <button
              onClick={actions.toggleSettings}
              className="p-8 text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-100 rounded-lg transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.066z"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Progress/phase subheader removed per request */}
      </div>
    </nav>
  );
}

export default NavigationBar;


