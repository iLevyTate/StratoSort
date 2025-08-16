import React from 'react';
import {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
} from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import UpdateIndicator from './UpdateIndicator';

function NavigationBar() {
  const { currentPhase, actions } = usePhase();

  const handlePhaseChange = (newPhase) => {
    const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
    if (allowedTransitions.includes(newPhase) || newPhase === currentPhase) {
      actions.advancePhase(newPhase);
    }
  };

  // Preserve explicit order for progress-style chips
  const phaseOrder = [
    PHASES.WELCOME,
    PHASES.SETUP,
    PHASES.DISCOVER,
    PHASES.ORGANIZE,
    PHASES.COMPLETE,
  ];
  const currentIndex = phaseOrder.indexOf(currentPhase);

  // Restrict chip labels to at most two words; prefer provided navLabel if any
  const getTwoWordLabel = (title, navLabel) => {
    if (navLabel && typeof navLabel === 'string') return navLabel;
    if (!title) return '';
    const filtered = title
      .replace(/&/g, ' ') // treat ampersand as a separator
      .split(/\s+/)
      .filter(Boolean)
      // drop common connectors to keep meaning within two words
      .filter((w) => !/^to|and|of|the|for|a|an$/i.test(w));
    return filtered.slice(0, 2).join(' ');
  };

  const isWindows =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Windows');
  return (
    <nav
      className={`glass-card border-b border-border-light px-13 py-10 sticky top-0 z-40`}
    >
      <div className="container-enhanced">
        <div className="flex items-center justify-between min-h-[56px] gap-8">
          <div className={`${' '}flex flex-1 items-center gap-13 min-w-0`}>
            <div className="flex items-center gap-5 shrink-0">
              <div className="text-[21px] animate-float">🚀</div>
              <h1 className="text-xl font-bold">
                <span className="text-gradient">StratoSort</span>
              </h1>
            </div>
            <div className="flex-1 grid grid-cols-5 gap-8 items-stretch">
              {phaseOrder.map((phase) => {
                const isActive = currentPhase === phase;
                const metadata = PHASE_METADATA[phase];
                const allowedTransitions =
                  PHASE_TRANSITIONS[currentPhase] || [];
                const canNavigate =
                  allowedTransitions.includes(phase) || isActive;
                const phaseIndex = phaseOrder.indexOf(phase);
                const isCompleted = phaseIndex < currentIndex;
                const label = getTwoWordLabel(
                  metadata.title,
                  metadata.navLabel,
                );
                return (
                  <button
                    key={phase}
                    onClick={() => handlePhaseChange(phase)}
                    disabled={!canNavigate}
                    className={`${' '}w-full h-full flex items-center justify-center gap-5 px-12 py-8 rounded-2xl text-sm font-medium transition-all min-h-[72px] ${
                      isActive
                        ? 'bg-stratosort-blue text-white shadow-sm'
                        : canNavigate
                          ? 'text-system-gray-700 hover:text-stratosort-blue hover:bg-system-gray-50'
                          : 'text-system-gray-400 cursor-not-allowed'
                    }`}
                    title={metadata.title}
                  >
                    <span className="text-lg" aria-hidden>
                      {metadata.icon}
                    </span>
                    <span
                      className="hidden sm:inline-block whitespace-normal break-normal leading-normal text-center max-w-full"
                      style={{
                        hyphens: 'none',
                        WebkitHyphens: 'none',
                        msHyphens: 'none',
                        wordBreak: 'normal',
                        overflowWrap: 'normal',
                      }}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className={`flex items-center gap-10 flex-shrink-0`}>
            {/* Auto-update banner (icon button triggers update when available) */}
            <UpdateIndicator />
            <button
              onClick={actions.toggleSettings}
              className="p-6 text-system-gray-600 hover:text-stratosort-blue hover:bg-system-gray-100 rounded-lg transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <svg
                className="w-6 h-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.607 2.296.07 2.572-1.066z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default NavigationBar;
