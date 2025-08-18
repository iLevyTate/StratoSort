import React, { useEffect, useState } from 'react';

export default function UpdateIndicator() {
  const [status, setStatus] = useState('idle');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Listen for update events from main
    const off = window.electronAPI?.events?.onAppUpdate?.((payload) => {
      try {
        if (!payload || !payload.status) return;
        if (payload.status === 'ready') {
          setStatus('ready');
          setVisible(true);
        } else if (payload.status === 'available') {
          setStatus('downloading');
          setVisible(false);
        } else if (payload.status === 'none') {
          setVisible(false);
        }
      } catch (error) {
        console.error('[UpdateIndicator] Error handling update event:', error);
      }
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={async () => {
        try {
          setStatus('applying');
          const res = await window.electronAPI?.system?.applyUpdate?.();
          if (!res?.success) {
            setStatus('error');
            console.error('[UpdateIndicator] Failed to apply update');
          }
        } catch (error) {
          setStatus('error');
          console.error('[UpdateIndicator] Error applying update:', error);
        }
      }}
      className="
        relative px-4 py-2 h-10
        text-xs font-medium rounded-xl
        bg-gradient-to-r from-emerald-500/10 to-teal-500/10
        border border-emerald-500/20
        text-emerald-700 
        overflow-hidden group
        transition-all duration-200 ease-out
        hover:bg-gradient-to-r hover:from-emerald-500/15 hover:to-teal-500/15
        hover:border-emerald-500/30
        hover:shadow-sm
        active:scale-95
        flex items-center
      "
      title="Apply downloaded update"
      aria-label="Apply update"
    >
      <span className="relative z-10 flex items-center gap-2">
        {(status === 'applying' || status === 'ready') && (
          <span className="w-2 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full animate-pulse" />
        )}
        <span className="font-medium">
          {status === 'applying'
            ? 'Updating…'
            : status === 'ready'
              ? 'Update Ready'
              : 'Update'}
        </span>
      </span>
      {/* Shimmer effect */}
      <span
        className="
        absolute inset-0 -translate-x-full
        bg-gradient-to-r from-transparent via-white/10 to-transparent
        group-hover:translate-x-full
        transition-transform duration-500
      "
      />
    </button>
  );
}
