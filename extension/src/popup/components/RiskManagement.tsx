import React, { useState } from 'react';
import type { ExtensionSettings } from '../../types';

interface Props {
  settings: ExtensionSettings;
  onUpdate: (partial: Partial<ExtensionSettings>) => void;
}

export function RiskManagement({ settings, onUpdate }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Risk Management</span>
        <span style={{ color: '#8b8b9e', fontSize: 12 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#8b8b9e' }}>Account Mode</label>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={'btn btn-sm ' + (settings.tradingMode === 'demo' ? 'btn-success' : 'btn-outline')}
                onClick={() => onUpdate({ tradingMode: 'demo' })}
                style={{ minWidth: 50 }}
              >
                DEMO
              </button>
              <button
                className={'btn btn-sm ' + (settings.tradingMode === 'real' ? 'btn-danger' : 'btn-outline')}
                onClick={() => onUpdate({ tradingMode: 'real' })}
                style={{ minWidth: 50 }}
              >
                REAL
              </button>
            </div>
          </div>
          <div style={{ fontSize: 10, color: settings.tradingMode === 'real' ? '#ff1744' : '#8b8b9e', marginTop: -6 }}>
            {settings.tradingMode === 'real'
              ? 'Trades will execute on your REAL account'
              : 'Trades will only execute on DEMO account'}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#8b8b9e' }}>Max daily trades</label>
            <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} value={settings.maxDailyTrades} onChange={e => onUpdate({ maxDailyTrades: parseInt(e.target.value) || 0 })} placeholder="0" />
          </div>
          <div style={{ fontSize: 10, color: '#8b8b9e', marginTop: -6 }}>0 = unlimited</div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#8b8b9e' }}>Max consecutive losses</label>
            <select className="input" style={{ width: 70 }} value={settings.maxConsecutiveLosses} onChange={e => onUpdate({ maxConsecutiveLosses: parseInt(e.target.value) })}>
              <option value={0}>Off</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={5}>5</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#8b8b9e' }}>Min balance protection</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#8b8b9e' }}>$</span>
              <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} value={settings.minBalanceProtection} onChange={e => onUpdate({ minBalanceProtection: parseInt(e.target.value) || 0 })} placeholder="0" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: '#8b8b9e' }}>Max single trade</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#8b8b9e' }}>$</span>
              <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} value={settings.maxSingleTradeAmount} onChange={e => onUpdate({ maxSingleTradeAmount: parseInt(e.target.value) || 0 })} placeholder="0" />
            </div>
          </div>

          <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: 8, marginTop: 4 }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
              <input type="checkbox" checked={settings.soundAlerts} onChange={e => onUpdate({ soundAlerts: e.target.checked })} />
              Sound alerts
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 6 }}>
              <input type="checkbox" checked={settings.browserNotifications} onChange={e => onUpdate({ browserNotifications: e.target.checked })} />
              Browser notifications
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 6 }}>
              <input type="checkbox" checked={settings.showOverlay} onChange={e => onUpdate({ showOverlay: e.target.checked })} />
              Show overlay on Pocket Option
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
