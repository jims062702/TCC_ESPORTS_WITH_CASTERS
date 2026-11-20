import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

/**
 * Keeps one broken page or panel from blanking the whole admin: shows what
 * went wrong with a Try again / Reload button instead of a black screen.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating to another page clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card mx-auto my-10 max-w-xl p-6 text-center" role="alert">
        <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
        <h2 className="mt-3 font-display text-2xl uppercase">Something went wrong on this page</h2>
        <p className="mt-2 break-words text-sm text-muted">{this.state.error.message}</p>
        <div className="mt-5 flex justify-center gap-2">
          <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface2 px-4 text-sm font-semibold" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
          <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-semibold text-white" onClick={() => window.location.reload()}>
            <RotateCcw className="h-4 w-4" /> Reload
          </button>
        </div>
      </div>
    );
  }
}
