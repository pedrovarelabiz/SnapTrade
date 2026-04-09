import { Signal } from '@/types';
import { getAssetFlag } from '@/lib/assetFlags';
import { formatPnl } from '@/lib/pnlCalculator';
import { Trophy, TrendingUp, TrendingDown } from 'lucide-react';

interface AssetStat {
  asset: string;
  wins: number;
  losses: number;
  total: number;
  winRate: number;
  pnl: number;
  hasPnl: boolean;
}

interface Props {
  signals: Signal[];
}

export function TopPerformers({ signals }: Props) {
  const resolved = signals.filter(s => s.result === 'win' || s.result === 'loss');

  if (resolved.length < 3) return null;

  const assetMap = new Map<string, AssetStat>();

  for (const s of resolved) {
    const existing = assetMap.get(s.asset) || {
      asset: s.asset,
      wins: 0,
      losses: 0,
      total: 0,
      winRate: 0,
      pnl: 0,
      hasPnl: false,
    };

    if (s.result === 'win') existing.wins++;
    else existing.losses++;
    existing.total++;
    if (s.pnl?.netPnl !== undefined) {
      existing.pnl += s.pnl.netPnl;
      existing.hasPnl = true;
    }

    assetMap.set(s.asset, existing);
  }

  const assets = Array.from(assetMap.values())
    .map(a => ({ ...a, winRate: Math.round((a.wins / a.total) * 100), pnl: Math.round(a.pnl * 100) / 100 }))
    .filter(a => a.total >= 2)
    .sort((a, b) => b.winRate - a.winRate || b.pnl - a.pnl);

  if (assets.length === 0) return null;

  const top = assets.slice(0, 4);

  return (
    <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} className="text-st-premium" />
        <span className="text-sm font-semibold text-white">Top Performers</span>
        <span className="text-[10px] text-[var(--st-text-secondary)]">({resolved.length} signals)</span>
      </div>

      <div className="space-y-2">
        {top.map((asset, i) => {
          const isTop = i === 0;
          return (
            <div
              key={asset.asset}
              className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${
                isTop
                  ? 'bg-st-premium/5 border border-st-premium/15'
                  : 'bg-[var(--st-bg-elevated)]'
              }`}
            >
              {/* Rank */}
              <span className={`text-xs font-bold w-5 text-center tabular-nums ${
                isTop ? 'text-st-premium' : 'text-[var(--st-text-secondary)]'
              }`}>
                {i + 1}
              </span>

              {/* Asset */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm flex-shrink-0">{getAssetFlag(asset.asset)}</span>
                <span className="text-xs font-medium text-white truncate">{asset.asset}</span>
              </div>

              {/* W/L */}
              <div className="flex items-center gap-1 text-[10px] flex-shrink-0">
                <span className="text-st-call font-semibold tabular-nums">{asset.wins}W</span>
                <span className="text-[var(--st-text-secondary)]">/</span>
                <span className="text-st-put font-semibold tabular-nums">{asset.losses}L</span>
              </div>

              {/* Win Rate */}
              <div className="flex items-center gap-1 flex-shrink-0">
                {asset.winRate >= 75 ? (
                  <TrendingUp size={10} className="text-st-call" />
                ) : asset.winRate < 50 ? (
                  <TrendingDown size={10} className="text-st-put" />
                ) : null}
                <span className={`text-xs font-bold tabular-nums ${
                  asset.winRate >= 75 ? 'text-st-call' : asset.winRate >= 50 ? 'text-st-premium' : 'text-st-put'
                }`}>
                  {asset.winRate}%
                </span>
              </div>

              {/* P&L */}
              {asset.hasPnl && (
                <span className={`text-[10px] font-bold tabular-nums flex-shrink-0 min-w-[50px] text-right ${
                  asset.pnl >= 0 ? 'text-st-call' : 'text-st-put'
                }`}>
                  {formatPnl(asset.pnl)}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}