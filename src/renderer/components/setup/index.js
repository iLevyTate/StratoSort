import React, { useEffect, useState } from 'react';
import Button from '../ui/Button';

export default function FirstRunWizard({ onComplete }) {
  const [step, setStep] = useState(0);
  const [hostOk, setHostOk] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [results, setResults] = useState([]);

  const models = [
    {
      id: 'llama3.2:latest',
      label: 'Text model (llama3.2:latest)',
      defaultChecked: true,
    },
    {
      id: 'llava:latest',
      label: 'Vision model (llava:latest)',
      defaultChecked: true,
    },
    {
      id: 'mxbai-embed-large',
      label: 'Embeddings (mxbai-embed-large)',
      defaultChecked: true,
    },
  ];

  useEffect(() => {
    (async () => {
      try {
        const res = await window.electronAPI?.ollama?.testConnection?.();
        setHostOk(Boolean(res?.success));
      } catch {
        setHostOk(false);
      }
    })();
  }, []);

  const handlePull = async () => {
    try {
      setPulling(true);
      const selections = Array.from(
        document.querySelectorAll('input[name="model-pull"]:checked'),
      ).map((i) => i.value);
      const res = await window.electronAPI?.ollama?.pullModels?.(selections);
      setResults(res?.results || []);
    } finally {
      setPulling(false);
    }
  };

  if (hostOk === null) return null;

  if (hostOk) {
    return null; // Host ok; no wizard needed
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-21">
        {step === 0 && (
          <div>
            <h2 className="text-heading-2 mb-8">Set up AI locally</h2>
            <p className="text-body mb-8">
              StratoSort uses Ollama to run models locally. We can pull the base
              models for you.
            </p>
            <div className="space-y-5 mb-13">
              {models.map((m) => (
                <label key={m.id} className="flex items-center gap-5">
                  <input
                    type="checkbox"
                    name="model-pull"
                    defaultChecked={m.defaultChecked}
                    value={m.id}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-8">
              <Button onClick={onComplete} variant="secondary">
                Skip
              </Button>
              <Button
                onClick={() => {
                  setStep(1);
                  handlePull();
                }}
                disabled={pulling}
              >
                {pulling ? 'Pulling…' : 'Pull models'}
              </Button>
            </div>
          </div>
        )}
        {step === 1 && (
          <div>
            <h2 className="text-heading-2 mb-8">Pulling models…</h2>
            {results.length === 0 ? (
              <p className="text-body">
                This may take a few minutes depending on your connection.
              </p>
            ) : (
              <div className="space-y-5">
                {results.map((r) => (
                  <div key={r.model} className="text-sm">
                    {r.success ? '✅' : '⚠️'} {r.model}{' '}
                    {r.success ? 'ready' : `failed: ${r.error}`}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-end gap-8 mt-13">
              <Button onClick={onComplete} variant="primary">
                Continue
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { default as SmartFolderItem } from './SmartFolderItem';
