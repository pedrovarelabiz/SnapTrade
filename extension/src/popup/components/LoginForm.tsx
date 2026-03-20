import React, { useState } from 'react';
import { verifyToken } from '../../lib/api';
import type { ExtensionSettings } from '../../types';

interface LoginFormProps {
  readonly onLogin: (partial: Partial<ExtensionSettings>) => Promise<void>;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();

    const trimmed = token.trim();
    if (!trimmed) {
      setError('Please enter your extension token.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const result = await verifyToken(trimmed);

      await onLogin({
        extensionToken: trimmed,
        isAuthenticated: true,
        userEmail: result.email,
        userRole: result.role,
        subscriptionStatus: result.subscriptionStatus,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to verify token';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-form">
      <h2>SnapTrade</h2>
      <p>Connect your SnapTrade account to start receiving trading signals.</p>

      <form
        onSubmit={handleSubmit}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <input
          type="text"
          className="input"
          placeholder="Enter your extension token"
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            setError(null);
          }}
          disabled={isSubmitting}
          autoFocus
        />

        {error && <div className="error-box">{error}</div>}

        <button
          type="submit"
          className="btn btn-primary"
          disabled={isSubmitting || !token.trim()}
        >
          {isSubmitting ? 'Connecting...' : 'Connect'}
        </button>
      </form>

      <p style={{ marginTop: '8px', fontSize: '11px' }}>
        Find your token in{' '}
        <span className="text-accent">SnapTrade &gt; Settings &gt; Extension</span>
      </p>
    </div>
  );
};
