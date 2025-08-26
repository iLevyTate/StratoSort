import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PHASES } from '../../shared/constants';
import { usePhase } from '../contexts/PhaseContext';
import { useNotification } from '../contexts/NotificationContext';
import Button from '../components/ui/Button';
import Card, { CardHeader, CardBody } from '../components/ui/Card';

function AISetupPhase() {
  const { actions } = usePhase();
  const { showInfo, showWarning, showError, showSuccess } = useNotification();

  const [aiStatus, setAiStatus] = useState('checking'); // checking, ready, error, skipped
  const [missingModels, setMissingModels] = useState([]);
  const [installationCommands, setInstallationCommands] = useState([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [skipVerification, setSkipVerification] = useState(false);

  const handleAiStatusUpdate = useCallback(
    (event, data) => {
      setAiStatus(data.status);

      if (data.status === 'models_missing') {
        setMissingModels(data.missingModels || []);
        setInstallationCommands(data.installationCommands || []);
        showWarning(
          `Missing ${data.missingModels?.length || 0} AI models`,
          10000,
        );
      } else if (data.status === 'ready') {
        setMissingModels([]);
        setInstallationCommands([]);
        showSuccess('AI models are ready!', 5000);
      } else if (data.status === 'error') {
        setMissingModels([]);
        setInstallationCommands([]);
        showError(data.error || 'AI setup failed', 10000);
      } else if (data.status === 'skipped') {
        setMissingModels([]);
        setInstallationCommands([]);
        showInfo(data.message || 'AI verification skipped', 5000);
      }
    },
    [showWarning, showSuccess, showError, showInfo],
  );

  useEffect(() => {
    // Listen for IPC events
    let cleanup;
    if (window.electronAPI?.events?.onAiStatusUpdate) {
      cleanup =
        window.electronAPI.events.onAiStatusUpdate(handleAiStatusUpdate);
    }

    // Cleanup
    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [handleAiStatusUpdate]);

  const handleVerifyModels = async () => {
    setIsVerifying(true);
    try {
      // Trigger model verification
      if (window.electronAPI?.ai?.verifyModels) {
        const result = await window.electronAPI.ai.verifyModels();
        setAiStatus(result.status);
        if (result.status === 'models_missing') {
          setMissingModels(result.missingModels || []);
          setInstallationCommands(result.installationCommands || []);
        }
      }
    } catch (error) {
      showError('Failed to verify AI models: ' + error.message);
      setAiStatus('error');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleInstallModels = async () => {
    if (installationCommands.length === 0) return;

    try {
      showInfo('Installing missing AI models...', 10000);

      // Open terminal and run installation commands
      for (const command of installationCommands) {
        if (window.electronAPI?.system?.runCommand) {
          await window.electronAPI.system.runCommand(command);
        }
      }

      showSuccess('AI models installed successfully!', 5000);
      // Re-verify after installation
      setTimeout(() => handleVerifyModels(), 2000);
    } catch (error) {
      showError('Failed to install AI models: ' + error.message);
    }
  };

  const handleSkipVerification = async () => {
    try {
      // Save user preference to skip AI verification
      if (window.electronAPI?.settings?.save) {
        const result = await window.electronAPI.settings.save({
          skipAIModelVerification: skipVerification,
        });

        setSkipVerification(true);
        setAiStatus('skipped');
        showInfo(
          'AI model verification will be skipped on future startups',
          5000,
        );
      } else {
        console.error('[AI Setup] electronAPI.settings.save not available');
        showError('Settings API not available');
      }
    } catch (error) {
      console.error('[AI Setup] Failed to save skip preference:', error);
      showError('Failed to save preference: ' + error.message);
    }
  };

  const handleContinue = () => {
    actions.advancePhase(PHASES.SETUP);
  };

  const getStatusDisplay = () => {
    switch (aiStatus) {
      case 'checking':
        return {
          icon: '🔄',
          title: 'Checking AI Setup',
          description: 'Verifying AI models and connection...',
          color: 'text-blue-600',
        };
      case 'ready':
        return {
          icon: '✅',
          title: 'AI Ready',
          description: 'All required AI models are available',
          color: 'text-green-600',
        };
      case 'models_missing':
        return {
          icon: '⚠️',
          title: 'Missing AI Models',
          description: `${missingModels.length} AI model(s) need to be installed`,
          color: 'text-yellow-600',
        };
      case 'error':
        return {
          icon: '❌',
          title: 'AI Setup Error',
          description: 'Unable to connect to Ollama or verify models',
          color: 'text-red-600',
        };
      case 'skipped':
        return {
          icon: '⏭️',
          title: 'AI Setup Skipped',
          description: 'AI model verification bypassed',
          color: 'text-gray-600',
        };
      default:
        return {
          icon: '🤖',
          title: 'AI Setup',
          description: 'Configure local AI for file analysis',
          color: 'text-blue-600',
        };
    }
  };

  const status = useMemo(() => getStatusDisplay(), [aiStatus]);

  return (
    <div className="container-narrow py-21">
      <div className="text-center mb-21">
        <header role="banner">
          <h1 className="heading-primary" aria-level="1">
            <span className="text-5xl mr-5">{status.icon}</span>
            {status.title}
          </h1>
        </header>
        <p className={`text-lg mt-5 ${status.color}`}>{status.description}</p>
      </div>

      <div className="max-w-2xl mx-auto space-y-8">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <h2 className="heading-secondary">AI Status</h2>
          </CardHeader>
          <CardBody>
            <div className="text-center py-8">
              <div className="text-4xl mb-4">{status.icon}</div>
              <h3 className={`text-xl font-semibold mb-2 ${status.color}`}>
                {status.title}
              </h3>
              <p className="text-system-gray-600">{status.description}</p>

              {aiStatus === 'checking' && (
                <div className="mt-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              )}

              {/* Quick Skip Option */}
              <div className="mt-6 pt-4 border-t border-border-light">
                <Button
                  onClick={async () => {
                    await handleSkipVerification();
                    handleContinue();
                  }}
                  variant="outline"
                  size="sm"
                  disabled={skipVerification}
                  className="text-sm"
                >
                  ⏭️ Skip AI Setup
                </Button>
                <p className="text-xs text-system-gray-500 mt-2">
                  Skip verification and continue to folder setup
                </p>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-4">
          {aiStatus === 'models_missing' && (
            <Card>
              <CardHeader>
                <h3 className="heading-tertiary">Install Missing Models</h3>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  <p className="text-sm text-system-gray-600">
                    The following AI models need to be installed:
                  </p>
                  <div className="bg-surface-secondary rounded-lg p-4 font-mono text-sm">
                    {missingModels.map((model, index) => (
                      <div key={index} className="mb-2">
                        • {model}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={handleInstallModels}
                      variant="primary"
                      className="flex-1"
                    >
                      Install Models
                    </Button>
                    <Button
                      onClick={handleVerifyModels}
                      variant="outline"
                      disabled={isVerifying}
                    >
                      {isVerifying ? 'Verifying...' : 'Re-check'}
                    </Button>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <h3 className="heading-tertiary">Skip AI Setup</h3>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-system-gray-600 mb-4">
                Skip AI model verification and continue with basic file
                organization. AI features will be disabled until models are
                properly configured.
              </p>
              <Button
                onClick={async () => {
                  await handleSkipVerification();
                  // After skipping, automatically continue to next phase
                  handleContinue();
                }}
                variant="secondary"
                className="w-full"
                disabled={skipVerification}
              >
                {skipVerification
                  ? 'AI Setup Skipped'
                  : 'Skip AI Setup & Continue'}
              </Button>
            </CardBody>
          </Card>

          {/* Navigation */}
          <div className="flex gap-4 pt-8">
            <Button
              onClick={() => actions.advancePhase(PHASES.WELCOME)}
              variant="ghost"
              className="flex-1"
            >
              ← Back
            </Button>
            <Button
              onClick={handleContinue}
              variant="primary"
              className="flex-1"
            >
              Continue to Setup →
            </Button>
          </div>
        </div>

        {/* Help Section */}
        <Card>
          <CardHeader>
            <h3 className="heading-tertiary">Need Help?</h3>
          </CardHeader>
          <CardBody>
            <div className="space-y-3 text-sm text-system-gray-600">
              <p>
                <strong>Don't have Ollama installed?</strong> Download it from{' '}
                <a
                  href="https://ollama.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  ollama.ai
                </a>
              </p>
              <p>
                <strong>Need to start Ollama?</strong> Run{' '}
                <code className="bg-surface-secondary px-2 py-1 rounded">
                  ollama serve
                </code>{' '}
                in your terminal.
              </p>
              <p>
                <strong>Installing models manually?</strong> Use commands like{' '}
                <code className="bg-surface-secondary px-2 py-1 rounded">
                  ollama pull llama3.2:latest
                </code>
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export default AISetupPhase;
