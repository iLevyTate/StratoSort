import React from 'react';

/**
 * Simple React error boundary that logs errors to the console and
 * renders a basic fallback UI when an unexpected error occurs.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log the error for visibility in development and production logs
    // eslint-disable-next-line no-console
    console.error(
      '[RENDERER] Unhandled error caught by ErrorBoundary:',
      error,
      info,
    );
    try {
      // Send error details to main process crash reporter if available
      if (
        window &&
        window.electronAPI &&
        typeof window.electronAPI.reportCrash === 'function'
      ) {
        window.electronAPI.reportCrash({
          type: 'renderer_error',
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          info,
        });
      } else if (window && window.ipcRenderer && window.ipcRenderer.send) {
        // Older preload exposures
        window.ipcRenderer.send('crash-report', {
          type: 'renderer_error',
          timestamp: new Date().toISOString(),
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          info,
        });
      }
    } catch (e) {
      console.debug(
        '[ErrorBoundary] Failed to report crash to main process:',
        e?.message || e,
      );
    }
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
    // Optionally reload the window for a fresh start
    if (window.confirm('Would you like to reload the application?')) {
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-primary to-surface-secondary p-8">
          <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-border-light p-8 animate-slide-up">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-system-red/10 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-system-red"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-system-gray-900 mb-2">
                {this.props.fallbackTitle || 'Oops! Something went wrong'}
              </h1>
              <p className="text-system-gray-600">
                The application encountered an unexpected error.
              </p>
            </div>

            <div className="bg-system-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm font-mono text-system-gray-700 break-words">
                {this.state.error?.message || 'Unknown error occurred'}
              </p>
              {process.env.NODE_ENV === 'development' &&
                this.state.error?.stack && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-system-gray-500 hover:text-system-gray-700">
                      Show stack trace
                    </summary>
                    <pre className="mt-2 text-xs text-system-gray-600 overflow-auto max-h-40">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 btn-primary"
                aria-label="Try again"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 btn-secondary"
                aria-label="Reload application"
              >
                Reload App
              </button>
            </div>

            <p className="text-xs text-center text-system-gray-500 mt-4">
              If this problem persists, please check your settings or contact
              support.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

ErrorBoundary.defaultProps = {
  fallbackTitle: 'Application Error',
};

export default ErrorBoundary;
