/**
 * Tier Service — Subscription tier enforcement for relay signal distribution.
 *
 * Resolves user tier, checks daily trade limits, manages device registration.
 * All enforcement is server-side — clients cannot bypass.
 */

import { prisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UserTier {
  readonly tierName: string;
  readonly displayName: string;
  readonly maxDailyTrades: number;  // 0 = unlimited
  readonly maxDevices: number;
  readonly canAutoTrade: boolean;
  readonly canManualTrade: boolean;
  readonly tradingHoursStart: number | null;
  readonly tradingHoursEnd: number | null;
  readonly allowedPairs: readonly string[];
}

export interface DeviceInfo {
  readonly id: string;
  readonly machineId: string;
  readonly isPrimary: boolean;
  readonly lastSeen: Date;
}

// ─── Cache ──────────────────────────────────────────────────────────────────

const tierCache = new Map<string, { tier: UserTier; expiry: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

// ─── Tier Resolution ────────────────────────────────────────────────────────

export async function getUserTier(userId: string): Promise<UserTier> {
  // Check cache
  const cached = tierCache.get(userId);
  if (cached && cached.expiry > Date.now()) return cached.tier;

  // Fetch subscription + tier
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscription: { select: { plan: true, status: true, expiresAt: true } },
    },
  });

  const sub = user?.subscription;
  let tierName = "demo"; // default
    // Map legacy plan names to tier names
    const planToTier: Record<string, string> = {
      free: "demo", demo: "demo", trial: "demo",
      basic: "basic", basic_monthly: "basic", basic_yearly: "basic",
      premium: "pro", premium_monthly: "pro", premium_yearly: "pro", pro: "pro",
      custom: "custom", enterprise: "custom",
    };

  if (sub?.status === "active" || sub?.status === "grace_period") {
    tierName = planToTier[sub.plan ?? ""] ?? sub.plan ?? "demo";
  }

  // Fetch tier limits
  const tierRow = await prisma.subscriptionTier.findUnique({
    where: { name: tierName },
  });

  const tier: UserTier = tierRow ? {
    tierName: tierRow.name,
    displayName: tierRow.displayName,
    maxDailyTrades: tierRow.maxDailyTrades,
    maxDevices: tierRow.maxDevices,
    canAutoTrade: tierRow.canAutoTrade,
    canManualTrade: tierRow.canManualTrade,
    tradingHoursStart: tierRow.tradingHoursStart,
    tradingHoursEnd: tierRow.tradingHoursEnd,
    allowedPairs: tierRow.allowedPairs,
  } : {
    tierName: "demo",
    displayName: "Demo",
    maxDailyTrades: 5,
    maxDevices: 1,
    canAutoTrade: false,
    canManualTrade: false,
    tradingHoursStart: null,
    tradingHoursEnd: null,
    allowedPairs: [],
  };

  tierCache.set(userId, { tier, expiry: Date.now() + CACHE_TTL_MS });
  return tier;
}

// ─── Trade Count Enforcement ────────────────────────────────────────────────

export async function canUserTrade(userId: string): Promise<{ allowed: boolean; reason?: string; tradesUsed: number; tradesMax: number }> {
  const tier = await getUserTier(userId);

  if (!tier.canAutoTrade) {
    return { allowed: false, reason: "Tier does not allow auto-trading", tradesUsed: 0, tradesMax: 0 };
  }

  if (tier.maxDailyTrades === 0) {
    // Unlimited
    return { allowed: true, tradesUsed: 0, tradesMax: 0 };
  }

  // Check trading hours
  if (tier.tradingHoursStart !== null && tier.tradingHoursEnd !== null) {
    const hour = new Date().getUTCHours();
    if (hour < tier.tradingHoursStart || hour >= tier.tradingHoursEnd) {
      return { allowed: false, reason: `Trading hours: ${tier.tradingHoursStart}:00-${tier.tradingHoursEnd}:00 UTC`, tradesUsed: 0, tradesMax: tier.maxDailyTrades };
    }
  }

  // Check daily trade count
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const usage = await prisma.userDailyUsage.findUnique({
    where: { userId_date: { userId, date: today } },
  });

  const tradesUsed = usage?.tradesExecuted ?? 0;

  if (tradesUsed >= tier.maxDailyTrades) {
    return { allowed: false, reason: "Daily trade limit reached", tradesUsed, tradesMax: tier.maxDailyTrades };
  }

  return { allowed: true, tradesUsed, tradesMax: tier.maxDailyTrades };
}

export async function recordTrade(userId: string): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.userDailyUsage.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, tradesExecuted: 1 },
    update: { tradesExecuted: { increment: 1 } },
  });
}

