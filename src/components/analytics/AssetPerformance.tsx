import { AssetPerformance as AssetPerf } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface Props {
  data: AssetPerf[];
}

export function AssetPerformanceChart({ data }: Props) {
  return (
    <div className="p-5 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <h3 className="text-sm font-semibold text-white mb-4">Performance by Asset</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.slice(0, 8)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
            <XAxis type="number" tick={{ fill: '#8888a8', fontSize: 10 }} domain={[0, 100]} />
            <YAxis type="category" dataKey="asset" tick={{ fill: '#8888a8', fontSize: 10 }} width={70} />
            <Tooltip
              contentStyle={{ background: '#12121a', border: '1px solid #2a2a3e', borderRadius: '12px', fontSize: '12px' }}
              labelStyle={{ color: '#e8e8f0' }}
            />
            <Bar dataKey="winRate" fill="#7c4dff" radius={[0, 4, 4, 0]} name="Win Rate %" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
