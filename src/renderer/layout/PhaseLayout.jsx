import React from 'react';

/**
 * PhaseLayout
 * ------------------------------------------------------------------
 * Standard full-height, fade-in glassmorphism wrapper that guarantees
 * consistent paddings, background, and scroll-locking across all
 * workflow phases.  Simply place your phase body inside.
 */
export default function PhaseLayout({ children }) {
  return (
    <div className="phase-container">
      <div className="phase-content animate-fade-in-up">
        {children}
      </div>
    </div>
  );
} 