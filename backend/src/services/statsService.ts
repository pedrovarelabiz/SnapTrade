import { prisma } from "../lib/prisma.js";

function buildChannelFilter(channelSlug?: string) {
  if (!channelSlug) return {};
  return { channel: { slug: channelSlug } };
}

export async function getOverviewStats(channelSlug?: string) {
  const channelWhere = buildChannelFilter(channelSlug);

  const [totalSignals, resolved] = await Promise.all([
    prisma.signal.count({ where: channelWhere }),
    prisma.signal.findMany({
      where: { status: "resolved", ...channelWhere },
      select: { result: true, galeLevel: true, entryTimeUtc: true },
    }),
  ]);

  const wins = resolved.filter((s) => s.result === "win").length;
  const losses = resolved.filter((s) => s.result === "loss").length;

  const galeDist = { 0: 0, 1: 0, 2: 0 };
  for (const s of resolved) {
    const gl = Math.min(s.galeLevel ?? 0, 2) as 0 | 1 | 2;
    galeDist[gl]++;
  }

  return {
    totalSignals,
    resolved: resolved.length,
    wins,
    losses,
    winRate:
      resolved.length > 0
        ? Math.round((wins / resolved.length) * 1000) / 10
        : 0,
    galeDistribution: galeDist,
  };
}

export async function getStatsByChannel() {
  const channels = await prisma.channel.findMany({
    where: { isActive: true },
    select: {
      name: true,
      slug: true,
      totalSignals: true,
      totalWins: true,
      totalLosses: true,
      winRate: true,
      directWinRate: true,
      maxGaleLevel: true,
      lastSignalAt: true,
    },
    orderBy: { totalSignals: "desc" },
  });

  return channels;
}

export async function getStatsByAsset(channelSlug?: string) {
  const channelWhere = buildChannelFilter(channelSlug);

  const signals = await prisma.signal.findMany({
    where: { status: "resolved", ...channelWhere },
    select: { asset: true, result: true },
  });

  const assetMap = new Map<
    string,
    { wins: number; losses: number; total: number }
  >();

  for (const s of signals) {
    const entry = assetMap.get(s.asset) || { wins: 0, losses: 0, total: 0 };
    entry.total++;
    if (s.result === "win") entry.wins++;
    else entry.losses++;
    assetMap.set(s.asset, entry);
  }

  return Array.from(assetMap.entries())
    .map(([asset, data]) => ({
      asset,
      ...data,
      winRate: Math.round((data.wins / data.total) * 1000) / 10,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getStatsByHour(channelSlug?: string) {
  const channelWhere = buildChannelFilter(channelSlug);

  const signals = await prisma.signal.findMany({
    where: { status: "resolved", ...channelWhere },
    select: { entryTimeUtc: true, result: true },
  });

  const hourMap = new Map<
    number,
    { wins: number; losses: number; total: number }
  >();

  for (const s of signals) {
    const hour = new Date(s.entryTimeUtc).getUTCHours();
    const entry = hourMap.get(hour) || { wins: 0, losses: 0, total: 0 };
    entry.total++;
    if (s.result === "win") entry.wins++;
    else entry.losses++;
    hourMap.set(hour, entry);
  }

  return Array.from(hourMap.entries())
    .map(([hour, data]) => ({
      hour,
      ...data,
      winRate: Math.round((data.wins / data.total) * 1000) / 10,
    }))
    .sort((a, b) => a.hour - b.hour);
}

export async function getStatsByDay(channelSlug?: string) {
  const channelWhere = buildChannelFilter(channelSlug);

  const signals = await prisma.signal.findMany({
    where: { status: "resolved", ...channelWhere },
    select: { entryTimeUtc: true, result: true },
  });

  const dayMap = new Map<
    string,
    { wins: number; losses: number; total: number }
  >();

  for (const s of signals) {
    const date = new Date(s.entryTimeUtc).toISOString().slice(0, 10);
    const entry = dayMap.get(date) || { wins: 0, losses: 0, total: 0 };
    entry.total++;
    if (s.result === "win") entry.wins++;
    else entry.losses++;
    dayMap.set(date, entry);
  }

  return Array.from(dayMap.entries())
    .map(([date, data]) => ({
      date,
      ...data,
      winRate: Math.round((data.wins / data.total) * 1000) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getPnlCurve(channelSlug?: string) {
  const channelWhere = buildChannelFilter(channelSlug);

  const signals = await prisma.signal.findMany({
    where: { status: "resolved", ...channelWhere },
    orderBy: { entryTimeUtc: "asc" },
    select: {
      entryTimeUtc: true,
      result: true,
      galeLevel: true,
      asset: true,
    },
  });

  let cumulative = 0;
  const baseAmount = 10;
  const payoutRate = 0.88;

  return signals.map((s, i) => {
    const isWin = s.result === "win";
    const pnl = isWin ? baseAmount * payoutRate : -baseAmount;
    cumulative += pnl;

    return {
      index: i + 1,
      date: new Date(s.entryTimeUtc).toISOString().slice(0, 10),
      asset: s.asset,
      result: s.result,
      pnl: Math.round(pnl * 100) / 100,
      cumulative: Math.round(cumulative * 100) / 100,
    };
  });
}

export async function getWinRateHistory(channelSlug?: string) {
  const channelWhere = buildChannelFilter(channelSlug);

  const signals = await prisma.signal.findMany({
    where: { status: "resolved", ...channelWhere },
    orderBy: { entryTimeUtc: "asc" },
    select: { entryTimeUtc: true, result: true },
  });

  const windowSize = 50;
  const result: Array<{ index: number; date: string; winRate: number }> = [];

  for (let i = windowSize - 1; i < signals.length; i++) {
    const window = signals.slice(i - windowSize + 1, i + 1);
    const wins = window.filter((s) => s.result === "win").length;
    result.push({
      index: i + 1,
      date: new Date(signals[i].entryTimeUtc).toISOString().slice(0, 10),
      winRate: Math.round((wins / windowSize) * 1000) / 10,
    });
  }

  return result;
}

export async function getPublicSummary() {
  const totalSignals = await prisma.signal.count({ where: { status: "resolved" } });
  const wins = await prisma.signal.count({ where: { status: "resolved", result: "win" } });
  const channels = await prisma.channel.count({ where: { isActive: true } });
  const winRate = totalSignals > 0 ? Math.round((wins / totalSignals) * 1000) / 10 : 0;
  return { totalSignals, winRate, totalChannels: channels };
}
