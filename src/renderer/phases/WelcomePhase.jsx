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
      description: 'Advanced machine learning analyzes your files intelligently using local Ollama models'
    },
    {
      icon: '📁',
      title: 'Smart Organization',
      description: 'Automatically categorize and organize files by content into smart folders'
    },
    {
      icon: '⚡',
      title: 'Lightning Fast',
      description: 'Process hundreds of files in seconds with parallel analysis and batch operations'
    }
  ];

  return (
    <PhaseLayout>
      <div className="phase-content animate-fade-in-up">
        {/* Hero Section - Compact */}
        <div className="welcome-hero">
          <div className="text-4xl mb-3">🚀</div>
          <h1 className="welcome-title">Welcome to StratoSort</h1>
          <p className="welcome-subtitle">
            Transform your digital chaos into organized perfection with AI-powered file management
          </p>
        </div>

        {/* Features Grid - Compact */}
        <div className="features-grid">
          {features.map((feature, index) => (
            <div
              key={index}
              className="feature-card"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="text-xl mb-2">{feature.icon}</div>
              <h3 className="feature-title text-sm">{feature.title}</h3>
              <p className="feature-description text-xs">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Privacy & Security Note - Compact */}
        <div className="glass-card text-center max-w-lg">
          <div className="text-lg mb-1">🔒</div>
          <h3 className="text-on-glass text-sm font-bold mb-1">Privacy First</h3>
          <p className="text-readable-light text-xs">
            All file analysis happens locally on your machine using Ollama. Your files never leave your computer.
          </p>
        </div>

        {/* Action Buttons - Fixed bottom */}
        <div className="phase-actions fixed bottom-8 left-1/2 -translate-x-1/2 z-20">
          <div className="action-buttons flex flex-col sm:flex-row justify-center gap-3">
            <Button 
              variant="secondary"
              size="sm"
              onClick={handleSetupFirst}
            >
              Setup Configuration
            </Button>
            <Button 
              variant="primary"
              size="sm"
              loading={isLoading}
              onClick={handleStartOrganizing}
            >
              {isLoading ? 'Getting Ready...' : 'Organize My Files'}
            </Button>
          </div>
        </div>
      </div>
    </PhaseLayout>
  );
}

export default WelcomePhase;
