import { prisma } from "../lib/prisma.js";
import { SignalCreateInput, SignalResultInput } from "../types/index.js";
import { sendSignalEvent, broadcast } from "../lib/sse.js";
import { config } from "../config.js";

export async function createSignal(input: SignalCreateInput) {
  const freeToday = await getFreeCountToday();
  const visibility =
    freeToday < config.freeSignalsPerDay ? "free" : "premium";

  const signal = await prisma.signal.create({
    data: {
      telegramMsgId: input.telegramMsgId,
      channelId: input.channelId,
      asset: input.asset,
      direction: input.direction,
      entryTimeUtc: new Date(input.entryTimeUtc),
      expirationMinutes: input.expirationMinutes ?? 5,
      formatVersion: input.formatVersion ?? 1,
      martingaleTimes: input.martingaleTimes ?? [],
      rawText: input.rawText,
      status: "pending",
      visibility: visibility,
    },
  });

  return signal;
}

export async function createResolvedSignal(input: SignalCreateInput & {
  result: "win" | "loss";
  galeLevel: number;
}) {
  const freeToday = await getFreeCountToday();
  const visibility =
    freeToday < config.freeSignalsPerDay ? "free" : "premium";

  const signal = await prisma.signal.create({
    data: {
      telegramMsgId: input.telegramMsgId,
      channelId: input.channelId,
      asset: input.asset,
      direction: input.direction,
      entryTimeUtc: new Date(input.entryTimeUtc),
      expirationMinutes: input.expirationMinutes ?? 5,
      formatVersion: input.formatVersion ?? 99,
      martingaleTimes: input.martingaleTimes ?? [],
      rawText: input.rawText,
      status: "resolved",
      visibility: visibility as "free" | "premium",
      result: input.result,
      galeLevel: input.galeLevel,
      resolvedAt: new Date(),
    },
  });

  // Load channel info for SSE
  let channelInfo = null;
  if (input.channelId) {
    channelInfo = await prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { name: true, slug: true, maxGaleLevel: true, winRate: true },
    });
  }

  sendSignalEvent(
    "signal:active",
    {
      id: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      entryTimeUtc: signal.entryTimeUtc,
      visibility: signal.visibility,
      channel: channelInfo,
    },
    signal.visibility as "free" | "premium",
  );

  broadcast("signal:result", {
    id: signal.id,
    asset: signal.asset,
    direction: signal.direction,
    result: signal.result,
    galeLevel: signal.galeLevel,
    channel: channelInfo,
  });

  // Update channel counters
  if (input.channelId) {
    const isWin = input.result === "win";
    await prisma.channel.update({
      where: { id: input.channelId },
      data: {
        totalSignals: { increment: 1 },
        totalWins: isWin ? { increment: 1 } : undefined,
        totalLosses: isWin ? undefined : { increment: 1 },
        lastSignalAt: new Date(),
      },
    });
  }

  return signal;
}

export async function activateSignal(signalId: string) {
  const existing = await prisma.signal.findUnique({
    where: { id: signalId },
    select: { visibility: true },
  });

  const freeToday = await getFreeCountToday();
  const visibility =
    existing?.visibility === "free" || freeToday < config.freeSignalsPerDay
      ? "free"
      : "premium";

  const signal = await prisma.signal.update({
    where: { id: signalId },
    data: {
      status: "active",
      visibility: visibility as "free" | "premium",
    },
    include: {
      channel: {
        select: { name: true, slug: true, maxGaleLevel: true, winRate: true },
      },
    },
  });

  sendSignalEvent(
    "signal:active",
    {
      id: signal.id,
      asset: signal.asset,
      direction: signal.direction,
      entryTimeUtc: signal.entryTimeUtc,
      visibility: signal.visibility,
      channel: signal.channel,
    },
    signal.visibility as "free" | "premium",
  );

  return signal;
}

