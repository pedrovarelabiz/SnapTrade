import React, { Component, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly hasError: boolean;
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[SnapTrade] UI Error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{
          background: '#0a0a0f', color: '#ff1744', padding: '24px',
          textAlign: 'center', minHeight: '100vh',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <h2 style={{ fontSize: '16px', marginBottom: '8px' }}>Something went wrong</h2>
          <p style={{ fontSize: '12px', color: '#8b8b9e', marginBottom: '16px' }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            style={{
              background: '#7c4dff', color: '#fff', border: 'none',
              borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontWeight: 600,
            }}
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