export async function recordBlockedTrade(userId: string): Promise<void> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prisma.userDailyUsage.upsert({
    where: { userId_date: { userId, date: today } },
    create: { userId, date: today, tradesBlocked: 1 },
    update: { tradesBlocked: { increment: 1 } },
  });
}

// ─── Signal Filtering ───────────────────────────────────────────────────────

export function shouldSendSignal(
  tier: UserTier,
  signalType: string,
  symbol?: string,
): boolean {
  // All tiers see RAW signals and PAIR_SUMMARIES (knowledge hub)
  if (signalType === "SIGNAL_RAW" || signalType === "PAIR_SUMMARIES" ||
      signalType === "INDICATOR_SNAPSHOT" || signalType === "SHADOW_STATS" ||
      signalType === "STATE_SYNC" || signalType === "HEARTBEAT" ||
      signalType === "DEVICE_STATUS") {
    return true;
  }

  // TRADE_EXEC only for tiers that can auto-trade
  if (signalType === "TRADE_EXEC" || signalType === "SIGNAL_APPROVED") {
    if (!tier.canAutoTrade) return false;

    // Check pair allowlist (empty = all allowed)
    if (symbol && tier.allowedPairs.length > 0) {
      const normalized = symbol.toLowerCase().replace(/[\s\/]/g, "");
      if (!tier.allowedPairs.some(p => p.toLowerCase().replace(/[\s\/]/g, "") === normalized)) {
        return false;
      }
    }

    return true;
  }

  // TRADE_RESULT visible to all (for stats)
  if (signalType === "TRADE_RESULT") return true;

  return true;
}

// ─── Device Management ──────────────────────────────────────────────────────

export async function registerDevice(
  userId: string,
  machineId: string,
  tier: UserTier,
): Promise<{ allowed: boolean; isPrimary: boolean; devices: DeviceInfo[]; error?: string }> {
  // Get existing devices
  const existing = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  // Check if this device already registered
  const existingDevice = existing.find(d => d.machineId === machineId);
  if (existingDevice) {
    // Update last seen
    await prisma.userDevice.update({
      where: { id: existingDevice.id },
      data: { lastSeen: new Date() },
    });
    return {
      allowed: true,
      isPrimary: existingDevice.isPrimary,
      devices: existing.map(d => ({ id: d.id, machineId: d.machineId, isPrimary: d.isPrimary, lastSeen: d.lastSeen })),
    };
  }

  // Check device limit
  if (existing.length >= tier.maxDevices) {
    // Auto-remove stale devices (not seen in 24h)
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const stale = existing.filter(d => d.lastSeen < staleThreshold);

    if (stale.length > 0) {
      await prisma.userDevice.deleteMany({
        where: { id: { in: stale.map(d => d.id) } },
      });
      logger.info({ userId, removed: stale.length }, "[tier] Removed stale devices");
    } else {
      return {
        allowed: false,
        isPrimary: false,
        devices: existing.map(d => ({ id: d.id, machineId: d.machineId, isPrimary: d.isPrimary, lastSeen: d.lastSeen })),
        error: `Maximum ${tier.maxDevices} device(s) allowed. Remove a device first.`,
      };
    }
  }

  // Register new device
  const isPrimary = existing.filter(d => d.isPrimary).length === 0;
  const newDevice = await prisma.userDevice.create({
    data: { userId, machineId, isPrimary },
  });

  const allDevices = await prisma.userDevice.findMany({ where: { userId } });

  return {
    allowed: true,
    isPrimary,
    devices: allDevices.map(d => ({ id: d.id, machineId: d.machineId, isPrimary: d.isPrimary, lastSeen: d.lastSeen })),
  };
}

export async function removeDevice(userId: string, deviceId: string): Promise<boolean> {
  const device = await prisma.userDevice.findFirst({
    where: { id: deviceId, userId },
  });

  if (!device) return false;

  await prisma.userDevice.delete({ where: { id: deviceId } });

  // If primary was removed, promote next device
  if (device.isPrimary) {
    const next = await prisma.userDevice.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    if (next) {
      await prisma.userDevice.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
    }
  }

  return true;
}

export async function getUserDevices(userId: string): Promise<DeviceInfo[]> {
  const devices = await prisma.userDevice.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return devices.map(d => ({ id: d.id, machineId: d.machineId, isPrimary: d.isPrimary, lastSeen: d.lastSeen }));
}

// ─── PO User ID ─────────────────────────────────────────────────────────────

export async function bindPoUserId(userId: string, poUserId: number): Promise<{ ok: boolean; error?: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { poUserId: true },
  });

  if (user?.poUserId && user.poUserId !== poUserId) {
    return { ok: false, error: `PO account already bound to ID ${user.poUserId}. Contact support to change.` };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { poUserId },
  });

  return { ok: true };
}
