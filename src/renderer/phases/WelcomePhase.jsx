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
      icon: '🤖',
      title: 'AI-Powered Analysis',
      description: 'Advanced machine learning analyzes your files intelligently using local Ollama models',
      gradient: 'from-blue-400 to-purple-500'
    },
    {
      icon: '📁',
      title: 'Smart Organization',
      description: 'Automatically categorize and organize files by content into smart folders',
      gradient: 'from-green-400 to-blue-500'
    },
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Process hundreds of files in seconds with parallel analysis and batch operations',
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
        {/* Header Section - Fixed Height */}
        <div className="welcome-header flex-shrink-0 text-center py-2 sm:py-3">
          {/* App Icon with Animation */}
          <div className="mb-2 sm:mb-3">
            <div className="relative inline-block">
              <div className="text-3xl sm:text-4xl mb-1 sm:mb-2 animate-pulse" style={{ animationDuration: '3s' }}>
                🚀
              </div>
              <div className="absolute -inset-2 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full opacity-20 blur-lg animate-pulse" />
            </div>
          </div>

          {/* Main Title with Fixed Gradient Text */}
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black mb-2 sm:mb-3 leading-tight text-white">
            Welcome to{' '}
            <span className="stratosort-gradient-text">
              StratoSort
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-sm sm:text-base mb-2 sm:mb-3 max-w-xl mx-auto leading-relaxed font-medium text-white/95 px-4">
            Transform your digital chaos into organized perfection with{' '}
            <span className="text-white font-semibold">AI-powered file management</span>
          </p>
        </div>

        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-2 sm:px-4">
          <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
            {/* Stats Row */}
            <div className="flex justify-center gap-2 sm:gap-4 lg:gap-6 flex-wrap">
              {stats.map((stat, index) => (
                <div
                  key={index}
                  className="glass-card text-center px-3 sm:px-4 py-2 sm:py-3 min-w-[80px] sm:min-w-[90px] hover:scale-105 transition-transform duration-300 flex-shrink-0"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="text-base sm:text-lg lg:text-xl mb-1">{stat.icon}</div>
                  <div className="text-base sm:text-lg lg:text-xl font-bold text-on-glass mb-1">{stat.number}</div>
                  <div className="text-xs sm:text-sm text-readable-light font-medium">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Features Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="group relative overflow-hidden"
                  style={{ animationDelay: `${index * 0.15}s` }}
                >
                  {/* Background Gradient */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
                  
                  {/* Feature Card */}
                  <div className="feature-card relative z-10 h-full p-4 sm:p-5 lg:p-6 text-center group-hover:scale-[1.02] transition-all duration-300 min-h-[140px] sm:min-h-[160px]">
                    {/* Icon */}
                    <div className="relative mb-3 sm:mb-4">
                      <div className="text-2xl sm:text-3xl mb-2 group-hover:scale-110 transition-transform duration-300">
                        {feature.icon}
                      </div>
                      <div className={`absolute -inset-2 bg-gradient-to-r ${feature.gradient} rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300`} />
                    </div>

                    {/* Title */}
                    <h3 className="feature-title text-sm sm:text-base font-bold mb-2 group-hover:text-white transition-colors duration-300">
                      {feature.title}
                    </h3>

                    {/* Description */}
                    <p className="feature-description text-xs sm:text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Privacy & Security Section */}
            <div className="glass-card-strong text-center max-w-2xl mx-auto p-4 sm:p-6">
              <div className="flex items-center justify-center mb-3 sm:mb-4">
                <div className="relative">
                  <div className="text-xl sm:text-2xl">🔒</div>
                  <div className="absolute -inset-2 bg-green-500 rounded-full opacity-20 blur-lg animate-pulse" />
                </div>
              </div>
              
              <h3 className="text-on-glass text-base sm:text-lg lg:text-xl font-bold mb-2 sm:mb-3">Privacy-First Architecture</h3>
              
              <p className="text-readable-light text-xs sm:text-sm leading-relaxed mb-3 sm:mb-4">
                All file analysis happens locally on your machine using{' '}
                <span className="font-semibold text-blue-200">Ollama AI models</span>.{' '}
                Your files never leave your computer, ensuring complete privacy and security.
              </p>

              {/* Privacy Features */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs sm:text-sm">
                <div className="flex items-center justify-center gap-2 text-readable-light">
                  <span className="text-green-400 text-sm">✓</span>
                  <span>Local Processing</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-readable-light">
                  <span className="text-green-400 text-sm">✓</span>
                  <span>No Data Upload</span>
                </div>
                <div className="flex items-center justify-center gap-2 text-readable-light">
                  <span className="text-green-400 text-sm">✓</span>
                  <span>Open Source</span>
                </div>
              </div>
            </div>

            {/* Helpful Hint */}
            <div className="text-center py-2">
              <p className="text-xs sm:text-sm text-white/70 font-medium">
                💡 First time? Start with{' '}
                <button 
                  onClick={handleSetupFirst}
                  className="underline hover:text-white transition-colors duration-200 hover:no-underline"
                >
                  Setup Configuration
                </button>{' '}
                to configure your AI models
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons - Fixed at bottom */}
        <div className="welcome-actions flex-shrink-0 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row gap-3 items-center justify-center px-4">
            <Button 
              variant="secondary"
              size="md"
              onClick={handleSetupFirst}
              className="w-full sm:w-auto min-w-[160px] sm:min-w-[180px]"
              icon="⚙️"
            >
              Setup Configuration
            </Button>
            
            <Button 
              variant="primary"
              size="md"
              loading={isLoading}
              onClick={handleStartOrganizing}
              className="w-full sm:w-auto min-w-[160px] sm:min-w-[180px] bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30"
              icon={!isLoading ? "🚀" : undefined}
            >
              {isLoading ? 'Getting Ready...' : 'Organize My Files Now'}
            </Button>
          </div>
        </div>
      </div>
    </PhaseLayout>
  );
}

export default WelcomePhase;
