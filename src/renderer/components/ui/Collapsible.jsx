import React, { useEffect, useId, useState } from 'react';

export default function Collapsible({
  title,
  children,
  actions = null,
  defaultOpen = true,
  className = '',
  persistKey
}) {
  const contentId = useId();
  const storageKey = persistKey ? `collapsible:${persistKey}` : null;
  const initialOpen = (() => {
    if (storageKey && typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved === 'true' || saved === 'false') return saved === 'true';
      } catch {}
    }
    return Boolean(defaultOpen);
  })();
  const [isOpen, setIsOpen] = useState(initialOpen);

  const toggle = () => {
    setIsOpen(prev => {
      const next = !prev;
      if (storageKey && typeof window !== 'undefined') {
        try { window.localStorage.setItem(storageKey, String(next)); } catch {}
      }
      return next;
    });
  };

  // React to external expand/collapse broadcasts via storage events
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    const onStorage = (e) => {
      // If key provided and doesn't match ours, ignore. If generic event, still check our key.
      if (e && e.key && e.key !== storageKey) return;
      try {
        const saved = window.localStorage.getItem(storageKey);
        if (saved === 'true' || saved === 'false') {
          setIsOpen(saved === 'true');
        }
      } catch {}
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  return (
    <section className={`bg-surface-primary rounded-xl border border-border-light shadow-sm p-21 hover:shadow-md hover:border-border-medium transition-all duration-200 backdrop-blur-sm mb-21 ${className}`}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="flex items-center gap-8 py-8 focus:outline-none"
          aria-expanded={isOpen}
          aria-controls={contentId}
          onClick={toggle}
        >
          <svg
            className={`w-4 h-4 text-system-gray-600 transition-transform ${isOpen ? 'transform rotate-90' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path fillRule="evenodd" d="M6 6a1 1 0 011.707-.707l5 5a1 1 0 010 1.414l-5 5A1 1 0 016 15.586V6z" clipRule="evenodd" />
          </svg>
          <h3 className="heading-tertiary m-0">{title}</h3>
        </button>
        <div className="flex items-center gap-8">
          {/* Expand/Collapse control when persistKey is present */}
          {persistKey ? (
            <button
              type="button"
              className="text-xs text-system-gray-500 hover:text-system-gray-700 underline"
              onClick={() => {
                if (!isOpen) toggle(); else toggle(); // toggle regardless to keep simple; parent manages global actions
              }}
              aria-label={isOpen ? 'Collapse section' : 'Expand section'}
            >
              {isOpen ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
          {actions ? <div className="flex items-center gap-8">{actions}</div> : null}
        </div>
      </div>

      <div
        id={contentId}
        className={`transition-all duration-200 ${isOpen ? 'mt-13' : 'h-0 overflow-hidden'}`}
      >
        {isOpen ? children : null}
      </div>
    </section>
  );
}


