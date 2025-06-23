import React from "react";
import { usePhase } from "../contexts/PhaseContext";
const { PHASES } = require("../../shared/constants");

function CompletePhase() {
  const { actions, phaseData } = usePhase();
  const organizedFiles = phaseData.organizedFiles || [];

  return (
    <div className="phase-container">
      <div className="phase-content animate-fade-in-up">
        {/* Hero Section */}
        <div className="welcome-hero">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="welcome-title">Organization Complete!</h1>
          <p className="welcome-subtitle">
            Successfully organized {organizedFiles.length} files using AI-powered analysis
          </p>
        </div>

        {organizedFiles.length > 0 && (
          <div className="glass-card p-8 mb-8 text-left max-w-2xl">
            <h3 className="text-on-glass text-xl font-bold mb-6 text-center">Organization Summary</h3>
            <div className="space-y-3">
              {organizedFiles.slice(0, 5).map((file, index) => (
                <div key={index} className="flex items-center space-x-3 text-readable">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-sm">
                    <span className="font-medium">{file.originalName || `File ${index + 1}`}</span>
                    <span className="text-readable-light"> → {file.newLocation || 'Organized'}</span>
                  </span>
                </div>
              ))}
              {organizedFiles.length > 5 && (
                <div className="text-sm text-readable-light italic text-center pt-2">
                  ...and {organizedFiles.length - 5} more files
                </div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <button 
            onClick={() => actions.advancePhase(PHASES.ORGANIZE)}
            className="action-button"
          >
            ← Back to Organization
          </button>
          <button 
            onClick={() => actions.resetWorkflow()}
            className="action-button-primary"
          >
            🚀 Start New Session
          </button>
        </div>
      </div>
    </div>
  );
}

export default CompletePhase;
