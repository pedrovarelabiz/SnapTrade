import React, { useState } from 'react';
import type { ExtensionSettings } from '../../types';

interface TradeSettingsProps {
  readonly settings: ExtensionSettings;
  readonly onUpdate: (partial: Partial<ExtensionSettings>) => Promise<void>;
}

const QUICK_AMOUNTS = [1, 5, 10, 25];

const MODE_OPTIONS: readonly {
  readonly value: ExtensionSettings['executionMode'];
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'manual',
    label: 'Manual',
    description: 'Signals shown as notifications. You click to execute.',
  },
  {
    value: 'semi-auto',
    label: 'Semi-Auto',
    description: 'Signals auto-prepare. You confirm before execution.',
  },
  {
    value: 'auto',
    label: 'Auto',
    description: 'Signals execute automatically without confirmation.',
  },
];

export const TradeSettings: React.FC<TradeSettingsProps> = ({
  settings,
  onUpdate,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="section">
      <div
        className={`section-header ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="section-title">Trade Settings</span>
        <span className={`section-chevron ${isOpen ? 'open' : ''}`}>
          &#9660;
        </span>
      </div>

      {isOpen && (
        <div className="section-body">
          {/* Execution Mode */}
          <div className="field mb-8">
            <span className="field-label">Execution Mode</span>
            <div className="radio-group" style={{ marginTop: '4px' }}>
              {MODE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`radio-option ${settings.executionMode === opt.value ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="executionMode"
                    value={opt.value}
                    checked={settings.executionMode === opt.value}
                    onChange={() => onUpdate({ executionMode: opt.value })}
                  />
                  <div>
                    <div className="radio-label">{opt.label}</div>
                    <div className="radio-desc">{opt.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Default Amount */}
          <div className="field mb-8">
            <span className="field-label">Default Amount ($)</span>
            <div className="field-row" style={{ marginTop: '4px' }}>
              <input
                type="number"
                className="input input-sm"
                style={{ width: '80px' }}
                min={0.01}
                step={0.01}
                value={settings.defaultAmount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    onUpdate({ defaultAmount: val });
                  }
                }}
              />
              <div className="quick-amounts">
                {QUICK_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    className={`btn btn-outline ${settings.defaultAmount === amt ? 'active' : ''}`}
                    onClick={() => onUpdate({ defaultAmount: amt })}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Signal Types */}
          <div className="field mb-8">
            <span className="field-label">Signal Types</span>
            <div style={{ marginTop: '4px' }}>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.acceptScheduled}
                  onChange={(e) => onUpdate({ acceptScheduled: e.target.checked })}
                />
                <span>Scheduled signals</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={settings.acceptInstant}
                  onChange={(e) => onUpdate({ acceptInstant: e.target.checked })}
                />
                <span>Instant signals</span>
              </label>
            </div>
          </div>

          {/* Instant Delay */}
          <div className="field">
            <div className="field-row">
              <span className="field-label">Instant Delay</span>
              <span className="text-accent" style={{ fontSize: '12px', fontWeight: 600 }}>
                {settings.instantDelay}s
              </span>
            </div>
            <input
              type="range"
              className="slider"
              min={0}
              max={10}
              step={1}
              value={settings.instantDelay}
              onChange={(e) => onUpdate({ instantDelay: parseInt(e.target.value, 10) })}
              style={{ marginTop: '4px' }}
            />
            <div
              className="text-secondary"
              style={{ fontSize: '10px', display: 'flex', justifyContent: 'space-between' }}
            >
              <span>0s</span>
              <span>10s</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
