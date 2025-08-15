import React from 'react';

/**
 * Simple React error boundary that logs errors to the console and
 * renders a basic fallback UI when an unexpected error occurs.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log the error for visibility in development and production logs
    // eslint-disable-next-line no-console
    console.error('[RENDERER] Unhandled error caught by ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-red-600">
          <h1 className="text-lg font-bold">Something went wrong.</h1>
          <p className="text-sm">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

