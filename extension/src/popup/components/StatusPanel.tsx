import React from 'react';
import type { ExtensionStatus } from '../../types';

interface StatusPanelProps {
  readonly status: ExtensionStatus | null;
  readonly userRole: string | null;
  readonly onResume: () => void;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({
  status,
  userRole,
  onResume,
}) => {
  const isConnected = status?.isConnected ?? false;
  const isPocketOptionOpen = status?.isPocketOptionOpen ?? false;
  const isPaused = status?.isPaused ?? false;
  const pauseReason = status?.pauseReason ?? null;

  const roleBadgeClass =
    userRole === 'admin'
      ? 'badge badge-purple'
      : userRole === 'premium'
        ? 'badge badge-green'
        : 'badge badge-gray';

  return (
    <div className="card">
      <div className="status-row">
        <span className="status-indicator">
          <span>{isConnected ? '\uD83D\uDFE2' : '\uD83D\uDD34'}</span>
          <span>Backend</span>
        </span>
        <span style={{ fontSize: '12px', color: isConnected ? '#00e676' : '#ff1744' }}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="status-row">
        <span className="status-indicator">
          <span>{isPocketOptionOpen ? '\uD83D\uDFE2' : '\u26AA'}</span>
          <span>Pocket Option</span>
        </span>
        <span
          style={{
            fontSize: '12px',
            color: isPocketOptionOpen ? '#00e676' : '#8b8b9e',
          }}
        >
          {isPocketOptionOpen ? 'Open' : 'Not detected'}
        </span>
      </div>

      <div className="status-row">
        <span className="text-secondary" style={{ fontSize: '12px' }}>Account</span>
        <span className={roleBadgeClass}>
          {userRole ?? 'unknown'}
        </span>
      </div>

      {isPaused && (
        <div className="warning-box" style={{ marginTop: '8px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>Trading Paused</div>
            {pauseReason && (
              <div style={{ fontSize: '11px', opacity: 0.8 }}>{pauseReason}</div>
            )}
          </div>
          <button className="btn btn-sm btn-success" onClick={onResume}>
            Resume
          </button>
        </div>
      )}
    </div>
  );
};
