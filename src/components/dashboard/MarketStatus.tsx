import { Globe, Sun, Moon } from 'lucide-react';

interface MarketSession {
  name: string;
  emoji: string;
  openHour: number;
  closeHour: number;
  color: string;
  bg: string;
}

const sessions: MarketSession[] = [
  { name: 'Sydney', emoji: '🇦🇺', openHour: 22, closeHour: 7, color: 'text-st-info', bg: 'bg-st-info/15' },
  { name: 'Tokyo', emoji: '🇯🇵', openHour: 0, closeHour: 9, color: 'text-st-put', bg: 'bg-st-put/15' },
  { name: 'London', emoji: '🇬🇧', openHour: 8, closeHour: 17, color: 'text-st-accent', bg: 'bg-st-accent/15' },
  { name: 'New York', emoji: '🇺🇸', openHour: 13, closeHour: 22, color: 'text-st-call', bg: 'bg-st-call/15' },
];

function isSessionOpen(session: MarketSession): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();

  if (session.openHour < session.closeHour) {
    return utcHour >= session.openHour && utcHour < session.closeHour;
  }
  // Wraps around midnight
  return utcHour >= session.openHour || utcHour < session.closeHour;
}

export function MarketStatus() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const isWeekend = now.getUTCDay() === 0 || now.getUTCDay() === 6;

  const openSessions = isWeekend ? [] : sessions.filter(isSessionOpen);
  const isDayTime = utcHour >= 6 && utcHour < 20;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--st-bg-card)] border border-[var(--st-border)] text-xs">
        <Globe size={11} className="text-[var(--st-text-secondary)]" />
        <span className="text-[var(--st-text-secondary)] font-mono tabular-nums">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })} UTC
        </span>
        {isDayTime ? <Sun size={10} className="text-st-premium" /> : <Moon size={10} className="text-st-info" />}
      </div>

      {isWeekend ? (
        <span className="px-2.5 py-1.5 rounded-lg bg-st-put/10 border border-st-put/20 text-st-put text-xs font-medium">
          Markets Closed
        </span>
      ) : (
        openSessions.map(session => (
          <span
            key={session.name}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg ${session.bg} border border-transparent text-xs font-medium ${session.color}`}
          >
            <span>{session.emoji}</span>
            {session.name}
          </span>
        ))
      )}

      {!isWeekend && openSessions.length === 0 && (
        <span className="px-2.5 py-1.5 rounded-lg bg-[var(--st-border)]/30 text-[var(--st-text-secondary)] text-xs font-medium">
          Low Activity
        </span>
      )}
    </div>
  );
}