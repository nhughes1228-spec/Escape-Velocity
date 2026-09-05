import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Escape Velocity failed during application render.', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="boot-fallback boot-error" role="alert">
          <p className="boot-kicker">ESCAPE VELOCITY · FLIGHT LAB</p>
          <h1>The flight lab could not start.</h1>
          <p>An application error interrupted the launch range. Refresh the page to try a clean start.</p>
          <button type="button" onClick={() => window.location.reload()}>Refresh page</button>
        </main>
      );
    }
    return this.props.children;
  }
}
