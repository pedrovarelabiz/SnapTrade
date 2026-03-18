import React from 'react';
import { Signal } from '@/types';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  signals: Signal[];
}

interface DayData {
  label: string;
  wins: number;
  losses: number;
  total: number;
}

export function WeeklyMiniChart({ signals }: Props) {
  const days: DayData[] = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toDateString();
    const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

    const daySignals = signals.filter(
      (s) => new Date(s.createdAt).toDateString() === dateStr
    );
    const wins = daySignals.filter((s) => s.result === 'win').length;
    const losses = daySignals.filter((s) => s.result === 'loss').length;

    days.push({ label: dayLabel, wins, losses, total: wins + losses });
  }

  const maxTotal = Math.max(...days.map((d) => d.total), 1);
  const totalWins = days.reduce((sum, d) => sum + d.wins, 0);
  const totalLosses = days.reduce((sum, d) => sum + d.losses, 0);
  const totalResolved = totalWins + totalLosses;
  const weeklyWinRate = totalResolved > 0 ? Math.round((totalWins / totalResolved) * 100) : 0;

  const prevWeekRate = 74; // Mock previous week for trend
  const trending = weeklyWinRate >= prevWeekRate ? 'up' : 'down';

  return (
    <div className="p-4 rounded-xl bg-[var(--st-bg-card)] border border-[var(--st-border)]">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">7-Day Performance</span>
        </div>
        <div className="flex items-center gap-2">
          {totalResolved > 0 && (
            <div className="flex items-center gap-1">
              {trending === 'up' ? (
                <TrendingUp size={12} className="text-st-call" />
              ) : (
                <TrendingDown size={12} className="text-st-put" />
              )}
              <span
                className={`text-xs font-bold tabular-nums ${
                  weeklyWinRate >= 70 ? 'text-st-call' : weeklyWinRate >= 50 ? 'text-st-premium' : 'text-st-put'
                }`}
              >
                {weeklyWinRate}%
              </span>
            </div>
          )}
          <span className="text-[10px] text-[var(--st-text-secondary)]">
            {totalWins}W / {totalLosses}L
          </span>
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-16">
        {days.map((day) => {
          const height = day.total > 0 ? (day.total / maxTotal) * 100 : 4;
          const winPct = day.total > 0 ? (day.wins / day.total) * 100 : 0;
          const isToday = day === days[days.length - 1];

          return (
            <div key={day.label} className="flex-1 flex flex-col items-center gap-1 group relative">
              {/* Tooltip */}
              <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                <div className="px-2 py-1 rounded-lg bg-[var(--st-bg-elevated)] border border-[var(--st-border)] shadow-xl whitespace-nowrap">
                  <p className="text-[10px] font-medium text-white">{day.label}</p>
                  <p className="text-[9px] text-[var(--st-text-secondary)]">
                    {day.wins}W / {day.losses}L
                    {day.total > 0 && ` · ${Math.round(winPct)}%`}
                  </p>
                </div>
              </div>

              {/* Bar */}
              <div
                className="w-full rounded-sm overflow-hidden transition-all"
                style={{ height: `${height}%`, minHeight: '3px' }}
              >
                {day.total > 0 ? (
                  <div className="w-full h-full flex flex-col">
                    <div
                      className="bg-st-call/70 transition-all"
                      style={{ height: `${winPct}%` }}
                    />
                    <div
                      className="bg-st-put/70 flex-1 transition-all"
                    />
                  </div>
                ) : (
                  <div className="w-full h-full bg-[var(--st-border)]/30 rounded-sm" />
                )}
              </div>

              {/* Day label */}
              <span
                className={`text-[8px] tabular-nums ${
                  isToday ? 'text-st-accent font-bold' : 'text-[var(--st-text-secondary)]'
                }`}
              >
                {day.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-3 text-[9px]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-st-call/70" />
            <span className="text-[var(--st-text-secondary)]">Wins</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm bg-st-put/70" />
            <span className="text-[var(--st-text-secondary)]">Losses</span>
          </span>
        </div>
      </div>
    </div>
  );
}