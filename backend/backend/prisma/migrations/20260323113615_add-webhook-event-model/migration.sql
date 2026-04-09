warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please migrate to a Prisma config file (e.g., `prisma.config.ts`).
For more information, see: https://pris.ly/prisma-config

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'premium', 'admin');

-- CreateEnum
CREATE TYPE "SignalStatus" AS ENUM ('pending', 'active', 'expired', 'resolved');

-- CreateEnum
CREATE TYPE "SignalVisibility" AS ENUM ('free', 'premium');

-- CreateEnum
CREATE TYPE "TradeOutcome" AS ENUM ('win', 'loss');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'grace_period', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('crypto', 'paypal');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'confirmed', 'failed', 'refunded');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'user',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "extension_token" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "external_id" TEXT,
    "plan" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "webhook_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channels" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "telegram_id" TEXT,
    "telegram_name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "source_format" TEXT NOT NULL,
    "max_gale_level" INTEGER NOT NULL DEFAULT 2,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "masaniello_total_trades" INTEGER NOT NULL DEFAULT 20,
    "masaniello_expected_wins" INTEGER NOT NULL DEFAULT 17,
    "masaniello_max_bet_multiplier" DECIMAL(65,30) NOT NULL DEFAULT 5.0,
    "total_signals" INTEGER NOT NULL DEFAULT 0,
    "total_wins" INTEGER NOT NULL DEFAULT 0,
    "total_losses" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DECIMAL(65,30),
    "direct_win_rate" DECIMAL(65,30),
    "last_signal_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signals" (
    "id" TEXT NOT NULL,
    "telegram_msg_id" INTEGER,
    "channel_id" TEXT,
    "asset" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "entry_time_utc" TIMESTAMP(3) NOT NULL,
    "expiration_minutes" INTEGER NOT NULL DEFAULT 5,
    "format_version" INTEGER NOT NULL DEFAULT 1,
    "martingale_times" TEXT[],
    "status" "SignalStatus" NOT NULL DEFAULT 'pending',
    "visibility" "SignalVisibility" NOT NULL DEFAULT 'free',
    "result" "TradeOutcome",
    "gale_level" INTEGER,
    "result_msg_id" INTEGER,
    "resolved_at" TIMESTAMP(3),
    "raw_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "signal_id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "outcome" "TradeOutcome",
    "pnl" DOUBLE PRECISION,
    "gale_level" INTEGER NOT NULL DEFAULT 0,
    "strategy" TEXT NOT NULL DEFAULT 'manual',
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extension_configs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "auto_trade" BOOLEAN NOT NULL DEFAULT false,
    "base_amount" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "max_gale" INTEGER NOT NULL DEFAULT 2,
    "strategy" TEXT NOT NULL DEFAULT 'mg2',
    "payout_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.88,
    "enabled_assets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blocked_hours" INTEGER[] DEFAULT ARRAY[]::INTEGER[],

    CONSTRAINT "extension_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "total_signals" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "win_rate" DOUBLE PRECISION NOT NULL,
    "best_asset" TEXT,
    "worst_asset" TEXT,
    "avg_gale_level" DOUBLE PRECISION,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "masaniello_states" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "trade_number" INTEGER NOT NULL DEFAULT 0,
    "wins_count" INTEGER NOT NULL DEFAULT 0,
    "losses_count" INTEGER NOT NULL DEFAULT 0,
    "total_trades" INTEGER NOT NULL,
    "expected_wins" INTEGER NOT NULL,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,
    "state_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "masaniello_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "platform_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_extension_token_key" ON "users"("extension_token");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channels_name_key" ON "channels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- CreateIndex
CREATE INDEX "signals_status_idx" ON "signals"("status");

-- CreateIndex
CREATE INDEX "signals_entry_time_utc_idx" ON "signals"("entry_time_utc");

-- CreateIndex
CREATE INDEX "signals_created_at_idx" ON "signals"("created_at");

-- CreateIndex
CREATE INDEX "signals_asset_idx" ON "signals"("asset");

-- CreateIndex
CREATE INDEX "signals_channel_id_entry_time_utc_idx" ON "signals"("channel_id", "entry_time_utc");

-- CreateIndex
CREATE UNIQUE INDEX "signals_channel_id_telegram_msg_id_key" ON "signals"("channel_id", "telegram_msg_id");

-- CreateIndex
CREATE UNIQUE INDEX "extension_configs_user_id_key" ON "extension_configs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_date_key" ON "daily_reports"("date");

-- CreateIndex
CREATE UNIQUE INDEX "masaniello_states_channel_id_date_key" ON "masaniello_states"("channel_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "platform_config_key_key" ON "platform_config"("key");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "webhook_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signals" ADD CONSTRAINT "signals_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_signal_id_fkey" FOREIGN KEY ("signal_id") REFERENCES "signals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extension_configs" ADD CONSTRAINT "extension_configs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "masaniello_states" ADD CONSTRAINT "masaniello_states_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

