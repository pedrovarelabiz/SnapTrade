import React, { useState, useEffect } from 'react';
import { API_BASE } from '../../lib/constants';

interface AiStatsData {
  today: { total: number; resolved: number; wins: number; losses: number; winRate: number | null };
  weekly: Array<{
    model: string; source: string; total: number; resolved: number;
    wins: number; losses: number; winRate: number | null;
    avgConfidence: number; avgLocalConfidence: number;
  }>;
}

export const AIStats: React.FC<{ readonly token: string | null }> = ({ token }) => {
  const [stats, setStats] = useState<AiStatsData | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!token || !expanded) return;
    fetch(`${API_BASE}/extension/ai-stats`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, [token, expanded]);

  const today = stats?.today;
  const hasData = today && today.total > 0;

  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: 'none', border: 'none', color: '#c0c0d0', fontSize: '11px',
          fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left',
          padding: '4px 0', display: 'flex', justifyContent: 'space-between',
        }}
      >
        <span>AI ACCURACY</span>
        <span>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: 6 }}>
          {!hasData ? (
            <div style={{ color: '#5a5a6e', fontSize: '11px', textAlign: 'center', padding: '8px 0' }}>
              No AI predictions yet today
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '12px', marginBottom: 6 }}>
                <StatBox label="Today" value={`${today.wins}W / ${today.losses}L`}
                  sub={today.winRate !== null ? `${today.winRate}%` : '-'}
                  color={today.winRate !== null && today.winRate >= 60 ? '#00e676' : '#ff5252'} />
                <StatBox label="Calls" value={String(today.total)} sub={`${today.resolved} resolved`} color="#8b8b9e" />
              </div>
              {stats?.weekly && stats.weekly.length > 0 && (
                <div style={{ fontSize: '10px', color: '#8b8b9e', marginTop: 4 }}>
                  {stats.weekly.map((w, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span>{w.model}/{w.source}</span>
                      <span>{w.resolved > 0 ? `${w.winRate}% (${w.wins}W/${w.losses}L)` : `${w.total} pending`}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const StatBox: React.FC<{
  readonly label: string; readonly value: string;
  readonly sub: string; readonly color: string;
}> = ({ label, value, sub, color }) => (
  <div style={{ flex: 1, textAlign: 'center' }}>
    <div style={{ fontSize: '10px', color: '#8b8b9e' }}>{label}</div>
    <div style={{ fontSize: '14px', fontWeight: 700, color }}>{value}</div>
    <div style={{ fontSize: '10px', color }}>{sub}</div>
  </div>
);
