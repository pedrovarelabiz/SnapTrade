import { prisma } from "../lib/prisma.js";

export async function generateDailyReport(dateStr: string) {
  const date = new Date(dateStr);
  const startOfDay = new Date(date);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setUTCHours(23, 59, 59, 999);

  const signals = await prisma.signal.findMany({
    where: {
      entryTimeUtc: { gte: startOfDay, lte: endOfDay },
      status: "resolved",
    },
  });

  if (signals.length === 0) return null;

  const wins = signals.filter((s) => s.result === "win").length;
  const losses = signals.filter((s) => s.result === "loss").length;
  const total = signals.length;
  const winRate = Math.round((wins / total) * 1000) / 10;

  // Best/worst asset
  const assetStats = new Map<
    string,
    { wins: number; total: number }
  >();
  for (const s of signals) {
    const entry = assetStats.get(s.asset) || { wins: 0, total: 0 };
    entry.total++;
    if (s.result === "win") entry.wins++;
    assetStats.set(s.asset, entry);
  }

  let bestAsset: string | null = null;
  let worstAsset: string | null = null;
  let bestWr = -1;
  let worstWr = 101;

  for (const [asset, data] of assetStats) {
    if (data.total < 2) continue;
    const wr = data.wins / data.total;
    if (wr > bestWr) {
      bestWr = wr;
      bestAsset = asset;
    }
    if (wr < worstWr) {
      worstWr = wr;
      worstAsset = asset;
    }
  }

  const avgGale =
    signals.reduce((sum, s) => sum + (s.galeLevel ?? 0), 0) / total;

  const report = await prisma.dailyReport.upsert({
    where: { date: startOfDay },
    create: {
      date: startOfDay,
      totalSignals: total,
      wins,
      losses,
      winRate,
      bestAsset,
      worstAsset,
      avgGaleLevel: Math.round(avgGale * 100) / 100,
      summary: `${total} signals, ${wins}W/${losses}L (${winRate}% WR)`,
    },
    update: {
      totalSignals: total,
      wins,
      losses,
      winRate,
      bestAsset,
      worstAsset,
      avgGaleLevel: Math.round(avgGale * 100) / 100,
      summary: `${total} signals, ${wins}W/${losses}L (${winRate}% WR)`,
    },
  });

  return report;
}

export async function getReportByDate(dateStr: string) {
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);
  return prisma.dailyReport.findUnique({ where: { date } });
}

export async function listReports(limit: number = 30) {
  return prisma.dailyReport.findMany({
    orderBy: { date: "desc" },
    take: limit,
  });
}
