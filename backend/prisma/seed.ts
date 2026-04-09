import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // 1. Admin user
  const adminPassword = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@snaptrade.io" },
    create: {
      email: "admin@snaptrade.io",
      passwordHash: adminPassword,
      name: "Admin",
      role: "admin",
      emailVerified: true,
    },
    update: {},
  });
  console.log(`  Admin user: ${admin.email} (${admin.id})`);

  // Admin subscription
  await prisma.subscription.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      plan: "premium_yearly",
      status: "active",
      expiresAt: new Date("2027-01-01"),
    },
    update: {},
  });

  // 2. Platform config defaults
  const defaults = [
    {
      key: "free_signals_per_day",
      value: "3",
      description: "Number of free signals per day",
    },
    {
      key: "free_signal_delay_min",
      value: "5",
      description: "Delay in minutes for free signal delivery",
    },
    {
      key: "default_payout_rate",
      value: "0.88",
      description: "Default payout rate for P&L calculations",
    },
    {
      key: "default_base_amount",
      value: "10",
      description: "Default base trade amount",
    },
    {
      key: "max_gale_levels",
      value: "2",
      description: "Maximum martingale levels",
    },
  ];

  for (const cfg of defaults) {
    await prisma.platformConfig.upsert({
      where: { key: cfg.key },
      create: cfg,
      update: {},
    });
  }
  console.log(`  Platform configs: ${defaults.length} entries`);

  // 3. Internal API key
  const apiKeyValue = `st_ingest_${randomBytes(16).toString("hex")}`;
  const existingKey = await prisma.apiKey.findFirst({
    where: { name: "ingest-listener" },
  });
  if (!existingKey) {
    await prisma.apiKey.create({
      data: {
        userId: admin.id,
        key: apiKeyValue,
        name: "ingest-listener",
        active: true,
      },
    });
    console.log(`  API Key created: ${apiKeyValue}`);
  } else {
    console.log(`  API Key already exists: ${existingKey.key}`);
  }

  // 4. Historical signals from Python export
  const seedPath = "/opt/snaptrade/data/exports/seed_signals.json";
  if (existsSync(seedPath)) {
    console.log("  Importing historical signals...");
    const raw = readFileSync(seedPath, "utf-8");
    const signals = JSON.parse(raw);

    const BATCH_SIZE = 500;
    let imported = 0;

    for (let i = 0; i < signals.length; i += BATCH_SIZE) {
      const batch = signals.slice(i, i + BATCH_SIZE).map(
        (s: {
          telegram_msg_id?: number;
          asset: string;
          direction: string;
          entry_time_utc: string;
          expiration_minutes?: number;
          format_version?: number;
          martingale_times?: string[];
          status?: string;
          visibility?: string;
          result?: string;
          gale_level?: number;
          raw_text?: string;
          created_at?: string;
        }) => ({
          telegramMsgId: s.telegram_msg_id,
          asset: s.asset,
          direction: s.direction,
          entryTimeUtc: new Date(s.entry_time_utc),
          expirationMinutes: s.expiration_minutes ?? 5,
          formatVersion: s.format_version ?? 1,
          martingaleTimes: s.martingale_times ?? [],
          status: (s.status ?? "resolved") as
            | "pending"
            | "active"
            | "expired"
            | "resolved",
          visibility: (s.visibility ?? "free") as "free" | "premium",
          result: s.result as "win" | "loss" | undefined,
          galeLevel: s.gale_level ?? null,
          rawText: s.raw_text,
          createdAt: s.created_at ? new Date(s.created_at) : undefined,
        }),
      );

      await prisma.signal.createMany({ data: batch, skipDuplicates: true });
      imported += batch.length;
    }

    console.log(`  Imported ${imported} historical signals`);
  } else {
    console.log(
      `  No seed file at ${seedPath} — run export_for_seed.py first`,
    );
  }

  console.log("Seeding complete!");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error("Seed error:", e);
    prisma.$disconnect();
    process.exit(1);
  });
