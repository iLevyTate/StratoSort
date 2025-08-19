import React, { useState, useEffect } from 'react';
import {
  PHASES,
  PHASE_TRANSITIONS,
  PHASE_METADATA,
} from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import UpdateIndicator from './UpdateIndicator';

// Phase Icons
const HomeIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
);

const CogIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
      clipRule="evenodd"
    />
  </svg>
);

const SearchIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
      clipRule="evenodd"
    />
  </svg>
);

const FolderIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

const CheckCircleIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
      clipRule="evenodd"
    />
  </svg>
);

// Map phases to their icons
const phaseIcons = {
  [PHASES.WELCOME]: HomeIcon,
  [PHASES.SETUP]: CogIcon,
  [PHASES.DISCOVER]: SearchIcon,
  [PHASES.ORGANIZE]: FolderIcon,
  [PHASES.COMPLETE]: CheckCircleIcon,
};

// Settings Icon SVG Component
const SettingsIcon = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12A3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5a3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97c0-.33-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.39-1.06-.73-1.69-.98l-.37-2.65A.506.506 0 0 0 14 2h-4c-.25 0-.46.18-.5.42l-.37 2.65c-.63.25-1.17.59-1.69.98l-2.49-1c-.22-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1c0 .33.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.06.74 1.69.99l.37 2.65c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.37-2.65c.63-.26 1.17-.59 1.69-.99l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z" />
  </svg>
);

function NavigationBar() {
  const { currentPhase, actions } = usePhase();
  const [isScrolled, setIsScrolled] = useState(false);
  const [hoveredTab, setHoveredTab] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handlePhaseChange = (newPhase) => {
    const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
    if (allowedTransitions.includes(newPhase) || newPhase === currentPhase) {
      actions.advancePhase(newPhase);
    }
  };

  const phaseOrder = [
    PHASES.WELCOME,
    PHASES.SETUP,
    PHASES.DISCOVER,
    PHASES.ORGANIZE,
    PHASES.COMPLETE,
  ];

  const getTwoWordLabel = (title, navLabel) => {
    if (navLabel && typeof navLabel === 'string') return navLabel;
    if (!title) return '';
    const filtered = title
      .replace(/&/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter((w) => !/^to|and|of|the|for|a|an$/i.test(w));
    return filtered.slice(0, 2).join(' ');
  };

  return (
    <div
      className={`
        fixed top-0 left-0 right-0 z-[1300]
        backdrop-blur-xl backdrop-saturate-[180%]
        border-b transition-all duration-300 ease-smooth
        ${
          isScrolled
            ? 'bg-white/95 border-border-medium shadow-lg'
            : 'bg-white/85 border-border-light shadow-md'
        }
      `}
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="relative flex items-center justify-between min-h-[68px] px-6">
        {/* Animated gradient line at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gradient-primary-start/30 to-transparent animate-shimmer" />
        {/* Logo and Brand */}
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <h1
            className="
            text-lg font-semibold tracking-tight select-none
            bg-gradient-to-r from-gradient-primary-start to-gradient-primary-end
            bg-clip-text text-transparent
          "
          >
            StratoSort
          </h1>
        </div>
        {/* Navigation Tabs - Centered */}
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <div className="flex items-center gap-4 relative">
            {phaseOrder.map((phase) => {
              const metadata = PHASE_METADATA[phase];
              const allowedTransitions = PHASE_TRANSITIONS[currentPhase] || [];
              const canNavigate =
                allowedTransitions.includes(phase) || phase === currentPhase;
              const label = getTwoWordLabel(metadata.title, metadata.navLabel);
              const isActive = phase === currentPhase;
              const isHovered = hoveredTab === phase;
              const IconComponent = phaseIcons[phase];

              return (
                <button
                  key={phase}
                  onClick={() => canNavigate && handlePhaseChange(phase)}
                  onMouseEnter={() => setHoveredTab(phase)}
                  onMouseLeave={() => setHoveredTab(null)}
                  disabled={!canNavigate}
                  className={`
                    relative px-4 py-2.5 min-h-[42px]
                    rounded-xl transition-all duration-200 ease-out
                    flex items-center gap-2.5
                    ${
                      isActive
                        ? 'text-gradient-primary-start font-medium bg-white shadow-sm border border-gradient-primary-start/20'
                        : canNavigate
                          ? 'text-system-gray-600 hover:text-gradient-primary-start hover:bg-white/60 hover:shadow-sm hover:border hover:border-gradient-primary-start/10'
                          : 'text-system-gray-400 cursor-not-allowed opacity-50'
                    }
                  `}
                  aria-label={metadata.title}
                  title={metadata.description || metadata.title}
                >
                  {IconComponent && (
                    <IconComponent
                      className={`
                        w-4 h-4 flex-shrink-0 transition-all duration-200
                        ${
                          isActive
                            ? 'text-gradient-primary-start'
                            : isHovered && canNavigate
                              ? 'text-gradient-primary-start'
                              : 'text-current opacity-70'
                        }
                      `}
                    />
                  )}
                  <span className="text-sm font-medium transition-all duration-200">
                    {label}
                  </span>
                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-gradient-primary-start rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {/* Right side controls */}
        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' }}
        >
          <UpdateIndicator />
          <button
            onClick={actions.toggleSettings}
            className="
              w-10 h-10 rounded-xl
              bg-white/70 backdrop-blur-sm
              border border-border-light
              text-system-gray-600
              flex items-center justify-center
              transition-all duration-200 ease-out
              hover:bg-white
              hover:text-gradient-primary-start
              hover:border-gradient-primary-start/30
              hover:shadow-md
              hover:rotate-90
              active:scale-95
              group
            "
            aria-label="Open Settings"
            title="Settings"
          >
            <SettingsIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default NavigationBar;
