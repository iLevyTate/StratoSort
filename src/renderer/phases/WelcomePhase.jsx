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
      <div className="phase-content animate-fade-in-up">
        {/* Hero Section with Enhanced Design */}
        <div className="welcome-hero text-center mb-12">
          {/* App Icon with Animation */}
          <div className="mb-8">
            <div className="relative inline-block">
              <div className="text-7xl mb-4 animate-pulse" style={{ animationDuration: '3s' }}>
                🚀
              </div>
              <div className="absolute -inset-4 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full opacity-20 blur-xl animate-pulse" />
            </div>
          </div>

          {/* Main Title with Enhanced Typography */}
          <h1 className="welcome-title text-5xl font-black mb-6 leading-tight">
            Welcome to{' '}
            <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              StratoSort
            </span>
          </h1>

          {/* Subtitle with Better Readability */}
          <p className="welcome-subtitle text-xl mb-8 max-w-2xl mx-auto leading-relaxed font-medium">
            Transform your digital chaos into organized perfection with{' '}
            <span className="text-white font-semibold">AI-powered file management</span>
          </p>

          {/* Stats Row */}
          <div className="flex justify-center gap-8 mb-8">
            {stats.map((stat, index) => (
              <div
                key={index}
                className="glass-card text-center px-6 py-4 min-w-[120px] hover:scale-105 transition-transform duration-300"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-2xl font-bold text-on-glass mb-1">{stat.number}</div>
                <div className="text-sm text-readable-light font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Features Grid with Enhanced Cards */}
        <div className="features-grid mb-12">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative overflow-hidden"
              style={{ animationDelay: `${index * 0.15}s` }}
            >
              {/* Background Gradient */}
              <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-300`} />
              
              {/* Feature Card */}
              <div className="feature-card relative z-10 h-full p-8 text-center group-hover:scale-[1.02] transition-all duration-300">
                {/* Icon with Enhanced Styling */}
                <div className="relative mb-6">
                  <div className="text-4xl mb-2 group-hover:scale-110 transition-transform duration-300">
                    {feature.icon}
                  </div>
                  <div className={`absolute -inset-2 bg-gradient-to-r ${feature.gradient} rounded-full opacity-0 group-hover:opacity-20 blur-lg transition-opacity duration-300`} />
                </div>

                {/* Title */}
                <h3 className="feature-title text-lg font-bold mb-4 group-hover:text-white transition-colors duration-300">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="feature-description text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Privacy & Security Section with Enhanced Design */}
        <div className="glass-card-strong text-center max-w-3xl mx-auto mb-12 p-8">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="text-3xl">🔒</div>
              <div className="absolute -inset-2 bg-green-500 rounded-full opacity-20 blur-lg animate-pulse" />
            </div>
          </div>
          
          <h3 className="text-on-glass text-2xl font-bold mb-4">Privacy-First Architecture</h3>
          
          <p className="text-readable-light text-base leading-relaxed mb-6">
            All file analysis happens locally on your machine using{' '}
            <span className="font-semibold text-blue-200">Ollama AI models</span>.{' '}
            Your files never leave your computer, ensuring complete privacy and security.
          </p>

          {/* Privacy Features */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center justify-center gap-2 text-readable-light">
              <span className="text-green-400">✓</span>
              <span>Local Processing</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-readable-light">
              <span className="text-green-400">✓</span>
              <span>No Data Upload</span>
            </div>
            <div className="flex items-center justify-center gap-2 text-readable-light">
              <span className="text-green-400">✓</span>
              <span>Open Source</span>
            </div>
          </div>
        </div>

        {/* Enhanced Action Buttons */}
        <div className="phase-actions">
          <div className="action-buttons flex flex-col sm:flex-row gap-4 items-center justify-center">
            <Button 
              variant="secondary"
              size="lg"
              onClick={handleSetupFirst}
              className="min-w-[200px] group"
              icon="⚙️"
            >
              <span className="group-hover:scale-105 transition-transform duration-200">
                Setup Configuration
              </span>
            </Button>
            
            <Button 
              variant="primary"
              size="lg"
              loading={isLoading}
              onClick={handleStartOrganizing}
              className="min-w-[200px] bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 group"
              icon={!isLoading ? "🚀" : undefined}
            >
              <span className="group-hover:scale-105 transition-transform duration-200">
                {isLoading ? 'Getting Ready...' : 'Organize My Files Now'}
              </span>
            </Button>
          </div>

          {/* Helpful Hint */}
          <div className="mt-6 text-center">
            <p className="text-sm text-white/70 font-medium">
              💡 First time? Start with{' '}
              <button 
                onClick={handleSetupFirst}
                className="underline hover:text-white transition-colors duration-200"
              >
                Setup Configuration
              </button>{' '}
              to configure your AI models
            </p>
          </div>
        </div>
      </div>
    </PhaseLayout>
  );
}

export default WelcomePhase;
