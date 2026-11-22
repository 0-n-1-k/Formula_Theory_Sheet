import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import 'katex/dist/katex.min.css';
import App from './App.tsx';
import { ACTIVE_STORAGE_KEY, copyTextToClipboard } from './utils/storageSafety';
import './index.css';
import './theme.css';

const VITE_PRELOAD_RELOAD_KEY = 'buet_eee_vite_preload_reloaded';

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const alreadyReloaded = window.sessionStorage.getItem(VITE_PRELOAD_RELOAD_KEY);
      if (!alreadyReloaded) {
        event.preventDefault();
        window.sessionStorage.setItem(VITE_PRELOAD_RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // Ignore sessionStorage restrictions in hardened browsers
    }
  });

  window.addEventListener(
    'load',
    () => {
      window.setTimeout(() => {
        try {
          window.sessionStorage.removeItem(VITE_PRELOAD_RELOAD_KEY);
        } catch {
          // Ignore sessionStorage restrictions
        }
      }, 10000);
    },
    { once: true }
  );
}

interface RootErrorBoundaryProps {
  children: ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  errorName: string;
  errorMessage: string;
  errorStack: string;
  componentStack: string;
  copyStatus: 'idle' | 'copied' | 'failed';
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  constructor(props: RootErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorName: '',
      errorMessage: '',
      errorStack: '',
      componentStack: '',
      copyStatus: 'idle',
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RootErrorBoundaryState> {
    return {
      hasError: true,
      errorName: error?.name || 'Error',
      errorMessage: error?.message || 'Unexpected runtime exception',
      errorStack: error?.stack || '',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[RootErrorBoundary] Fatal application crash:', error, info);
    this.setState({
      componentStack: info?.componentStack || '',
    });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleResetCacheAndReload = (): void => {
    try {
      window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
      window.sessionStorage.removeItem(VITE_PRELOAD_RELOAD_KEY);
    } catch {
      // Ignore storage access failures in private/restricted browsers
    }
    window.location.reload();
  };

  private handleCopyErrorLog = async (): Promise<void> => {
    const payload = [
      `URL: ${typeof window !== 'undefined' ? window.location.href : 'N/A'}`,
      `Timestamp: ${new Date().toISOString()}`,
      `Error: ${this.state.errorName}: ${this.state.errorMessage}`,
      this.state.errorStack ? `\nStack:\n${this.state.errorStack}` : '',
      this.state.componentStack ? `\nComponent Stack:${this.state.componentStack}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const ok = await copyTextToClipboard(payload);
    this.setState({ copyStatus: ok ? 'copied' : 'failed' });
    window.setTimeout(() => {
      this.setState((prev) => (prev.hasError ? { ...prev, copyStatus: 'idle' } : prev));
    }, 2600);
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const copyLabel =
      this.state.copyStatus === 'copied'
        ? '[COPIED ERROR LOG]'
        : this.state.copyStatus === 'failed'
        ? '[COPY FAILED]'
        : '[COPY ERROR LOG]';

    return (
      <main className="root-crash-shell" role="alert" aria-live="assertive">
        <section className="root-crash-panel">
          <div className="root-crash-badge">[:: RUNTIME EXCEPTION // WORKSPACE HALTED ::]</div>
          <h1 className="root-crash-title">Something interrupted the reference sheet.</h1>
          <p className="root-crash-desc">
            A fatal error occurred during startup or rendering. Reloading normally recovers from fresh deployment chunk updates; resetting local cache clears saved progress state if storage became corrupted.
          </p>
          <pre className="root-crash-log">
            <code>
              {this.state.errorName}: {this.state.errorMessage}
            </code>
          </pre>
          <div className="root-crash-actions">
            <button
              type="button"
              className="root-crash-btn primary"
              onClick={this.handleReload}
            >
              [RELOAD PAGE]
            </button>
            <button
              type="button"
              className="root-crash-btn danger"
              onClick={this.handleResetCacheAndReload}
            >
              [RESET LOCAL CACHE &amp; RELOAD]
            </button>
            <button
              type="button"
              className="root-crash-btn secondary"
              onClick={() => void this.handleCopyErrorLog()}
            >
              {copyLabel}
            </button>
          </div>
        </section>
      </main>
    );
  }
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
