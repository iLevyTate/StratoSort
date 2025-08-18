import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './tailwind.css';

// Enable smooth scrolling globally
if (typeof window !== 'undefined') {
  // Set smooth scroll on document
  document.documentElement.style.scrollBehavior = 'smooth';
  document.body.style.scrollBehavior = 'smooth';

  // Add smooth scroll behavior to all internal links
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link && link.getAttribute('href')?.startsWith('#')) {
      e.preventDefault();
      const targetId = link.getAttribute('href').slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });
      }
    }
  });
}

// Wait for DOM to be ready before initializing React
function initializeApp() {
  try {
    console.log('[RENDERER] Initializing React application...');

    // Find the root container
    const container = document.getElementById('root');
    if (!container) {
      throw new Error(
        'Root container not found! Make sure there is a div with id="root" in the HTML.',
      );
    }

    console.log('[RENDERER] Root container found, creating React root...');

    // Create React root
    const root = createRoot(container);

    // Render the React app
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );

    // Remove initial loading after first paint
    requestAnimationFrame(() => {
      const initialLoading = document.getElementById('initial-loading');
      if (initialLoading) initialLoading.remove();
    });

    console.log('[RENDERER] React application initialized successfully');
  } catch (error) {
    console.error('[RENDERER] Failed to initialize React application:', error);

    // Show error message in the initial loading screen
    const initialLoading = document.getElementById('initial-loading');
    if (initialLoading) {
      initialLoading.innerHTML = `
        <section style="text-align: center; max-width: 400px; color: #EF4444;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h1 style="color: #EF4444; margin: 0; font-size: 24px; font-weight: 600;">Failed to Load</h1>
          <p style="color: #64748B; margin: 8px 0 0 0; font-size: 14px;">React application failed to initialize</p>
          <details style="margin-top: 16px; text-align: left;">
            <summary style="cursor: pointer; color: #64748B;">Error Details</summary>
            <pre style="background: #F1F5F9; padding: 8px; border-radius: 4px; margin-top: 8px; font-size: 12px; overflow: auto;">${error.message}</pre>
          </details>
        </section>
      `;
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  // DOM is already ready
  initializeApp();
}
