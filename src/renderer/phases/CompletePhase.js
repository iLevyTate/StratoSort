import React from "react";
import { usePhase } from "../contexts/PhaseContext";
const { PHASES } = require("../../shared/constants");

function CompletePhase() {
  const { actions, phaseData } = usePhase();
  const organizedFiles = phaseData.organizedFiles || [];

  return (
    <div className="container-narrow text-center py-fib-34">
      <div className="mb-fib-21">
        <div className="text-6xl mb-fib-13">✅</div>
        <h2 className="text-2xl font-bold text-system-gray-900 mb-fib-8">
          Organization Complete!
        </h2>
        <p className="text-lg text-system-gray-600">
          Successfully organized {organizedFiles.length} files using AI-powered analysis.
        </p>
      </div>

      {organizedFiles.length > 0 && (
        <div className="card-enhanced mb-fib-21 text-left">
          <h3 className="text-lg font-semibold mb-fib-13 text-center">Organization Summary</h3>
          <div className="space-y-fib-5">
            {organizedFiles.slice(0, 5).map((file, index) => (
              <div key={index} className="text-sm">
                <span className="text-system-gray-600">✓</span> {file.originalName || `File ${index + 1}`} → {file.newLocation || 'Organized'}
              </div>
            ))}
            {organizedFiles.length > 5 && (
              <div className="text-sm text-system-gray-500 italic">
                ...and {organizedFiles.length - 5} more files
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-fib-13 mt-fib-21">
        {/* Navigation Back Options */}
        <div className="flex gap-fib-8">
          <button 
            onClick={() => actions.advancePhase(PHASES.ORGANIZE)}
            className="btn-secondary flex-1"
          >
            ← Back to Organization
          </button>
          <button 
            onClick={() => actions.advancePhase(PHASES.DISCOVER)}
            className="btn-outline flex-1"
          >
            ← Back to Discovery
          </button>
        </div>
        
        {/* New Session Options */}
        <button 
          onClick={() => actions.resetWorkflow()}
          className="btn-primary px-fib-34 py-fib-13"
        >
          🚀 Start New Organization Session
        </button>
      </div>
    </div>
  );
}

export default CompletePhase;
