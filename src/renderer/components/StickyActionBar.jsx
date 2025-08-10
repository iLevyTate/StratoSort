import React from 'react';

function StickyActionBar({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  secondaryLabel,
  onSecondary,
  secondaryDisabled = false,
  meta
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="bg-white/80 backdrop-blur-md border-t border-border-light">
        <div className="container-enhanced py-fib-13 flex items-center justify-between">
          <div className="text-sm text-system-gray-600 truncate">
            {meta}
          </div>
          <div className="flex items-center gap-fib-8">
            {secondaryLabel && (
              <button
                onClick={onSecondary}
                disabled={secondaryDisabled}
                className="btn-secondary"
              >
                {secondaryLabel}
              </button>
            )}
            {primaryLabel && (
              <button
                onClick={onPrimary}
                disabled={primaryDisabled}
                className="btn-primary"
              >
                {primaryLabel}
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Spacer to prevent content from being hidden behind the bar */}
      <div className="h-fib-55" />
    </div>
  );
}

export default StickyActionBar;