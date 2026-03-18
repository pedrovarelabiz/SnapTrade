import { PnlPoint } from '@/types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPnl } from '@/lib/pnlCalculator';

interface Props {
  data: PnlPoint[];
}

export function PnlCurve({ data }: Props) {
  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <h3 className="text-sm font-semibold text-white mb-4">Cumulative P&L</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis dataKey="date" tick={{ fill: '#8888a8', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fill: '#8888a8', fontSize: 10 }} tickFormatter={v => `$${v}`} />
            <Tooltip
              contentStyle={{ background: '#12121a', border: '1px solid #2a2a3e', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#e8e8f0' }}
              formatter={(value: number, name: string) => [
                formatPnl(value),
                name === 'cumulative' ? 'Cumulative' : 'Daily',
              ]}
            />
            <Area type="monotone" dataKey="cumulative" stroke="#00e676" strokeWidth={2} fill="url(#pnlGradient)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}