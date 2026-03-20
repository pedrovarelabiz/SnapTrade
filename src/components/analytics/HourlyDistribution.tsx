import { HourlyData } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: HourlyData[];
}

export function HourlyDistribution({ data }: Props) {
  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <h3 className="text-sm font-semibold text-white mb-4">Signals by Hour (UTC)</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis dataKey="hour" tick={{ fill: '#8888a8', fontSize: 10 }} tickFormatter={v => `${v}:00`} />
            <YAxis tick={{ fill: '#8888a8', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ background: '#12121a', border: '1px solid #2a2a3e', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#e8e8f0' }}
              labelFormatter={v => `${v}:00 UTC`}
            />
            <Bar dataKey="signals" fill="#2979ff" radius={[4, 4, 0, 0]} name="Signals" />
            <Bar dataKey="wins" fill="#00e676" radius={[4, 4, 0, 0]} name="Wins" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
