import React from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createRoot } from 'react-dom/client';
import './popup.css';
import { useSettings } from './hooks/useSettings';
import { EXTENSION_VERSION } from '../lib/constants';
import { useStatus } from './hooks/useSignals';
import { LoginForm } from './components/LoginForm';
import { MasterSwitch } from './components/MasterSwitch';
import { StatusPanel } from './components/StatusPanel';
import { DailyStats } from './components/DailyStats';
import { SignalFeed } from './components/SignalFeed';
import { TradeSettings } from './components/TradeSettings';
import { MartingaleConfig } from './components/MartingaleConfig';
import { RiskManagement } from './components/RiskManagement';

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
          <AccountSection settings={settings} onLogout={handleLogout} />
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
            chrome.runtime.sendMessage({ type: 'RESUME_TRADING' });
          }}
        />

        <DailyStats
          dailyState={status?.dailyState ?? null}
          settings={settings}
        />

        <SignalFeed
          pendingSignals={status?.pendingSignals ?? []}
          recentTrades={status?.dailyState?.trades ?? []}
          onConfirm={(signalId) => {
            chrome.runtime.sendMessage({ type: 'CONFIRM_TRADE', signalId });
          }}
          onCancel={(signalId) => {
            chrome.runtime.sendMessage({ type: 'CANCEL_TRADE', signalId });
          }}
        />

        <TradeSettings settings={settings} onUpdate={updateSettings} />
        <MartingaleConfig settings={settings} onUpdate={updateSettings} />
        <RiskManagement settings={settings} onUpdate={updateSettings} />

        <AccountSection settings={settings} onLogout={handleLogout} />
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
    await updateSettings({
      extensionToken: null,
      isAuthenticated: false,
      userEmail: null,
      userRole: null,
      subscriptionStatus: null,
      isEnabled: false,
    });
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
}

const AccountSection: React.FC<AccountSectionProps> = ({
  settings,
  onLogout,
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
      <button className="btn btn-sm btn-danger" onClick={onLogout}>
        Logout
      </button>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<ErrorBoundary><App /></ErrorBoundary>);
}
