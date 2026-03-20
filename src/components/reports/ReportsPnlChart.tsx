import { DailyReport } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  reports: DailyReport[];
}

export function ReportsPnlChart({ reports }: Props) {
  const reportsWithPnl = reports.filter(r => r.dailyPnl !== undefined);
  if (reportsWithPnl.length === 0) return null;

  const data = reportsWithPnl.slice(0, 14).reverse().map((r) => {
    const date = new Date(r.date);
    return {
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      pnl: r.dailyPnl!,
      winRate: r.winRate,
      signals: r.totalSignals,
      directWins: r.directWins ?? 0,
      galeWins: (r.gale1Wins ?? 0) + (r.gale2Wins ?? 0),
      losses: r.fullLosses ?? 0,
    };
  });

  const totalPnl = data.reduce((sum, d) => sum + d.pnl, 0);
  const profitDays = data.filter(d => d.pnl >= 0).length;

  let cumulative = 0;
  const cumulativeData = data.map(d => {
    cumulative += d.pnl;
    return { ...d, cumulative: Math.round(cumulative * 100) / 100 };
  });

  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">P&L by Day</h3>
          <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5">
            {data.length} days · {profitDays} profitable · Total: {formatPnl(Math.round(totalPnl * 100) / 100)}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-st-call/70" />
            <span className="text-[var(--st-text-secondary)]">Profit</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-st-put/70" />
            <span className="text-[var(--st-text-secondary)]">Loss</span>
          </span>
        </div>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={cumulativeData} barCategoryGap="15%">
            <XAxis
              dataKey="label"
              tick={{ fill: '#8888a8', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#8888a8', fontSize: 9 }}
              tickFormatter={v => `$${v}`}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: '#12121a',
                border: '1px solid #2a2a3e',
                borderRadius: '12px',
                fontSize: '11px',
              }}
              labelStyle={{ color: '#e8e8f0' }}
              formatter={(value: number, name: string) => {
                if (name === 'pnl') return [formatPnl(value), 'Daily P&L'];
                return [formatPnl(value), name];
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload;
                return (
                  <div className="px-3 py-2 rounded-xl bg-[var(--st-bg-elevated)] border border-[var(--st-border)] shadow-xl">
                    <p className="text-[11px] font-medium text-white mb-1">{label}</p>
                    <div className="space-y-0.5 text-[10px]">
                      <p className={d.pnl >= 0 ? 'text-st-call' : 'text-st-put'}>
                        P&L: <span className="font-bold">{formatPnl(d.pnl)}</span>
                      </p>
                      <p className="text-[var(--st-text-secondary)]">
                        Win Rate: {d.winRate}% · {d.signals} signals
                      </p>
                      <p className="text-[var(--st-text-secondary)]">
                        {d.directWins} direct · {d.galeWins} gale · {d.losses} loss
                      </p>
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="#2a2a3e" strokeWidth={1} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {cumulativeData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.pnl >= 0 ? '#00e676' : '#ff1744'}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}