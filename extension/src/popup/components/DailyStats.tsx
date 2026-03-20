import React from 'react';
import type { DailyState, ExtensionSettings } from '../../types';

interface DailyStatsProps {
  readonly dailyState: DailyState | null;
  readonly settings: ExtensionSettings;
}

export const DailyStats: React.FC<DailyStatsProps> = ({
  dailyState,
  settings,
}) => {
  const trades = dailyState?.tradesExecuted ?? 0;
  const maxTrades = settings.maxDailyTrades;
  const wins = dailyState?.winsCount ?? 0;
  const losses = dailyState?.lossesCount ?? 0;
  const totalPnl = dailyState?.totalPnl ?? 0;

  const totalResolved = wins + losses;
  const winRate = totalResolved > 0 ? Math.round((wins / totalResolved) * 100) : 0;

  const nextStake = computeNextStake(dailyState, settings);

  const pnlColor = totalPnl > 0 ? '#00e676' : totalPnl < 0 ? '#ff1744' : '#8b8b9e';
  const pnlSign = totalPnl > 0 ? '+' : '';

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '8px',
        }}
      >
        <span className="text-secondary" style={{ fontSize: '11px', fontWeight: 600 }}>
          TODAY&apos;S STATS
        </span>
        <span className="text-secondary" style={{ fontSize: '11px' }}>
          {trades}/{maxTrades === 0 ? '\u221E' : maxTrades} trades
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '8px',
        }}
      >
        {/* Win / Loss */}
        <div>
          <div style={{ fontSize: '11px', color: '#8b8b9e', marginBottom: '4px' }}>
            Win / Loss
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span className="text-green" style={{ fontWeight: 700, fontSize: '16px' }}>
              {wins}
            </span>
            <span className="text-secondary">/</span>
            <span className="text-red" style={{ fontWeight: 700, fontSize: '16px' }}>
              {losses}
            </span>
            {totalResolved > 0 && (
              <span className="text-secondary" style={{ fontSize: '11px', marginLeft: '4px' }}>
                ({winRate}%)
              </span>
            )}
          </div>
          {totalResolved > 0 && (
            <div className="progress-bar" style={{ marginTop: '4px' }}>
              <div
                className="progress-fill"
                style={{
                  width: `${winRate}%`,
                  background: winRate >= 50 ? '#00e676' : '#ff1744',
                }}
              />
            </div>
          )}
        </div>

        {/* P&L */}
        <div>
          <div style={{ fontSize: '11px', color: '#8b8b9e', marginBottom: '4px' }}>
            P&amp;L
          </div>
          <div style={{ fontWeight: 700, fontSize: '16px', color: pnlColor }}>
            {pnlSign}${totalPnl.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Next Stake */}
      <div
        style={{
          marginTop: '8px',
          paddingTop: '8px',
          borderTop: '1px solid #2a2a3e',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span className="text-secondary" style={{ fontSize: '11px' }}>
          Next stake ({settings.strategy})
        </span>
        <span className="text-accent" style={{ fontWeight: 700, fontSize: '14px' }}>
          ${nextStake.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

function computeNextStake(
  dailyState: DailyState | null,
  settings: ExtensionSettings,
): number {
  const base = settings.defaultAmount;

  if (settings.strategy === 'off') {
    return base;
  }

  if (settings.strategy === 'masaniello' && dailyState?.masanielloState) {
    const state = dailyState.masanielloState;
    // Simplified: show the target profit based info
    // The actual calculator is used in the background; here we approximate
    return state.targetProfit > 0
      ? Math.min(base * settings.masanielloMaxBetMultiplier, state.targetProfit * 0.5)
      : base;
  }

  if (settings.strategy === 'soros' && dailyState?.sorosState) {
    return dailyState.sorosState.currentBet;
  }

  if (settings.strategy === 'simple') {
    const consecutive = dailyState?.consecutiveLosses ?? 0;
    if (consecutive === 0) return base;
    const galeLevel = Math.min(consecutive, settings.simpleMaxGale);
    return Math.round(base * Math.pow(settings.simpleMultiplier, galeLevel) * 100) / 100;
  }

  return base;
}