export async function resolveSignal(
  signalId: string,
  input: SignalResultInput,
) {
  const signal = await prisma.signal.update({
    where: { id: signalId },
    data: {
      status: "resolved",
      result: input.result,
      galeLevel: input.galeLevel ?? 0,
      resultMsgId: input.resultMsgId,
      resolvedAt: new Date(),
    },
    include: {
      channel: {
        select: { id: true, name: true, slug: true, maxGaleLevel: true, winRate: true },
      },
    },
  });

  broadcast("signal:result", {
    id: signal.id,
    asset: signal.asset,
    direction: signal.direction,
    result: signal.result,
    galeLevel: signal.galeLevel,
    channel: signal.channel,
  });

  // Update channel counters
  if (signal.channel) {
    const isWin = input.result === "win";
    await prisma.channel.update({
      where: { id: signal.channel.id },
      data: {
        totalSignals: { increment: 1 },
        totalWins: isWin ? { increment: 1 } : undefined,
        totalLosses: isWin ? undefined : { increment: 1 },
        lastSignalAt: new Date(),
      },
    });
  }

  return signal;
}

export async function updateSignalStatus(
  signalId: string,
  status: string,
) {
  return prisma.signal.update({
    where: { id: signalId },
    data: { status: status as "pending" | "active" | "expired" | "resolved" },
  });
}

export async function getFreeCountToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  return prisma.signal.count({
    where: {
      visibility: "free",
      createdAt: { gte: startOfDay },
    },
  });
}

export async function getActiveSignals() {
  return prisma.signal.findMany({
    where: { status: { in: ["pending", "active"] } },
    orderBy: { entryTimeUtc: "asc" },
  });
}

export async function getSignalsPaginated(opts: {
  page: number;
  limit: number;
  asset?: string;
  status?: string;
  from?: string;
  to?: string;
  channel?: string;
}) {
  const where: Record<string, unknown> = {};

  if (opts.asset) where.asset = opts.asset;
  if (opts.status) where.status = opts.status;
  if (opts.channel) {
    const ch = await prisma.channel.findUnique({
      where: { slug: opts.channel },
      select: { id: true },
    });
    if (ch) where.channelId = ch.id;
  }

  if (opts.from || opts.to) {
    const dateFilter: Record<string, Date> = {};
    if (opts.from) dateFilter.gte = new Date(opts.from);
    if (opts.to) dateFilter.lte = new Date(opts.to);
    where.entryTimeUtc = dateFilter;
  }

  const [signals, total] = await Promise.all([
    prisma.signal.findMany({
      where,
      orderBy: { entryTimeUtc: "desc" },
      skip: (opts.page - 1) * opts.limit,
      take: opts.limit,
      include: {
        channel: {
          select: { name: true, slug: true },
        },
      },
    }),
    prisma.signal.count({ where }),
  ]);

  return {
    signals,
    total,
    page: opts.page,
    limit: opts.limit,
    totalPages: Math.ceil(total / opts.limit),
  };
}

export async function getSignalById(id: string) {
  return prisma.signal.findUnique({
    where: { id },
    include: {
      channel: {
        select: { name: true, slug: true, maxGaleLevel: true },
      },
    },
  });
}

export async function getYesterdaySummary() {
  const now = new Date();
  const startOfYesterday = new Date(now);
  startOfYesterday.setUTCDate(now.getUTCDate() - 1);
  startOfYesterday.setUTCHours(0, 0, 0, 0);

  const endOfYesterday = new Date(startOfYesterday);
  endOfYesterday.setUTCHours(23, 59, 59, 999);

  const signals = await prisma.signal.findMany({
    where: {
      entryTimeUtc: { gte: startOfYesterday, lte: endOfYesterday },
      status: "resolved",
    },
    include: {
      channel: { select: { name: true, slug: true } },
    },
  });

  const wins = signals.filter((s) => s.result === "win").length;
  const losses = signals.filter((s) => s.result === "loss").length;
  const total = signals.length;

  // Per-channel breakdown
  const byChannel: Record<string, { total: number; wins: number; losses: number; winRate: number }> = {};
  for (const s of signals) {
    const slug = s.channel?.slug ?? "unknown";
    if (!byChannel[slug]) {
      byChannel[slug] = { total: 0, wins: 0, losses: 0, winRate: 0 };
    }
    byChannel[slug].total++;
    if (s.result === "win") byChannel[slug].wins++;
    else byChannel[slug].losses++;
  }
  for (const slug of Object.keys(byChannel)) {
    const ch = byChannel[slug];
    ch.winRate = ch.total > 0 ? Math.round((ch.wins / ch.total) * 1000) / 10 : 0;
  }

  return {
    date: startOfYesterday.toISOString().slice(0, 10),
    total,
    wins,
    losses,
    winRate: total > 0 ? Math.round((wins / total) * 1000) / 10 : 0,
    byChannel,
  };
}
