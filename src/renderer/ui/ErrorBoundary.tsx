// React error boundary so a thrown render error in the canvas/overlays shows a
// recoverable message instead of a blank white screen (plan §6 Phase 8:
// "Error boundaries around the canvas — one crashed node doesn't take down the
// app"). Class component because hooks can't catch render errors.

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Local-only logging (no telemetry). Helps during dev; harmless in prod.
    console.error("AI-Mindmap render error:", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return (
        <div className="aim-modal-overlay">
          <div className="aim-modal" role="alertdialog" aria-label="Something went wrong">
            <h2 className="aim-modal__title">Something went wrong</h2>
            <p className="aim-modal__body">
              The canvas hit an unexpected error. Your last saved file is safe on disk.
            </p>
            <pre className="aim-modal__detail">{this.state.error.message}</pre>
            <div className="aim-modal__actions">
              <button
                type="button"
                className="aim-modal__btn aim-modal__btn--primary"
                onClick={this.reset}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
