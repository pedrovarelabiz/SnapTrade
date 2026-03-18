import { DailyReport } from '@/types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  reports: DailyReport[];
}

export function ReportsSummaryChart({ reports }: Props) {
  if (reports.length === 0) return null;

  const data = reports.slice(0, 14).reverse().map(r => {
    const date = new Date(r.date);
    return {
      label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      winRate: r.winRate,
      signals: r.totalSignals,
      wins: r.wins,
      losses: r.losses,
    };
  });

  const avgWinRate = Math.round(data.reduce((sum, d) => sum + d.winRate, 0) / data.length * 10) / 10;
  const totalSignals = data.reduce((sum, d) => sum + d.signals, 0);
  const totalWins = data.reduce((sum, d) => sum + d.wins, 0);

  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Win Rate Trend</h3>
          <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5">
            {data.length} days · {totalSignals} signals · {totalWins} wins · Avg {avgWinRate}%
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-st-call" />
            <span className="text-[var(--st-text-secondary)]">≥75%</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-st-premium" />
            <span className="text-[var(--st-text-secondary)]">≥65%</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-st-put" />
            <span className="text-[var(--st-text-secondary)]"><65%</span>
          </span>
        </div>
      </div>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="20%">
            <XAxis
              dataKey="label"
              tick={{ fill: '#8888a8', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#8888a8', fontSize: 9 }}
              domain={[50, 100]}
              axisLine={false}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                background: '#12121a',
                border: '1px solid #2a2a3e',
                borderRadius: '12px',
                fontSize: '11px',
              }}
              labelStyle={{ color: '#e8e8f0' }}
              formatter={(value: number) => [`${value}%`, 'Win Rate']}
            />
            <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.winRate >= 75 ? '#00e676' : entry.winRate >= 65 ? '#ffd740' : '#ff1744'}
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