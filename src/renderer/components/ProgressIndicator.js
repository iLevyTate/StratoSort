import React from "react";
import { usePhase } from "../contexts/PhaseContext";
const { PHASES } = require("../../shared/constants");

function ProgressIndicator() {
  const { currentPhase, getCurrentMetadata } = usePhase();
  const metadata = getCurrentMetadata();
  
  const phases = Object.values(PHASES);
  const currentIndex = phases.indexOf(currentPhase);
  
  return (
    <div className="bg-surface-secondary/50 border-b border-border-light px-fib-21 py-fib-8 backdrop-blur-sm">
      <div className="container-enhanced">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-fib-8">
            <span className="text-2xl">{metadata.icon}</span>
            <div>
              <div className="font-semibold text-system-gray-900">{metadata.title}</div>
              <div className="text-sm text-system-gray-600">Step {currentIndex + 1} of {phases.length}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-fib-13">
            {/* Progress Bar */}
            <div className="flex items-center gap-fib-8">
              <div className="text-sm text-system-gray-600">{metadata.progress}%</div>
              <div className="w-32 h-2 bg-system-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-stratosort-blue transition-all duration-500"
                  style={{ width: `${metadata.progress}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProgressIndicator;
