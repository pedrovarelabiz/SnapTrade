import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();
const BATCH_SIZE = 500;
const EXPORT_DIR = "/opt/snaptrade/data/exports";

interface ImportSignal {
  telegramMsgId: number;
  asset: string;
  direction: string;
  entryTimeUtc: string;
  expirationMinutes: number;
  formatVersion: number;
  martingaleTimes: string[];
  rawText: string;
  status: string;
  visibility: string;
  result: "win" | "loss";
  galeLevel: number;
  channelSlug: string;
  sourceFormat: string;
}

async function importChannel(slug: string, filename: string): Promise<number> {
  const filePath = path.join(EXPORT_DIR, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`  [skip] ${filePath} not found`);
    return 0;
  }

  const channel = await prisma.channel.findUnique({ where: { slug } });
  if (!channel) {
    console.log(`  [skip] Channel ${slug} not found in DB`);
    return 0;
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const signals: ImportSignal[] = JSON.parse(raw);
  console.log(`  Loading ${signals.length} signals for ${channel.name}...`);

  let imported = 0;

  for (let i = 0; i < signals.length; i += BATCH_SIZE) {
    const batch = signals.slice(i, i + BATCH_SIZE);
    const data = batch.map((s) => ({
      telegramMsgId: s.telegramMsgId,
      channelId: channel.id,
      asset: s.asset,
      direction: s.direction,
      entryTimeUtc: new Date(s.entryTimeUtc),
      expirationMinutes: s.expirationMinutes,
      formatVersion: s.formatVersion,
      martingaleTimes: s.martingaleTimes,
      rawText: s.rawText?.slice(0, 500) || null,
      status: "resolved" as const,
      visibility: "premium" as const,
      result: s.result as "win" | "loss",
      galeLevel: s.galeLevel,
      resolvedAt: new Date(s.entryTimeUtc),
    }));

    const result = await prisma.signal.createMany({
      data,
      skipDuplicates: true,
    });
    imported += result.count;

    if ((i / BATCH_SIZE) % 5 === 0) {
      console.log(`    Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${result.count} inserted (total: ${imported})`);
    }
  }

  // Update channel performance counters
  const [totalCount, winCount] = await Promise.all([
    prisma.signal.count({ where: { channelId: channel.id, status: "resolved" } }),
    prisma.signal.count({ where: { channelId: channel.id, status: "resolved", result: "win" } }),
  ]);

  const directWins = await prisma.signal.count({
    where: { channelId: channel.id, status: "resolved", result: "win", galeLevel: 0 },
  });

  const lossCount = totalCount - winCount;
  const winRate = totalCount > 0 ? (winCount / totalCount) * 100 : 0;
  const directWinRate = totalCount > 0 ? (directWins / totalCount) * 100 : 0;

  const lastSignal = await prisma.signal.findFirst({
    where: { channelId: channel.id },
    orderBy: { entryTimeUtc: "desc" },
    select: { entryTimeUtc: true },
  });

  await prisma.channel.update({
    where: { id: channel.id },
    data: {
      totalSignals: totalCount,
      totalWins: winCount,
      totalLosses: lossCount,
      winRate: Math.round(winRate * 10) / 10,
      directWinRate: Math.round(directWinRate * 10) / 10,
      lastSignalAt: lastSignal?.entryTimeUtc ?? null,
    },
  });

  console.log(`  ${channel.name}: ${imported} new signals imported (total: ${totalCount}, WR: ${winRate.toFixed(1)}%)`);
  return imported;
}

async function main() {
  console.log("=== SnapTrade Historical Import ===\n");

  const imports = [
    { slug: "tyl_trading", file: "db_import_tyl_trading.json" },
    { slug: "sinais_mil", file: "db_import_sinais_mil.json" },
    { slug: "blacklist", file: "db_import_blacklist.json" },
  ];

  let totalImported = 0;
  for (const { slug, file } of imports) {
    console.log(`\nImporting ${slug}...`);
    const count = await importChannel(slug, file);
    totalImported += count;
  }

  // Final verification
  console.log("\n=== Verification ===");
  const channels = await prisma.channel.findMany({
    select: { name: true, slug: true, totalSignals: true, totalWins: true, totalLosses: true, winRate: true },
    orderBy: { totalSignals: "desc" },
  });

  for (const ch of channels) {
    console.log(`  ${ch.name} (${ch.slug}): ${ch.totalSignals} signals, ${ch.totalWins}W/${ch.totalLosses}L, ${ch.winRate}% WR`);
  }

  const totalSignals = await prisma.signal.count({ where: { status: "resolved" } });
  console.log(`\nTotal signals in DB: ${totalSignals}`);
  console.log(`New signals imported: ${totalImported}`);
  console.log("Import complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
