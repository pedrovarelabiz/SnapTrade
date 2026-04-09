import { WinRatePoint } from '@/types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: WinRatePoint[];
}

export function WinRateChart({ data }: Props) {
  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <h3 className="text-sm font-semibold text-white mb-4">Win Rate Over Time</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis dataKey="date" tick={{ fill: '#8888a8', fontSize: 10 }} tickFormatter={v => v.slice(5)} />
            <YAxis tick={{ fill: '#8888a8', fontSize: 10 }} domain={[50, 100]} />
            <Tooltip
              contentStyle={{ background: '#12121a', border: '1px solid #2a2a3e', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#e8e8f0' }}
            />
            <Line type="monotone" dataKey="winRate" stroke="#00e676" strokeWidth={2} dot={false} name="Win Rate %" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
