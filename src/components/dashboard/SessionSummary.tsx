import { Signal } from '@/types';
import { formatPnl } from '@/lib/pnlCalculator';
import { Globe, TrendingUp, TrendingDown } from 'lucide-react';

interface SessionData {
  name: string;
  emoji: string;
  openHour: number;
  closeHour: number;
  color: string;
  bg: string;
  borderColor: string;
}

const sessions: SessionData[] = [
  { name: 'Sydney', emoji: '🇦🇺', openHour: 22, closeHour: 7, color: 'text-st-info', bg: 'bg-st-info/10', borderColor: 'border-st-info/20' },
  { name: 'Tokyo', emoji: '🇯🇵', openHour: 0, closeHour: 9, color: 'text-st-put', bg: 'bg-st-put/10', borderColor: 'border-st-put/20' },
  { name: 'London', emoji: '🇬🇧', openHour: 8, closeHour: 17, color: 'text-st-accent', bg: 'bg-st-accent/10', borderColor: 'border-st-accent/20' },
  { name: 'New York', emoji: '🇺🇸', openHour: 13, closeHour: 22, color: 'text-st-call', bg: 'bg-st-call/10', borderColor: 'border-st-call/20' },
];

function getSessionForHour(utcHour: number): string[] {
  const matched: string[] = [];
  for (const s of sessions) {
    if (s.openHour < s.closeHour) {
      if (utcHour >= s.openHour && utcHour < s.closeHour) matched.push(s.name);
    } else {
      if (utcHour >= s.openHour || utcHour < s.closeHour) matched.push(s.name);
    }
  }
  return matched.length > 0 ? matched : ['Off-hours'];
}

interface Props {
  signals: Signal[];
}

export function SessionSummary({ signals }: Props) {
  const resolved = signals.filter(s => s.result === 'win' || s.result === 'loss');

  if (resolved.length < 3) return null;

  const sessionStats = sessions.map(session => {
    const sessionSignals = resolved.filter(s => {
      const hour = new Date(s.entryTime).getUTCHours();
      return getSessionForHour(hour).includes(session.name);
    });

    const wins = sessionSignals.filter(s => s.result === 'win').length;
    const losses = sessionSignals.filter(s => s.result === 'loss').length;
    const total = wins + losses;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    const pnl = sessionSignals.reduce((sum, s) => {
      if (s.pnl?.netPnl !== undefined) return sum + s.pnl.netPnl;
      return sum;
    }, 0);
    const hasPnl = sessionSignals.some(s => s.pnl !== undefined);

    return { ...session, wins, losses, total, winRate, pnl: Math.round(pnl * 100) / 100, hasPnl };
  }).filter(s => s.total > 0);

  if (sessionStats.length === 0) return null;

  const bestSession = sessionStats.reduce((best, s) => s.winRate > best.winRate ? s : best, sessionStats[0]);

  return (
    <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Globe size={14} className="text-[var(--st-text-secondary)]" />
          <span className="text-sm font-semibold text-white">Session Performance</span>
        </div>
        {bestSession && bestSession.total >= 2 && (
          <span className="text-[10px] text-[var(--st-text-secondary)]">
            Best: <span className={bestSession.color}>{bestSession.emoji} {bestSession.name}</span> ({bestSession.winRate}%)
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {sessionStats.map(session => (
          <div
            key={session.name}
            className={`p-3 rounded-xl ${session.bg} border ${session.borderColor}`}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-sm">{session.emoji}</span>
              <span className={`text-xs font-semibold ${session.color}`}>{session.name}</span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--st-text-secondary)]">Win Rate</span>
                <span className={`text-xs font-bold tabular-nums ${
                  session.winRate >= 75 ? 'text-st-call' : session.winRate >= 50 ? 'text-st-premium' : 'text-st-put'
                }`}>
                  {session.winRate}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--st-text-secondary)]">W/L</span>
                <span className="text-[10px] text-[var(--st-text-primary)] tabular-nums">
                  {session.wins}/{session.losses}
                </span>
              </div>
              {session.hasPnl && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--st-text-secondary)]">P&L</span>
                  <span className={`text-[10px] font-bold tabular-nums ${session.pnl >= 0 ? 'text-st-call' : 'text-st-put'}`}>
                    {formatPnl(session.pnl)}
                  </span>
                </div>
              )}
            </div>
            {/* Mini bar */}
            <div className="h-1 rounded-full bg-[var(--st-border)] overflow-hidden mt-2">
              <div
                className={`h-full rounded-full ${session.winRate >= 75 ? 'bg-st-call' : session.winRate >= 50 ? 'bg-st-premium' : 'bg-st-put'}`}
                style={{ width: `${session.winRate}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}