import React, { useEffect, useState } from 'react';

export default function UpdateIndicator() {
  const [status, setStatus] = useState('idle');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Poll a trivial endpoint or rely on preload to expose updater events in the future
    // For now show an indicator that can be used when updates are available
    const t = setTimeout(() => setVisible(false), 0);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={async () => {
        try {
          setStatus('applying');
          const res = await window.electronAPI?.system?.applyUpdate?.();
          if (!res?.success) setStatus('error');
        } catch {
          setStatus('error');
        }
      }}
      className="px-6 py-5 text-sm rounded-lg border border-border-light hover:bg-system-gray-50"
      title="Apply downloaded update"
      aria-label="Apply update"
    >
      {status === 'applying' ? 'Updating…' : 'Update Ready'}
    </button>
  );
}


