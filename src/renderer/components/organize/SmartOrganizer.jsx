import React, { useState, useEffect } from 'react';
import { Card, Button } from '../ui';
import OrganizationSuggestions from './OrganizationSuggestions';
import BatchOrganizationSuggestions from './BatchOrganizationSuggestions';
import OrganizationPreview from './OrganizationPreview';
import FolderImprovementSuggestions from './FolderImprovementSuggestions';

/**
 * SmartOrganizer - Simplified, intuitive interface for file organization
 * Guides users through the organization process with clear steps
 */
function SmartOrganizer({
  files = [],
  smartFolders = [],
  onOrganize,
  onCancel,
}) {
  const [currentStep, setCurrentStep] = useState('analyze');
  const [suggestions, setSuggestions] = useState({});
  const [batchSuggestions, setBatchSuggestions] = useState(null);
  const [folderImprovements, setFolderImprovements] = useState([]);
  const [acceptedSuggestions, setAcceptedSuggestions] = useState({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [mode, setMode] = useState('quick'); // 'quick' or 'detailed'

  useEffect(() => {
    if (files.length > 0) {
      analyzeFiles();
    }
  }, [files]);

  const analyzeFiles = async () => {
    setIsAnalyzing(true);
    try {
      // Get suggestions for all files
      if (files.length === 1) {
        // Single file mode
        const result = await window.electronAPI.suggestions.getFileSuggestions(
          files[0],
          { includeAlternatives: true },
        );
        setSuggestions({ [files[0].path]: result });
      } else {
        // Batch mode
        const batchResult =
          await window.electronAPI.suggestions.getBatchSuggestions(files, {
            analyzePatterns: true,
          });
        setBatchSuggestions(batchResult);
      }

      // Get folder improvement suggestions
      const improvements =
        await window.electronAPI.suggestions.analyzeFolderStructure(files);
      setFolderImprovements(improvements.improvements || []);
    } catch (error) {
      console.error('Failed to analyze files:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleQuickOrganize = () => {
    // Apply all high-confidence suggestions
    const highConfidenceSuggestions = {};

    if (files.length === 1) {
      const suggestion = suggestions[files[0].path];
      if (suggestion?.confidence >= 0.8) {
        highConfidenceSuggestions[files[0].path] = suggestion.primary;
      }
    } else if (batchSuggestions) {
      batchSuggestions.groups.forEach((group) => {
        if (group.confidence >= 0.8) {
          group.files.forEach((file) => {
            highConfidenceSuggestions[file.path] = group.folder;
          });
        }
      });
    }

    setAcceptedSuggestions(highConfidenceSuggestions);
    setCurrentStep('preview');
  };

  const handleAcceptSuggestion = (file, suggestion) => {
    setAcceptedSuggestions((prev) => ({
      ...prev,
      [file.path]: suggestion,
    }));

    // Record feedback for learning
    window.electronAPI.suggestions.recordFeedback(file, suggestion, true);
  };

  const handleRejectSuggestion = (file, suggestion) => {
    // Record feedback for learning
    window.electronAPI.suggestions.recordFeedback(file, suggestion, false);
  };

  const handleConfirmOrganization = () => {
    if (onOrganize) {
      onOrganize(acceptedSuggestions);
    }
  };

  const getStepIndicator = () => {
    const steps = [
      { id: 'analyze', label: 'Analyze', icon: '🔍' },
      { id: 'review', label: 'Review', icon: '👀' },
      { id: 'preview', label: 'Preview', icon: '📋' },
      { id: 'organize', label: 'Organize', icon: '✅' },
    ];

    return (
      <div className="flex items-center justify-center mb-6">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div
              className={`flex items-center justify-center w-10 h-10 rounded-full ${
                currentStep === step.id
                  ? 'bg-stratosort-blue text-white'
                  : 'bg-gray-200 text-gray-600'
              }`}
            >
              <span>{step.icon}</span>
            </div>
            <div className="ml-2 mr-4">
              <span
                className={`text-sm ${
                  currentStep === step.id ? 'font-bold' : ''
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className="w-8 h-0.5 bg-gray-300 mr-4" />
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header with Mode Toggle */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-system-gray-900">
            Smart File Organizer
          </h2>
          <p className="text-sm text-system-gray-600 mt-1">
            {files.length} file{files.length !== 1 ? 's' : ''} ready to organize
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-system-gray-600">Mode:</span>
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              className={`px-3 py-1 text-sm rounded ${
                mode === 'quick'
                  ? 'bg-white text-stratosort-blue font-medium shadow-sm'
                  : 'text-gray-600'
              }`}
              onClick={() => setMode('quick')}
            >
              ⚡ Quick
            </button>
            <button
              className={`px-3 py-1 text-sm rounded ${
                mode === 'detailed'
                  ? 'bg-white text-stratosort-blue font-medium shadow-sm'
                  : 'text-gray-600'
              }`}
              onClick={() => setMode('detailed')}
            >
              🔍 Detailed
            </button>
          </div>
        </div>
      </div>

      {/* Step Indicator */}
      {getStepIndicator()}

      {/* Content based on current step */}
      {currentStep === 'analyze' && (
        <Card className="p-6">
          {isAnalyzing ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-stratosort-blue mx-auto mb-4"></div>
              <p className="text-system-gray-600">Analyzing your files...</p>
              <p className="text-sm text-system-gray-500 mt-2">
                Finding the best organization strategy
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎯</div>
              <h3 className="text-xl font-medium mb-2">Ready to Organize!</h3>
              <p className="text-system-gray-600 mb-6">
                {mode === 'quick'
                  ? "We'll automatically organize files with high confidence matches"
                  : "You'll review each suggestion before organizing"}
              </p>

              <div className="flex gap-3 justify-center">
                {mode === 'quick' ? (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleQuickOrganize}
                    className="bg-stratosort-blue hover:bg-stratosort-blue/90"
                  >
                    ⚡ Quick Organize
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => setCurrentStep('review')}
                    className="bg-stratosort-blue hover:bg-stratosort-blue/90"
                  >
                    Review Suggestions
                  </Button>
                )}
                <Button variant="secondary" size="lg" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {currentStep === 'review' && (
        <div className="space-y-4">
          {/* Folder Health Check */}
          {folderImprovements.length > 0 && (
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <div className="flex items-start gap-3">
                <span className="text-2xl">💡</span>
                <div className="flex-1">
                  <h4 className="font-medium text-system-gray-900">
                    Folder Structure Improvements Available
                  </h4>
                  <p className="text-sm text-system-gray-600 mt-1">
                    We found {folderImprovements.length} way
                    {folderImprovements.length !== 1 ? 's' : ''} to improve your
                    organization
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => console.log('Show improvements')}
                  >
                    View Improvements
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* File Suggestions */}
          {files.length === 1 ? (
            <OrganizationSuggestions
              file={files[0]}
              suggestions={suggestions[files[0].path]}
              onAccept={handleAcceptSuggestion}
              onReject={handleRejectSuggestion}
            />
          ) : (
            <BatchOrganizationSuggestions
              batchSuggestions={batchSuggestions}
              onAcceptStrategy={(strategy) => {
                // Apply strategy to all files
                console.log('Applying strategy:', strategy);
                setCurrentStep('preview');
              }}
              onCustomizeGroup={(groupIndex, group) => {
                console.log('Customizing group:', groupIndex, group);
              }}
              onRejectAll={onCancel}
            />
          )}

          <div className="flex justify-between pt-4">
            <Button variant="ghost" onClick={() => setCurrentStep('analyze')}>
              ← Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setCurrentStep('preview')}
              className="bg-stratosort-blue hover:bg-stratosort-blue/90"
            >
              Preview Organization →
            </Button>
          </div>
        </div>
      )}

      {currentStep === 'preview' && (
        <div>
          <OrganizationPreview
            files={files}
            strategy={batchSuggestions?.suggestedStrategy}
            suggestions={acceptedSuggestions}
            onConfirm={handleConfirmOrganization}
            onCancel={() => setCurrentStep('review')}
          />
        </div>
      )}

      {/* Quick Tips */}
      {currentStep === 'analyze' && !isAnalyzing && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="flex items-start gap-3">
            <span className="text-xl">💡</span>
            <div>
              <h4 className="font-medium text-blue-900">Pro Tip</h4>
              <p className="text-sm text-blue-700 mt-1">
                {mode === 'quick'
                  ? 'Quick mode automatically organizes files with confidence scores above 80%. Perfect for routine cleanup!'
                  : 'Detailed mode lets you review every suggestion. Great for important files or learning the system.'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Stats Bar */}
      {(suggestions || batchSuggestions) && (
        <div className="flex items-center justify-between text-sm text-system-gray-600 pt-4 border-t">
          <div className="flex items-center gap-4">
            <span>📊 Accuracy: {calculateAverageConfidence()}%</span>
            <span>📁 {smartFolders.length} Smart Folders</span>
            <span>✅ {Object.keys(acceptedSuggestions).length} Accepted</span>
          </div>
          <div className="text-xs">The system learns from your choices</div>
        </div>
      )}
    </div>
  );

  function calculateAverageConfidence() {
    if (files.length === 1) {
      const suggestion = suggestions[files[0].path];
      return suggestion ? Math.round(suggestion.confidence * 100) : 0;
    } else if (batchSuggestions) {
      const avg =
        batchSuggestions.groups.reduce(
          (sum, group) => sum + group.confidence,
          0,
        ) / batchSuggestions.groups.length;
      return Math.round(avg * 100);
    }
    return 0;
  }
}

export default SmartOrganizer;
