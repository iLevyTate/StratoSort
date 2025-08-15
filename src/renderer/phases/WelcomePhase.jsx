import React from 'react';
import { PHASES } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import Button from '../components/ui/Button';

function WelcomePhase() {
  const { actions } = usePhase();

  return (
    <div className="container-narrow text-center py-34 animate-slide-up">
      <div className="mb-21">
        <header role="banner">
          <h1 id="welcome-heading" className="heading-primary text-center" aria-level="1">
            <span className="animate-float inline-block" role="img" aria-label="rocket">🚀</span> Welcome to{' '}
            <span className="text-gradient inline-block">StratoSort</span>
          </h1>
        </header>
        <p className="text-lg text-system-gray-600 mb-21 leading-relaxed">
          AI-powered file organization that learns your preferences and automatically sorts your files into smart folders.
        </p>
      </div>

      <div className="space-y-8 md:space-y-13 max-w-md mx-auto" role="navigation" aria-label="Main actions">
        <Button 
          onClick={() => actions.advancePhase(PHASES.DISCOVER)}
          variant="primary"
          className="text-lg px-21 py-13"
          aria-describedby="organize-help"
        >
          <span role="img" aria-label="folder">🗂️</span> Organize files (fast start)
        </Button>
        <div id="organize-help" className="text-xs text-system-gray-500 mt-3">Start now with AI analysis.</div>
        
        <Button 
          onClick={() => actions.advancePhase(PHASES.SETUP)}
          variant="secondary"
          className="text-lg px-21 py-13"
          aria-describedby="setup-help"
        >
          <span role="img" aria-label="settings">⚙️</span> Configure smart folders (recommended)
        </Button>
        <div id="setup-help" className="text-xs text-system-gray-500 mt-3">Set up folders and AI settings first.</div>
      </div>

      <div className="mt-21 bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 hover:shadow-md hover:border-border-medium transition-all duration-200 backdrop-blur-sm">
        <h3 className="heading-tertiary text-center">How StratoSort Works:</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-13 text-sm text-system-gray-600">
          <div className="text-center p-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-5 animate-bounce-subtle">🔍</div>
            <strong className="text-system-gray-700">Discover</strong><br/>
            <span className="text-muted">Select files or scan folders</span>
          </div>
          <div className="text-center p-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-5 animate-bounce-subtle" style={{animationDelay: '0.1s'}}>🧠</div>
            <strong className="text-system-gray-700">Analyze</strong><br/>
            <span className="text-muted">AI analyzes content & suggests organization</span>
          </div>
          <div className="text-center p-13 rounded-lg hover:bg-surface-secondary transition-colors duration-200">
            <div className="text-3xl mb-5 animate-bounce-subtle" style={{animationDelay: '0.2s'}}>📂</div>
            <strong className="text-system-gray-700">Organize</strong><br/>
            <span className="text-muted">Review suggestions & auto-organize files</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default WelcomePhase;


