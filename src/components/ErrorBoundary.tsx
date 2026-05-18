/**
 * ErrorBoundary — last line of defense against a blank white screen.
 * Catches render-time exceptions anywhere in the tree and shows a calm,
 * branded recovery screen instead of a dead page. No dependencies.
 */
import { Component, ErrorInfo, ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Deterministic, PII-free console signal for diagnostics.
    console.error('[spendora] render error:', error.message, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
        <img src="/spendora-logo.png" alt="Spendora" className="h-8 w-auto mb-6" />
        <h1 className="text-lg font-semibold text-gray-800">Something went wrong</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-xs leading-relaxed">
          Your data is safe. Reloading usually fixes this.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold px-6 py-2.5 rounded-2xl transition-colors"
        >
          Reload Spendora
        </button>
      </div>
    );
  }
}
