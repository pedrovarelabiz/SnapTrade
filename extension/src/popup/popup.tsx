import React, { useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { useSettings } from './hooks/useSettings';
import { EXTENSION_VERSION, DEFAULT_SETTINGS } from '../lib/constants';
import { useStatus } from './hooks/useSignals';
import { LoginForm } from './components/LoginForm';
import { MasterSwitch } from './components/MasterSwitch';
import { StatusPanel } from './components/StatusPanel';
import { DailyStats } from './components/DailyStats';
import { SignalFeed } from './components/SignalFeed';
import { TradeSettings } from './components/TradeSettings';
import { MartingaleConfig } from './components/MartingaleConfig';
import { RiskManagement } from './components/RiskManagement';
import { IndicatorSettings } from './components/IndicatorSettings';
import { OpenTrades } from './components/OpenTrades';
import { AIStats } from './components/AIStats';
import { initSentry } from '../config/sentry';
import * as Sentry from '@sentry/browser';

// Initialize Sentry for popup
initSentry();


const ActivityLog: React.FC = () => {
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<Array<{ts: string; lvl: string; msg: string}>>([]);

  const fetchLogs = async (): Promise<void> => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
      if (Array.isArray(result)) setLogs(result.reverse());
    } catch (error) {
      Sentry.captureException(error);
    }
  };

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <button
        className="btn btn-sm"
        onClick={() => { setShowLogs(!showLogs); if (!showLogs) fetchLogs(); }}
        style={{ width: '100%', fontSize: 11, background: 'transparent', border: '1px solid #2a2a3e' }}
      >
        {showLogs ? 'Hide Logs' : 'Activity Log'}
      </button>
      {showLogs && (
        <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 8 }}>
          {logs.slice(0, 20).map((log, i) => (
            <div key={i} style={{
              fontSize: 10,
              color: log.lvl === 'error' ? '#ff4444' : log.lvl === 'warn' ? '#ff9900' : '#8b8b9e',
              borderBottom: '1px solid #1a1a2e', padding: '2px 0',
            }}>
              <span style={{ color: '#555' }}>{log.ts.slice(11, 19)}</span>{' '}
              {log.msg}
            </div>
          ))}
          {logs.length === 0 && <div style={{ fontSize: 10, color: '#555', padding: 4 }}>No logs</div>}
        </div>
      )}
    </div>
  );
};
const App: React.FC = () => {
  const { settings, updateSettings, isLoading: settingsLoading } = useSettings();
  const { status, isLoading: statusLoading } = useStatus();

  if (settingsLoading || !settings) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: '#0a0a0f',
        }}
      >
        <div className="spinner" />
      </div>
    );
  }

  // Not authenticated: show login
  if (!settings.isAuthenticated || !settings.extensionToken) {
    return <LoginForm onLogin={updateSettings} />;
  }

  // Authenticated but not premium
  if (settings.userRole !== 'premium' && settings.userRole !== 'admin') {
    return (
      <div style={{ background: '#0a0a0f', minHeight: '100vh' }}>
        <Header
          settings={settings}
          onToggle={(enabled) => updateSettings({ isEnabled: enabled })}
        />
        <div className="popup-content">
          <div className="card premium-card">
            <h2>Premium Required</h2>
            <p>
              Your account ({settings.userEmail}) has a <strong>{settings.userRole}</strong> role.
              Upgrade to Premium to use automated trading features.
            </p>
            <a
              href="https://snaptrade.faroldigital.pt/pricing"
              target="_blank"
              rel="noopener noreferrer"
            >
              Upgrade to Premium
            </a>
          </div>
          <AccountSection settings={settings} onLogout={handleLogout} onResetSettings={handleResetSettings} onResetDaily={handleResetDaily} />
          {status?.updateAvailable && (
            <div className="card" style={{ marginBottom: 8, background: '#7c4dff22', borderColor: '#7c4dff44' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#7c4dff' }}>Update v{status.updateAvailable.version}</div>
              <div style={{ fontSize: 10, color: '#8b8b9e', marginBottom: 4 }}>{status.updateAvailable.changelog}</div>
              <a href={status.updateAvailable.url} target="_blank" rel="noopener" className="btn btn-primary" style={{ fontSize: 11, padding: '4px 10px' }}>Download</a>
            </div>
          )}
          <div style={{ textAlign: 'center', fontSize: 10, color: '#8b8b9e', padding: 4 }}>v{EXTENSION_VERSION}</div>
        </div>
      </div>
    );
  }

  // Full UI for authenticated premium/admin users
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh' }}>
      <Header
        settings={settings}
        onToggle={(enabled) => updateSettings({ isEnabled: enabled })}
      />

      <div className="popup-content">
        <StatusPanel
          status={status}
          userRole={settings.userRole}
          onResume={() => {
            try {
              chrome.runtime.sendMessage({ type: 'RESUME_TRADING' });
            } catch (error) {
              Sentry.captureException(error);
            }
          }}
        />

        <DailyStats
          dailyState={status?.dailyState ?? null}
          settings={settings}
        />

        <OpenTrades trades={status?.openTrades ?? []} />

        <AIStats token={settings?.extensionToken ?? null} />

        <SignalFeed
          pendingSignals={status?.pendingSignals ?? []}
          recentTrades={status?.dailyState?.trades ?? []}
          onConfirm={(signalId) => {
            try {
              chrome.runtime.sendMessage({ type: 'CONFIRM_TRADE', signalId });
            } catch (error) {
              Sentry.captureException(error);
            }
          }}
          onCancel={(signalId) => {
            try {
              chrome.runtime.sendMessage({ type: 'CANCEL_TRADE', signalId });
            } catch (error) {
              Sentry.captureException(error);
            }
          }}
        />

        <TradeSettings settings={settings} onUpdate={updateSettings} />
        <MartingaleConfig settings={settings} onUpdate={updateSettings} />
        <IndicatorSettings settings={settings} onUpdate={updateSettings} />
        <RiskManagement settings={settings} onUpdate={updateSettings} />

        <ActivityLog />
        <AccountSection settings={settings} onLogout={handleLogout} onResetSettings={handleResetSettings} onResetDaily={handleResetDaily} />
        {status?.updateAvailable && (
          <div className="card" style={{ marginBottom: 8, background: "#7c4dff22", borderColor: "#7c4dff44" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#7c4dff" }}>{"Update v" + status.updateAvailable.version}</div>
            <div style={{ fontSize: 10, color: "#8b8b9e", marginBottom: 4 }}>{status.updateAvailable.changelog}</div>
          </div>
        )}
        <div style={{ textAlign: "center", fontSize: 10, color: "#8b8b9e", padding: 4 }}>{"v" + EXTENSION_VERSION + (status?.updateAvailable ? "" : " (latest)")}</div>
      </div>
    </div>
  );

  async function handleLogout(): Promise<void> {
    try {
      await updateSettings({
        extensionToken: null,
        isAuthenticated: false,
        userEmail: null,
        userRole: null,
        subscriptionStatus: null,
        isEnabled: false,
      });
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  async function handleResetSettings(): Promise<void> {
    try {
      // Keep auth fields, reset everything else to defaults
      const { extensionToken, isAuthenticated, userEmail, userRole, subscriptionStatus, ...defaults } = DEFAULT_SETTINGS;
      await updateSettings(defaults);
    } catch (error) {
      Sentry.captureException(error);
    }
  }

  async function handleResetDaily(): Promise<void> {
    try {
      const emptyDay = {
        date: new Date().toISOString().slice(0, 10),
        tradesExecuted: 0, winsCount: 0, lossesCount: 0,
        consecutiveLosses: 0, totalPnl: 0, trades: [],
        masanielloState: null, masanielloChannelStates: null,
        sorosState: null, isPaused: false, pauseReason: null,
      };
      await chrome.storage.local.set({ dailyState: emptyDay });
      // Unpause trading
      chrome.runtime.sendMessage({ type: 'RESUME_TRADING' }).catch(() => {});
    } catch (error) {
      Sentry.captureException(error);
    }
  }
};

interface HeaderProps {
  readonly settings: { readonly isEnabled: boolean };
  readonly onToggle: (enabled: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ settings, onToggle }) => (
  <div className="popup-header">
    <div className="popup-header-logo">
      <img src="assets/icon-32.png" alt="SnapTrade" />
      <h1>SnapTrade</h1>
    </div>
    <MasterSwitch isEnabled={settings.isEnabled} onToggle={onToggle} />
  </div>
);

interface AccountSectionProps {
  readonly settings: {
    readonly userEmail: string | null;
    readonly userRole: string | null;
    readonly subscriptionStatus: string | null;
  };
  readonly onLogout: () => void;
  readonly onResetSettings?: () => void;
  readonly onResetDaily?: () => void;
}

const AccountSection: React.FC<AccountSectionProps> = ({
  settings,
  onLogout,
  onResetSettings,
  onResetDaily,
}) => {
  const roleBadgeClass =
    settings.userRole === 'admin'
      ? 'badge badge-purple'
      : settings.userRole === 'premium'
        ? 'badge badge-green'
        : 'badge badge-gray';

  return (
    <div className="card account-section">
      <div className="account-info">
        <span className="account-email">{settings.userEmail ?? 'Unknown'}</span>
        <span>
          <span className={roleBadgeClass} style={{ fontSize: '10px' }}>
            {settings.userRole ?? 'free'}
          </span>
          {settings.subscriptionStatus && (
            <span
              className="text-secondary"
              style={{ fontSize: '10px', marginLeft: '6px' }}
            >
              {settings.subscriptionStatus}
            </span>
          )}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {onResetDaily && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { if (confirm('Reset daily stats and unpause trading?')) onResetDaily(); }}
            title="Reset daily P&L, trade count, and unpause"
          >
            Reset Day
          </button>
        )}
        {onResetSettings && (
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => { if (confirm('Reset ALL settings to defaults? (keeps login)')) onResetSettings(); }}
            title="Reset all settings to defaults"
          >
            Reset Settings
          </button>
        )}
        <button className="btn btn-sm btn-danger" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<ErrorBoundary><App /></ErrorBoundary>);
}
