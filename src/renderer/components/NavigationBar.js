import React from 'react';
import { usePhase } from '../contexts/PhaseContext';
const { PHASES, PHASE_METADATA } = require('../../shared/constants');

function NavigationBar() {
  const { currentPhase, actions } = usePhase();
  const phases = Object.values(PHASES);
  const currentIndex = phases.indexOf(currentPhase);

  const canNavigate = (phase) => {
    const targetIndex = phases.indexOf(phase);
    return targetIndex <= currentIndex;
  };

  return (
    <nav className="glass-card border-0 rounded-none shadow-lg backdrop-blur-lg bg-white/10">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Logo - Glassmorphism Style */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 glass-card flex items-center justify-center shadow-lg">
                <span className="text-2xl">🚀</span>
              </div>
              <h1 className="text-xl font-bold text-on-glass hidden lg:block">
                StratoSort
              </h1>
            </div>
          </div>

          {/* Phase Navigation - Glassmorphism Style */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex items-center justify-center gap-3 min-w-fit px-2">
              {phases.map((phase, index) => {
                const metadata = PHASE_METADATA[phase];
                const isActive = phase === currentPhase;
                const isNavigable = canNavigate(phase);
                const isCompleted = index < currentIndex;

                return (
                  <React.Fragment key={phase}>
                    <button
                      onClick={() => isNavigable && actions.advancePhase(phase)}
                      disabled={!isNavigable}
                      className={`
                        group flex items-center gap-3 px-4 py-3 min-w-[160px] max-w-[200px]
                        transition-all duration-300 text-sm font-medium
                        ${isActive 
                          ? 'glass-button-primary scale-105' 
                          : isCompleted
                          ? 'glass-card hover:glass-card-strong text-on-glass'
                          : isNavigable 
                          ? 'glass-card hover:glass-card-strong text-on-glass'
                          : 'glass-card opacity-50 cursor-not-allowed text-readable-light'
                        }
                      `}
                      title={metadata.title}
                    >
                      {/* Step Number with Glass Effect */}
                      <div className={`
                        flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold
                        backdrop-filter backdrop-blur-sm transition-all duration-300
                        ${isActive 
                          ? 'bg-white/90 text-blue-600 shadow-lg' 
                          : isCompleted
                          ? 'bg-green-500/80 text-white shadow-md'
                          : 'bg-white/60 text-gray-600'
                        }
                      `}>
                        {isCompleted && !isActive ? '✓' : index + 1}
                      </div>
                      
                      {/* Phase Name */}
                      <span className={`
                        hidden xl:block font-semibold truncate
                        ${isActive ? 'text-white' : 'text-on-glass'}
                      `}>
                        {metadata.title}
                      </span>

                      {/* Icon with Animation */}
                      <span className={`text-lg transition-transform duration-300 ${
                        isActive ? 'animate-pulse scale-110' : 'group-hover:scale-110'
                      }`}>
                        {metadata.icon}
                      </span>
                    </button>

                    {/* Connector Line with Glass Effect */}
                    {index < phases.length - 1 && (
                      <div className={`
                        w-6 h-1 flex-shrink-0 rounded-full transition-all duration-300
                        ${isCompleted ? 'bg-green-400/60 shadow-sm' : 'bg-white/30'}
                      `} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Settings Button - Glassmorphism Style */}
          <div className="flex-shrink-0">
            <button
              onClick={actions.toggleSettings}
              className="glass-button w-12 h-12 flex items-center justify-center hover:scale-105 transition-all duration-300"
              title="Settings"
            >
              <span className="text-xl">⚙️</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavigationBar;
