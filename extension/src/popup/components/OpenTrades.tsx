import React from 'react';

interface OpenTrade {
  id: string;
  asset: string;
  direction: string;
  amount: number;
  openTime: number;
  closeTime: number;
  profit?: number;
  source?: string;
}

interface Props {
  readonly trades: OpenTrade[];
}

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  indicators: { label: 'IND', color: '#00e676' },
  ai:         { label: 'AI',  color: '#7c4dff' },
  backend:    { label: 'BE',  color: '#2979ff' },
  telegram:   { label: 'TG',  color: '#ff9100' },
  manual:     { label: 'MAN', color: '#78909c' },
};

function formatAsset(asset: string): string {
  // Handle already-formatted names (e.g. "EUR/USD OTC")
  if (asset.includes('/')) {
    return asset.replace(/_otc/i, '').replace(/\s*OTC\s*/i, '').trim()
      + (asset.toLowerCase().includes('otc') ? ' OTC' : '');
  }
  const isOtc = asset.includes('_otc') || asset.toLowerCase().includes('otc');
  const clean = asset.replace(/_otc/i, '').replace(/OTC/i, '').trim();
  // Split 6-char forex pairs
  const base = clean.length >= 6 && !clean.includes('-')
    ? clean.slice(0, 3) + '/' + clean.slice(3)
    : clean;
  return isOtc ? base + ' OTC' : base;
}

function getSource(trade: OpenTrade): { label: string; color: string } {
  // Prefer explicit source field (from enrichTradesWithSource)
  if (trade.source && SOURCE_LABELS[trade.source]) {
    return SOURCE_LABELS[trade.source];
  }
  // Fallback: detect from trade ID
  const id = trade.id;
  if (id.includes('llm_') || id.includes('ai_')) return SOURCE_LABELS.ai;
  if (id.includes('backend_')) return SOURCE_LABELS.backend;
  if (id.includes('auto_') || id.startsWith('st_')) return SOURCE_LABELS.indicators;
  return { label: 'PO', color: '#555' };
}

function formatTimer(closeTime: number): string {
  const diff = Math.max(0, closeTime - Date.now());
  if (diff <= 0) return '00:00';
  const m = Math.floor(diff / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function OpenTrades({ trades }: Props) {
  if (trades.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#e0e0e0' }}>
          Open Trades ({trades.length})
        </span>
      </div>
      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
        {trades.map((t, i) => {
          const src = getSource(t);
          const dirColor = t.direction === 'CALL' ? '#4CAF50' : '#F44336';
          const arrow = t.direction === 'CALL' ? '\u25B2' : '\u25BC';
          const profitColor = t.profit != null
            ? (t.profit > 0 ? '#4CAF50' : t.profit < 0 ? '#F44336' : '#888')
            : '#888';
          return (
            <div key={t.id + '_' + i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 6px', marginBottom: 2, borderRadius: 4,
              background: 'rgba(255,255,255,0.03)', borderLeft: `2px solid ${dirColor}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
                <span style={{
                  background: src.color, color: '#fff', fontSize: 8, padding: '1px 4px',
                  borderRadius: 3, fontWeight: 700, flexShrink: 0,
                }}>{src.label}</span>
                <span style={{ fontSize: 10, color: '#e0e0e0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatAsset(t.asset)}
                </span>
                <span style={{ fontSize: 10, color: dirColor, fontWeight: 600 }}>
                  {arrow}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: '#aaa' }}>${t.amount.toFixed(2)}</span>
                {t.profit != null && t.profit !== 0 && (
                  <span style={{ fontSize: 9, color: profitColor, fontWeight: 600 }}>
                    {t.profit > 0 ? '+' : ''}{t.profit.toFixed(2)}
                  </span>
                )}
                <span style={{ fontSize: 9, color: '#666', fontFamily: 'monospace' }}>
                  {t.closeTime > 0 ? formatTimer(t.closeTime) : '--:--'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
