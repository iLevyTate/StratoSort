import React from 'react';

import { usePhase } from '../contexts/PhaseContext';
import PhaseLayout from '../layout/PhaseLayout';

const { PHASES } = require('../../shared/constants');

function CompletePhase() {
  const { actions, phaseData } = usePhase();
  const organizedFiles = phaseData.organizedFiles || [];

  return (
    <PhaseLayout>
      <div className="h-full flex flex-col items-center justify-center p-4 sm:p-8">
        {/* Success Icon */}
        <div className="mb-6">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
            <span className="text-4xl">✅</span>
          </div>
        </div>

        {/* Success Message */}
        <div className="text-center mb-8 max-w-2xl">
          <h1 className="text-heading font-bold text-on-glass mb-4">
            Organization Complete!
          </h1>
          <p className="text-body text-readable">
            {organizedFiles.length} files have been successfully organized into your smart folders.
          </p>
        </div>

        {/* Results Summary */}
        <div className="glass-card p-6 mb-8 w-full max-w-md">
          <div className="text-center">
            <div className="text-2xl font-bold text-on-glass mb-2">
              {organizedFiles.length}
            </div>
            <div className="text-caption text-readable">
              Files Organized
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
          <button 
            onClick={() => actions.advancePhase(PHASES.ORGANIZE)}
            className="btn-glass-subtle px-6 py-3 w-full sm:w-auto"
          >
            ← Back to Organize
          </button>
          <button 
            onClick={() => actions.resetWorkflow()} 
            className="btn-glass-primary px-6 py-3 w-full sm:w-auto"
          >
            🔄 Start New Session
          </button>
        </div>
      </div>
    </PhaseLayout>
  );
}

export default CompletePhase;
