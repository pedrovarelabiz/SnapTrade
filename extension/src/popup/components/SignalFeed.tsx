import React from 'react';
import type { Signal, TradeExecution } from '../../types';


import { formatAssetDisplay } from '../../lib/format';

function formatAssetName(raw: string): string {
  return formatAssetDisplay(raw);
}


interface SignalFeedProps {
  readonly pendingSignals: readonly Signal[];
  readonly recentTrades: readonly TradeExecution[];
  readonly onConfirm: (signalId: string) => void;
  readonly onCancel: (signalId: string) => void;
}

interface FeedItem {
  readonly id: string;
  readonly asset: string;
  readonly direction: 'CALL' | 'PUT';
  readonly status: 'pending' | 'active' | 'win' | 'loss' | 'resolved';
  readonly pnl: number | null;
  readonly timestamp: string;
  readonly signalId: string;
}

export const SignalFeed: React.FC<SignalFeedProps> = ({
  pendingSignals,
  recentTrades,
  onConfirm,
  onCancel,
}) => {
  const feedItems = buildFeedItems(pendingSignals, recentTrades);

  if (feedItems.length === 0) {
    return (
      <div className="card">
        <div className="text-secondary" style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>
          SIGNAL FEED
        </div>
        <div
          style={{
            textAlign: 'center',
            padding: '16px 0',
            color: '#5a5a6e',
            fontSize: '12px',
          }}
        >
          No signals yet today
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '12px 8px' }}>
      <div
        className="text-secondary"
        style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px', paddingLeft: '4px' }}
      >
        SIGNAL FEED
      </div>
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {feedItems.map((item) => (
          <SignalFeedItem
            key={item.id}
            item={item}
            onConfirm={onConfirm}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
};

interface SignalFeedItemProps {
  readonly item: FeedItem;
  readonly onConfirm: (signalId: string) => void;
  readonly onCancel: (signalId: string) => void;
}

const SignalFeedItem: React.FC<SignalFeedItemProps> = ({
  item,
  onConfirm,
  onCancel,
}) => {
  const isPending = item.status === 'pending' || item.status === 'active';
  const directionBadge =
    item.direction === 'CALL' ? 'badge badge-green' : 'badge badge-red';

  const resultDisplay = getResultDisplay(item);

  return (
    <div className="signal-item">
      {isPending && <span className="pulse-dot" />}

      <span style={{ fontWeight: 600, fontSize: '12px', minWidth: '70px' }}>
        {formatAssetName(item.asset)}
      </span>

      <span className={directionBadge} style={{ fontSize: '10px' }}>
        {item.direction}
      </span>

      <span style={{ flex: 1 }} />

      {resultDisplay}

      {isPending && (
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="btn btn-sm btn-success"
            onClick={() => onConfirm(item.signalId)}
            title="Confirm trade"
          >
            Go
          </button>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => onCancel(item.signalId)}
            title="Skip signal"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
};

function getResultDisplay(item: FeedItem): React.ReactNode {
  if (item.status === 'pending' || item.status === 'active') {
    return (
      <span className="badge badge-yellow" style={{ fontSize: '10px' }}>
        Pending
      </span>
    );
  }

  if (item.status === 'win') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span className="badge badge-green" style={{ fontSize: '10px' }}>WIN</span>
        {item.pnl !== null && (
          <span className="text-green" style={{ fontSize: '11px', fontWeight: 600 }}>
            +${item.pnl.toFixed(2)}
          </span>
        )}
      </span>
    );
  }

  if (item.status === 'loss') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <span className="badge badge-red" style={{ fontSize: '10px' }}>LOSS</span>
        {item.pnl !== null && (
          <span className="text-red" style={{ fontSize: '11px', fontWeight: 600 }}>
            -${Math.abs(item.pnl).toFixed(2)}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="badge badge-gray" style={{ fontSize: '10px' }}>
      Resolved
    </span>
  );
}

function buildFeedItems(
  pendingSignals: readonly Signal[],
  recentTrades: readonly TradeExecution[],
): readonly FeedItem[] {
  const fromSignals: FeedItem[] = pendingSignals.map((s) => ({
    id: `signal-${s.id}`,
    asset: s.asset,
    direction: s.direction,
    status: s.status === 'active' ? 'active' : 'pending',
    pnl: null,
    timestamp: s.createdAt,
    signalId: s.id,
  }));

  const fromTrades: FeedItem[] = recentTrades.slice(-10).map((t) => ({
    id: `trade-${t.id}`,
    asset: t.asset,
    direction: t.direction,
    status:
      t.result === 'win'
        ? 'win'
        : t.result === 'loss'
          ? 'loss'
          : t.result === 'pending'
            ? 'pending'
            : 'resolved',
    pnl: t.netPnl,
    timestamp: t.executedAt,
    signalId: t.signalId,
  }));

  const combined = [...fromSignals, ...fromTrades];

  // Deduplicate by signalId, prefer trade over signal
  const bySignalId = new Map<string, FeedItem>();
  for (const item of combined) {
    const existing = bySignalId.get(item.signalId);
    if (!existing || item.id.startsWith('trade-')) {
      bySignalId.set(item.signalId, item);
    }
  }

  const items = Array.from(bySignalId.values());

  // Sort: pending first, then by timestamp desc
  const sorted = [...items].sort((a, b) => {
    const aIsPending = a.status === 'pending' || a.status === 'active';
    const bIsPending = b.status === 'pending' || b.status === 'active';
    if (aIsPending && !bIsPending) return -1;
    if (!aIsPending && bIsPending) return 1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  return sorted.slice(0, 10);
}
