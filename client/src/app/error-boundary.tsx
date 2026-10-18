import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

type Props = { children: ReactNode };
export class ErrorBoundary extends Component<Props, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Refloor rendering error', error, info.componentStack);
  }
  override render() {
    if (this.state.error)
      return (
        <div className="error-screen">
          <span className="eyebrow">Something needs attention</span>
          <h1>We couldn’t open this space.</h1>
          <p>{this.state.error}</p>
          <button className="button primary" onClick={() => window.location.reload()}>
            Reload Refloor
          </button>
        </div>
      );
    return this.props.children;
  }
}
