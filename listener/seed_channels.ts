import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const channels = [
  {
    name: "TYL VIP",
    slug: "tyl_vip",
    telegramName: "TYL VIP - trading \ud83d\udcca",
    telegramId: "-1002593332597",
    timezone: "UTC+1",
    sourceFormat: "format1_and_format2",
    maxGaleLevel: 2,
    masanielloTotalTrades: 20,
    masanielloExpectedWins: 17,
    masanielloMaxBetMultiplier: 5.0,
  },
  {
    name: "TYL TRADING",
    slug: "tyl_trading",
    telegramName: "TYL - TRADING \ud83d\udcca\ud83d\ude80",
    telegramId: "-1002281357812",
    timezone: "UTC-3",
    sourceFormat: "format1_and_format2",
    maxGaleLevel: 2,
    masanielloTotalTrades: 12,
    masanielloExpectedWins: 10,
    masanielloMaxBetMultiplier: 5.0,
  },
  {
    name: "SINAIS MILION\u00c1RIOS",
    slug: "sinais_mil",
    telegramName: "\ud83d\udcc8 SINAIS MILION\u00c1RIOS | VIP",
    telegramId: "-1001756002871",
    timezone: "UTC-3",
    sourceFormat: "sinais_inline",
    maxGaleLevel: 1,
    masanielloTotalTrades: 15,
    masanielloExpectedWins: 12,
    masanielloMaxBetMultiplier: 5.0,
  },
  {
    name: "BLACKLIST",
    slug: "blacklist",
    telegramName: "\ud83d\uddb2 BLACKLIST - OTC | VIP",
    telegramId: "-1001221176746",
    timezone: "UTC-3",
    sourceFormat: "blacklist_inline",
    maxGaleLevel: 2,
    masanielloTotalTrades: 15,
    masanielloExpectedWins: 13,
    masanielloMaxBetMultiplier: 5.0,
  },
  {
    name: "COLE CARTER",
    slug: "cole_carter",
    telegramName: "Cole Carter \ud83d\udce3 PO Trader",
    telegramId: "",
    timezone: "UTC+1",
    sourceFormat: "instant_ready",
    maxGaleLevel: 0,
    masanielloTotalTrades: 10,
    masanielloExpectedWins: 7,
    masanielloMaxBetMultiplier: 5.0,
  },
  {
    name: "PRIVATE TEAM",
    slug: "private_team",
    telegramName: "Private Team: Live Trading",
    telegramId: "",
    timezone: "UTC+1",
    sourceFormat: "instant_ready",
    maxGaleLevel: 0,
    masanielloTotalTrades: 15,
    masanielloExpectedWins: 11,
    masanielloMaxBetMultiplier: 5.0,
  },
  {
    name: "POCKET VIP SIGNALS",
    slug: "pocket_vip",
    telegramName: "Pocket VIP Signals",
    telegramId: "",
    timezone: "UTC-3",
    sourceFormat: "pocket_vip_sticker",
    maxGaleLevel: 0,
    masanielloTotalTrades: 15,
    masanielloExpectedWins: 11,
    masanielloMaxBetMultiplier: 5.0,
  },
];

async function main() {
  console.log("Seeding channels...");

  for (const ch of channels) {
    const result = await prisma.channel.upsert({
      where: { slug: ch.slug },
      update: {
        name: ch.name,
        telegramName: ch.telegramName,
        telegramId: ch.telegramId,
        timezone: ch.timezone,
        sourceFormat: ch.sourceFormat,
        maxGaleLevel: ch.maxGaleLevel,
        masanielloTotalTrades: ch.masanielloTotalTrades,
        masanielloExpectedWins: ch.masanielloExpectedWins,
        masanielloMaxBetMultiplier: ch.masanielloMaxBetMultiplier,
      },
      create: ch,
    });
    console.log(`  Channel "${result.name}" (${result.slug}) -> ${result.id}`);
  }

  // Link existing TYL VIP signals to the channel
  const tylVip = await prisma.channel.findUnique({ where: { slug: "tyl_vip" } });
  if (tylVip) {
    const updated = await prisma.signal.updateMany({
      where: { channelId: null },
      data: { channelId: tylVip.id },
    });
    console.log(`  Linked ${updated.count} existing signals to TYL VIP channel`);

    // Update channel counters
    const stats = await prisma.signal.aggregate({
      where: { channelId: tylVip.id, status: "resolved" },
      _count: true,
    });
    const wins = await prisma.signal.count({
      where: { channelId: tylVip.id, status: "resolved", result: "win" },
    });
    const losses = stats._count - wins;
    const winRate = stats._count > 0 ? (wins / stats._count) * 100 : 0;

    await prisma.channel.update({
      where: { id: tylVip.id },
      data: {
        totalSignals: stats._count,
        totalWins: wins,
        totalLosses: losses,
        winRate: Math.round(winRate * 10) / 10,
      },
    });
    console.log(`  Updated TYL VIP counters: ${stats._count} signals, ${winRate.toFixed(1)}% WR`);
  }

  console.log("Channel seeding complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
