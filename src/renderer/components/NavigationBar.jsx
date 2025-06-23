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
    <nav className="glass-card border-0 rounded-none shadow-lg backdrop-blur-lg bg-white/10 navigation-container">
      <div className="px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-1 sm:gap-2">
          {/* Logo - Compact */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-1 sm:gap-2">
              <div className="w-8 h-8 glass-card flex items-center justify-center shadow-lg">
                <span className="text-sm">🚀</span>
              </div>
              <h1 className="text-xs sm:text-sm font-bold text-on-glass hidden md:block">
                StratoSort
              </h1>
            </div>
          </div>

          {/* Phase Navigation - Much Smaller */}
          <div className="flex-1 overflow-x-auto nav-scroll-container">
            <div className="flex items-center justify-center gap-1 min-w-fit px-1">
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
                        group flex items-center gap-1 px-1 py-1 sm:px-2 sm:py-2
                        min-w-[50px] sm:min-w-[70px] md:min-w-[90px] lg:min-w-[110px]
                        max-w-[60px] sm:max-w-[80px] md:max-w-[100px] lg:max-w-[130px]
                        transition-all duration-300 text-xs font-medium rounded-lg
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
                      {/* Step Number - Smaller */}
                      <div className={`
                        flex-shrink-0 flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 rounded-full text-xs font-bold
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
                      
                      {/* Phase Name - Hidden on small screens */}
                      <span className={`
                        hidden lg:block font-semibold truncate text-xs
                        ${isActive ? 'text-white' : 'text-on-glass'}
                      `}>
                        {metadata.title.split(' ')[0]}
                      </span>

                      {/* Icon - Smaller */}
                      <span className={`text-xs sm:text-sm transition-transform duration-300 ${
                        isActive ? 'animate-pulse scale-110' : 'group-hover:scale-110'
                      }`}>
                        {metadata.icon}
                      </span>
                    </button>

                    {/* Connector Line - Much Smaller */}
                    {index < phases.length - 1 && (
                      <div className={`
                        w-2 sm:w-3 h-0.5 flex-shrink-0 rounded-full transition-all duration-300
                        ${isCompleted ? 'bg-green-400/60 shadow-sm' : 'bg-white/30'}
                      `} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Settings Button - Smaller */}
          <div className="flex-shrink-0">
            <button
              onClick={actions.toggleSettings}
              className="glass-button w-8 h-8 flex items-center justify-center hover:scale-105 transition-all duration-300"
              title="Settings"
            >
              <span className="text-sm">⚙️</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavigationBar;
