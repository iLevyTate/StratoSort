import React, { useState } from 'react';

import { useNotification } from '../contexts/NotificationContext';
import { usePhase } from '../contexts/PhaseContext';
import Button from '../components/Button';
import PhaseLayout from '../layout/PhaseLayout';

const { PHASES } = require('../../shared/constants');

function WelcomePhase() {
  const { actions } = usePhase();
  const { showSuccess } = useNotification();

  const [isLoading, setIsLoading] = useState(false);

  const handleStartOrganizing = async () => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      showSuccess('Welcome to StratoSort! Let\'s get started.');
      actions.advancePhase(PHASES.DISCOVER);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetupFirst = () => {
    actions.advancePhase(PHASES.SETUP);
  };

  const features = [
    {
      icon: '��',
      title: 'AI Analysis',
      description: 'Local Ollama models analyze files intelligently',
      gradient: 'from-blue-400 to-purple-500'
    },
    {
      icon: '📁',
      title: 'Smart Folders',
      description: 'Auto-categorize by content into organized folders',
      gradient: 'from-green-400 to-blue-500'
    },
    {
      icon: '⚡',
      title: 'Fast Processing',
      description: 'Batch operations with parallel analysis',
      gradient: 'from-yellow-400 to-orange-500'
    }
  ];

  const stats = [
    { number: '91+', label: 'File Types', icon: '📄' },
    { number: '100%', label: 'Privacy', icon: '🔒' },
    { number: '3x', label: 'Faster', icon: '⚡' }
  ];

  return (
    <PhaseLayout>
      <div className="phase-content-compact animate-fade-in-up">
        {/* Compact Header */}
        <div className="welcome-header-compact flex-shrink-0 text-center py-1 sm:py-2">
          {/* Title with Gradient */}
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-black mb-1 sm:mb-2 leading-tight text-white">
            Welcome to{' '}
            <span className="stratosort-gradient-text">StratoSort</span>
          </h1>

          {/* Compact Subtitle */}
          <p className="text-xs sm:text-sm mb-2 max-w-lg mx-auto leading-relaxed font-medium text-white/90 px-4">
            AI-powered file organization with{' '}
            <span className="text-white font-semibold">complete privacy</span>
          </p>
        </div>

        {/* Ultra Compact Content */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4">
          <div className="max-w-4xl mx-auto space-y-2 sm:space-y-3">
            
            {/* Inline Stats & Features Combined */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-2 sm:gap-3">
              
              {/* Stats Column */}
              <div className="lg:col-span-1">
                <div className="grid grid-cols-3 lg:grid-cols-1 gap-2">
                  {stats.map((stat, index) => (
                    <div
                      key={index}
                      className="glass-card-compact text-center p-2 hover:scale-105 transition-transform duration-300"
                      style={{ animationDelay: `${index * 0.1}s` }}
                    >
                      <div className="text-sm sm:text-base mb-1">{stat.icon}</div>
                      <div className="text-sm sm:text-base font-bold text-on-glass">{stat.number}</div>
                      <div className="text-xs text-readable-light font-medium">{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Features Column */}
              <div className="lg:col-span-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {features.map((feature, index) => (
                    <div
                      key={index}
                      className="group relative overflow-hidden"
                      style={{ animationDelay: `${index * 0.15}s` }}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
                      
                      <div className="feature-card-compact relative z-10 h-full p-3 sm:p-4 text-center group-hover:scale-[1.02] transition-all duration-300">
                        {/* Icon */}
                        <div className="relative mb-2">
                          <div className="text-lg sm:text-xl mb-1 group-hover:scale-110 transition-transform duration-300">
                            {feature.icon}
                          </div>
                          <div className={`absolute -inset-1 bg-gradient-to-r ${feature.gradient} rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300`} />
                        </div>

                        {/* Title */}
                        <h3 className="feature-title text-xs sm:text-sm font-bold mb-1 group-hover:text-white transition-colors duration-300">
                          {feature.title}
                        </h3>

                        {/* Description */}
                        <p className="feature-description text-xs leading-tight">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Compact Privacy Section */}
            <div className="glass-card-compact text-center p-3 sm:p-4">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="relative">
                  <div className="text-lg sm:text-xl">🔒</div>
                  <div className="absolute -inset-1 bg-green-500 rounded-full opacity-20 blur-sm animate-pulse" />
                </div>
                
                <div className="text-left">
                  <h3 className="text-on-glass text-sm sm:text-base font-bold">Privacy-First</h3>
                  <p className="text-readable-light text-xs leading-tight">
                    All processing happens locally with <span className="font-semibold text-blue-200">Ollama AI</span>
                  </p>
                </div>
              </div>

              {/* Compact Privacy Features */}
              <div className="flex justify-center gap-4 text-xs">
                <div className="flex items-center gap-1 text-readable-light">
                  <span className="text-green-400">✓</span>
                  <span>Local Only</span>
                </div>
                <div className="flex items-center gap-1 text-readable-light">
                  <span className="text-green-400">✓</span>
                  <span>No Upload</span>
                </div>
                <div className="flex items-center gap-1 text-readable-light">
                  <span className="text-green-400">✓</span>
                  <span>Open Source</span>
                </div>
              </div>
            </div>

            {/* Compact Hint */}
            <div className="text-center">
              <p className="text-xs text-white/70 font-medium">
                💡 New user? Try{' '}
                <button 
                  onClick={handleSetupFirst}
                  className="underline hover:text-white transition-colors duration-200 hover:no-underline"
                >
                  Setup
                </button>{' '}
                first
              </p>
            </div>
          </div>
        </div>

        {/* Compact Action Buttons */}
        <div className="welcome-actions-compact flex-shrink-0 py-2 sm:py-3">
          <div className="flex flex-col sm:flex-row gap-2 items-center justify-center px-4">
            <Button 
              variant="secondary"
              size="sm"
              onClick={handleSetupFirst}
              className="w-full sm:w-auto min-w-[140px]"
              icon="⚙️"
            >
              Setup
            </Button>
            
            <Button 
              variant="primary"
              size="sm"
              loading={isLoading}
              onClick={handleStartOrganizing}
              className="w-full sm:w-auto min-w-[140px] bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25"
              icon={!isLoading ? "🚀" : undefined}
            >
              {isLoading ? 'Starting...' : 'Organize Files'}
            </Button>
          </div>
        </div>
      </div>
    </PhaseLayout>
  );
}

export default WelcomePhase;
