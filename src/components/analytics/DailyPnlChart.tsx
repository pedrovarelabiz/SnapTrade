import { PnlPoint } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  data: PnlPoint[];
}

export function DailyPnlChart({ data }: Props) {
  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)), 1);
  const yDomain = [-Math.ceil(maxAbs * 1.1), Math.ceil(maxAbs * 1.1)];

  const totalPnl = data.reduce((sum, d) => sum + d.pnl, 0);
  const avgPnl = data.length > 0 ? totalPnl / data.length : 0;
  const profitDays = data.filter(d => d.pnl >= 0).length;
  const lossDays = data.filter(d => d.pnl < 0).length;

  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white">Daily P&L</h3>
          <p className="text-[10px] text-[var(--st-text-secondary)] mt-0.5">
            {data.length} days · Avg {formatPnl(Math.round(avgPnl * 100) / 100)}/day · {profitDays} profit / {lossDays} loss
          </p>
        </div>
        <span className={`text-sm font-bold tabular-nums ${totalPnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
          {formatPnl(Math.round(totalPnl * 100) / 100)}
        </span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap="15%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#8888a8', fontSize: 10 }}
              tickFormatter={v => v.slice(5)}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#8888a8', fontSize: 10 }}
              tickFormatter={v => `$${v}`}
              domain={yDomain}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                background: '#12121a',
                border: '1px solid #2a2a3e',
                borderRadius: '12px',
                fontSize: '12px',
              }}
              labelStyle={{ color: '#e8e8f0' }}
              formatter={(value: number) => [formatPnl(value), 'Daily P&L']}
            />
            <ReferenceLine y={0} stroke="#2a2a3e" strokeWidth={1} />
            <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
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