import { PnlBreakdown } from '@/types';
import { formatPnl } from '@/lib/pnlCalculator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Info } from 'lucide-react';

interface Props {
  pnl: PnlBreakdown;
  children?: React.ReactNode;
}

export function PnlTooltip({ pnl, children }: Props) {
  const isProfit = pnl.netPnl >= 0;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        {children || (
          <button className="p-0.5 rounded text-[var(--st-text-secondary)] hover:text-white transition-colors">
            <Info size={11} />
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-[var(--st-bg-elevated)] border-[var(--st-border)] text-white p-3 max-w-[220px]">
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-[var(--st-text-secondary)] font-semibold">P&L Breakdown</div>
          <div className="space-y-1">
            {pnl.tradesExecuted.map((trade) => (
              <div key={trade.level} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--st-text-secondary)]">{trade.level === 0 ? 'Initial' : `Gale ${trade.level}`}</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono">${trade.amount.toFixed(2)}</span>
                  <span className={`font-bold ${trade.result === 'win' ? 'text-st-call' : 'text-st-put'}`}>
                    {trade.result === 'win' ? '✓' : '✗'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="h-px bg-[var(--st-border)]" />
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-[var(--st-text-secondary)]">Invested</span>
              <span className="text-white font-mono">${pnl.totalInvested.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--st-text-secondary)]">Return</span>
              <span className="text-white font-mono">${pnl.totalReturn.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--st-text-secondary)] font-semibold">Net P&L</span>
              <span className={`font-bold font-mono ${isProfit ? 'text-st-call' : 'text-st-put'}`}>{formatPnl(pnl.netPnl)}</span>
            </div>
          </div>
          <div className="text-[9px] text-[var(--st-text-secondary)]">Payout: {(pnl.payoutRate * 100).toFixed(0)}% · Base: ${pnl.baseAmount}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}