import * as Sentry from "@sentry/node";
import { prisma } from "../lib/prisma.js";
import { SignalCreateInput, SignalResultInput } from "../types/index.js";
import { sendSignalEvent, broadcast } from "../lib/sse.js";
import { config } from "../config.js";

export async function createSignal(input: SignalCreateInput) {
  try {
    // Skip duplicates silently (same channel + telegram msg id)
    if (input.telegramMsgId && input.channelId) {
      Sentry.addBreadcrumb({
        category: "database",
        message: "Check for duplicate signal",
        level: "info",
      });
      const existing = await prisma.signal.findFirst({
        where: { telegramMsgId: input.telegramMsgId, channelId: input.channelId },
      });
      if (existing) return existing;
    }

    const visibility = await getFreeSignalVisibility();
    Sentry.addBreadcrumb({ message: "Determined signal visibility", data: { visibility } });

    Sentry.addBreadcrumb({
      category: "database",
      message: "Create new signal",
      level: "info",
      data: { asset: input.asset, direction: input.direction, visibility },
    });
    const signal = await prisma.signal.create({
      data: {
        telegramMsgId: input.telegramMsgId,
        channelId: input.channelId,
        asset: input.asset,
        direction: input.direction,
        entryTimeUtc: new Date(input.entryTimeUtc),
        expirationMinutes: input.expirationMinutes ?? 5,
        expirationTime: input.expirationTime ? new Date(input.expirationTime) : undefined,
        formatVersion: input.formatVersion ?? 1,
        martingaleTimes: input.martingaleTimes ?? [],
        rawText: input.rawText,
        status: "pending",
        visibility: visibility as "free" | "premium",
      },
      include: {
        channel: { select: { name: true, slug: true, maxGaleLevel: true, winRate: true } },
      },
    });

    // Broadcast new signal via SSE immediately
    sendSignalEvent(
      "signal:new",
      {
        id: signal.id,
        asset: signal.asset,
        direction: signal.direction,
        entryTimeUtc: signal.entryTimeUtc,
        visibility: signal.visibility,
        status: signal.status,
        channel: signal.channel,
      },
      signal.visibility as "free" | "premium",
    );

    return signal;
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function createResolvedSignal(input: SignalCreateInput & {
  result: "win" | "loss";
  galeLevel: number;
}) {
  try {
    // Skip duplicates silently (same channel + telegram msg id)
    if (input.telegramMsgId && input.channelId) {
      Sentry.addBreadcrumb({
        category: "database",
        message: "Check for duplicate resolved signal",
        level: "info",
      });
      const existing = await prisma.signal.findFirst({
        where: { telegramMsgId: input.telegramMsgId, channelId: input.channelId },
      });
      if (existing) return existing;
    }

    const visibility = await getFreeSignalVisibility();

    Sentry.addBreadcrumb({
      category: "database",
      message: "Create resolved signal",
      level: "info",
      data: { asset: input.asset, result: input.result },
    });
    const signal = await prisma.signal.create({
      data: {
        telegramMsgId: input.telegramMsgId,
        channelId: input.channelId,
        asset: input.asset,
        direction: input.direction,
        entryTimeUtc: new Date(input.entryTimeUtc),
        expirationMinutes: input.expirationMinutes ?? 5,
        expirationTime: input.expirationTime ? new Date(input.expirationTime) : undefined,
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
      Sentry.addBreadcrumb({
        category: "database",
        message: "Load channel info",
        level: "info",
      });
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
      Sentry.addBreadcrumb({
        category: "database",
        message: "Update channel counters",
        level: "info",
      });
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
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function activateSignal(signalId: string) {
  try {
    const visibility = await getFreeSignalVisibility();

    Sentry.addBreadcrumb({
      category: "database",
      message: "Activate signal",
      level: "info",
      data: { signalId, visibility },
    });
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
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function resolveSignal(
  signalId: string,
  input: SignalResultInput,
) {
  const transaction = Sentry.startTransaction({name: 'process-signal', op: 'signal.process'});
  try {
    Sentry.addBreadcrumb({
      category: "database",
      message: "Resolve signal",
      level: "info",
      data: { signalId, result: input.result },
    });
    const signal = await prisma.signal.update({
      where: { id: signalId },
      data: {
        status: "resolved",
        result: input.result,
        galeLevel: input.galeLevel ?? 0,
        resultMsgId: input.resultMsgId,
        matchTier: input.match_tier,
        matchConfidence: input.match_confidence,
        matchedAt: input.match_tier || input.match_confidence ? new Date() : undefined,
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
      Sentry.addBreadcrumb({
        category: "database",
        message: "Update channel counters",
        level: "info",
      });
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

    transaction.finish();
    return signal;
  } catch (error) {
    transaction.finish();
    Sentry.captureException(error);
    throw error;
  }
}

export async function updateSignalStatus(
  signalId: string,
  status: string,
) {
  try {
    Sentry.addBreadcrumb({
      category: "database",
      message: "Update signal status",
      level: "info",
      data: { signalId, status },
    });
    return prisma.signal.update({
      where: { id: signalId },
      data: { status: status as "pending" | "active" | "expired" | "resolved" },
    });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function getFreeCountToday(): Promise<number> {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    Sentry.addBreadcrumb({
      category: "database",
      message: "Get free count today",
      level: "info",
    });
    return prisma.signal.count({
      where: {
        visibility: "free",
        createdAt: { gte: startOfDay },
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}
export async function getFreeSignalVisibility(): Promise<"free" | "premium"> {
  const count = await getFreeCountToday();
  const threshold = config.freeSignalsPerDay;
  Sentry.addBreadcrumb({
    category: "service",
    message: "Check free signal visibility",
    data: { count, threshold },
  });
  return count < threshold ? "free" : "premium";
}

export async function getActiveSignals() {
  try {
    Sentry.addBreadcrumb({
      category: "database",
      message: "Get active signals",
      level: "info",
    });
    return prisma.signal.findMany({
      where: { status: { in: ["pending", "active"] } },
      orderBy: { entryTimeUtc: "asc" },
      include: {
        channel: {
          select: { name: true, slug: true, maxGaleLevel: true, winRate: true },
        },
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function getSignalsPaginated(opts: {
  page: number;
  limit: number;
  asset?: string;
  status?: string;
  from?: string;
  to?: string;
  channel?: string;
  userRole?: string;
}) {
  try {
    const where: Record<string, unknown> = {};
    const isPremiumOrAdmin = opts.userRole === "admin" || opts.userRole === "premium"; // Visibility gate: only admin/premium see 'premium' signals
    if (!isPremiumOrAdmin) {
      where.visibility = "free";
    }

    if (opts.asset) where.asset = opts.asset;
    if (opts.status) where.status = opts.status;
    if (opts.channel) {
      Sentry.addBreadcrumb({
        category: "database",
        message: "Find channel by slug",
        level: "info",
      });
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

    Sentry.addBreadcrumb({
      category: "database",
      message: "Get paginated signals",
      level: "info",
      data: { page: opts.page, limit: opts.limit },
    });
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
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function getSignalById(id: string) {
  try {
    Sentry.addBreadcrumb({
      category: "database",
      message: "Get signal by ID",
      level: "info",
      data: { id },
    });
    return prisma.signal.findUnique({
      where: { id },
      include: {
        channel: {
          select: { name: true, slug: true, maxGaleLevel: true },
        },
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function getSignalsByExpirationRange(opts: {
  asset?: string;
  expirationTimeStart?: string;
  expirationTimeEnd?: string;
}) {
  try {
    const where: Record<string, unknown> = {};
    if (opts.asset) where.asset = opts.asset;
    if (opts.expirationTimeStart || opts.expirationTimeEnd) {
      const rangeFilter: Record<string, Date> = {};
      if (opts.expirationTimeStart) rangeFilter.gte = new Date(opts.expirationTimeStart);
      if (opts.expirationTimeEnd) rangeFilter.lte = new Date(opts.expirationTimeEnd);
      where.expirationTime = rangeFilter;
    }
    Sentry.addBreadcrumb({
      category: "database",
      message: "Get signals by expiration range",
      level: "info",
      data: opts,
    });
    return prisma.signal.findMany({
      where,
      orderBy: { expirationTime: "asc" },
      include: {
        channel: {
          select: { name: true, slug: true, maxGaleLevel: true, winRate: true },
        },
      },
    });
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}

export async function getYesterdaySummary() {
  try {
    const now = new Date();
    const startOfYesterday = new Date(now);
    startOfYesterday.setUTCDate(now.getUTCDate() - 1);
    startOfYesterday.setUTCHours(0, 0, 0, 0);

    const endOfYesterday = new Date(startOfYesterday);
    endOfYesterday.setUTCHours(23, 59, 59, 999);

    Sentry.addBreadcrumb({
      category: "database",
      message: "Get yesterday summary",
      level: "info",
    });
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
  } catch (error) {
    Sentry.captureException(error);
    throw error;
  }
}
