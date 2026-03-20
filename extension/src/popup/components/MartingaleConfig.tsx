import React, { useState } from 'react';
import type { ExtensionSettings } from '../../types';

interface Props {
  settings: ExtensionSettings;
  onUpdate: (partial: Partial<ExtensionSettings>) => void;
}

export function MartingaleConfig({ settings, onUpdate }: Props) {
  const [open, setOpen] = useState(false);

  const strategies: Array<{ value: ExtensionSettings['strategy']; label: string; desc: string }> = [
    { value: 'off', label: 'Off', desc: 'Fixed amount, no adjustment' },
    { value: 'masaniello', label: 'Masaniello', desc: 'Progressive stakes via combinatorial formula' },
    { value: 'soros', label: 'Soros', desc: 'Compound profits after wins' },
    { value: 'simple', label: 'Simple MG', desc: 'Multiply bet after loss' },
  ];

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>Strategy</span>
        <span style={{ color: '#8b8b9e', fontSize: 12 }}>{open ? '\u25B2' : '\u25BC'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {strategies.map(s => (
              <label key={s.value} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '6px 8px', borderRadius: 8, background: settings.strategy === s.value ? '#7c4dff22' : 'transparent', border: settings.strategy === s.value ? '1px solid #7c4dff44' : '1px solid transparent', cursor: 'pointer' }}>
                <input type="radio" name="strategy" checked={settings.strategy === s.value} onChange={() => onUpdate({ strategy: s.value })} style={{ marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#8b8b9e' }}>{s.desc}</div>
                </div>
              </label>
            ))}
          </div>
          {settings.strategy === 'masaniello' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#8b8b9e' }}>Trades/day</label>
                <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} value={settings.masanielloTotalTrades} onChange={e => onUpdate({ masanielloTotalTrades: parseInt(e.target.value) || 20 })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#8b8b9e' }}>Expected wins</label>
                <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} value={settings.masanielloExpectedWins} onChange={e => onUpdate({ masanielloExpectedWins: parseInt(e.target.value) || 17 })} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#8b8b9e' }}>Max bet mult.</label>
                <input type="number" className="input" style={{ width: 60, textAlign: 'center' }} step="0.5" value={settings.masanielloMaxBetMultiplier} onChange={e => onUpdate({ masanielloMaxBetMultiplier: parseFloat(e.target.value) || 5 })} />
              </div>
            </div>
          )}
          {settings.strategy === 'soros' && (
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontSize: 12, color: '#8b8b9e' }}>Max compound levels</label>
              <select className="input" style={{ width: 60 }} value={settings.sorosMaxLevels} onChange={e => onUpdate({ sorosMaxLevels: parseInt(e.target.value) })}>
                {[2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          )}
          {settings.strategy === 'simple' && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#8b8b9e' }}>Max gale</label>
                <select className="input" style={{ width: 60 }} value={settings.simpleMaxGale} onChange={e => onUpdate({ simpleMaxGale: parseInt(e.target.value) })}>
                  {[0,1,2].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: '#8b8b9e' }}>Multiplier</label>
                <select className="input" style={{ width: 60 }} value={settings.simpleMultiplier} onChange={e => onUpdate({ simpleMultiplier: parseFloat(e.target.value) })}>
                  {[1.5,2.0,2.5,3.0].map(n => <option key={n} value={n}>x{n}</option>)}
                </select>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                <input type="checkbox" checked={settings.autoExecuteGale} onChange={e => onUpdate({ autoExecuteGale: e.target.checked })} />
                Auto-execute gale
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
