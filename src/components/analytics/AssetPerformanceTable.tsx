import { AssetPerformance } from '@/types';
import { TrendingUp } from 'lucide-react';

interface Props {
  data: AssetPerformance[];
}

const assetFlags: Record<string, string> = {
  'EUR/USD': '🇪🇺🇺🇸', 'GBP/JPY': '🇬🇧🇯🇵', 'USD/CHF': '🇺🇸🇨🇭', 'AUD/USD': '🇦🇺🇺🇸',
  'EUR/GBP': '🇪🇺🇬🇧', 'USD/JPY': '🇺🇸🇯🇵', 'NZD/USD': '🇳🇿🇺🇸', 'EUR/JPY': '🇪🇺🇯🇵',
  'GBP/USD': '🇬🇧🇺🇸', 'AUD/JPY': '🇦🇺🇯🇵',
};

export function AssetPerformanceTable({ data }: Props) {
  const sorted = [...data].sort((a, b) => b.winRate - a.winRate);

  return (
    <div className="rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)] overflow-hidden">
      <div className="p-4 border-b border-[var(--st-border)]">
        <h3 className="text-sm font-semibold text-white">Asset Leaderboard</h3>
        <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5">Ranked by win rate</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--st-border)]">
              <th className="text-left text-[10px] font-medium text-[var(--st-text-secondary)] uppercase tracking-wider px-4 py-2.5">#</th>
              <th className="text-left text-[10px] font-medium text-[var(--st-text-secondary)] uppercase tracking-wider px-4 py-2.5">Asset</th>
              <th className="text-center text-[10px] font-medium text-[var(--st-text-secondary)] uppercase tracking-wider px-4 py-2.5">Signals</th>
              <th className="text-center text-[10px] font-medium text-[var(--st-text-secondary)] uppercase tracking-wider px-4 py-2.5">W/L</th>
              <th className="text-left text-[10px] font-medium text-[var(--st-text-secondary)] uppercase tracking-wider px-4 py-2.5 min-w-[140px]">Win Rate</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((asset, i) => {
              const isTop3 = i < 3;
              const winRateColor = asset.winRate >= 80 ? 'text-st-call' : asset.winRate >= 75 ? 'text-st-premium' : 'text-st-info';
              const barColor = asset.winRate >= 80 ? 'bg-st-call' : asset.winRate >= 75 ? 'bg-st-premium' : 'bg-st-info';

              return (
                <tr key={asset.asset} className="border-b border-[var(--st-border)] last:border-0 hover:bg-[var(--st-bg-elevated)]/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold tabular-nums ${isTop3 ? 'text-st-premium' : 'text-[var(--st-text-secondary)]'}`}>
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{assetFlags[asset.asset] || '🌐'}</span>
                      <span className="text-sm font-medium text-white">{asset.asset}</span>
                      {isTop3 && (
                        <TrendingUp size={12} className="text-st-call" />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-[var(--st-text-primary)] tabular-nums">{asset.totalSignals}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="text-xs font-semibold text-st-call tabular-nums">{asset.wins}</span>
                      <span className="text-[10px] text-[var(--st-text-secondary)]">/</span>
                      <span className="text-xs font-semibold text-st-put tabular-nums">{asset.losses}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex-1 h-2 rounded-full bg-[var(--st-border)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${asset.winRate}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold tabular-nums ${winRateColor} min-w-[38px] text-right`}>
                        {asset.winRate}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}