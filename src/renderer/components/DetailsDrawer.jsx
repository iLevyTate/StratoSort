import React, { useEffect } from 'react';

function DetailsDrawer({ title = 'Details', open, onClose, children, width = 420 }) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[2147483646]">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close details"
      />
      <aside
        className="absolute top-0 right-0 h-full bg-white shadow-2xl border-l border-border-light animate-slide-in-right modern-scrollbar"
        style={{ width }}
        role="complementary"
        aria-labelledby="details-drawer-title"
      >
        <div className="flex items-center justify-between px-fib-21 py-fib-13 border-b border-border-light">
          <h2 id="details-drawer-title" className="text-heading-4">{title}</h2>
          <button onClick={onClose} className="btn-ghost-minimal" aria-label="Close">
            ×
          </button>
        </div>
        <div className="p-fib-21 h-full overflow-y-auto">
          {children}
        </div>
      </aside>
    </div>
  );
}

export default DetailsDrawer;