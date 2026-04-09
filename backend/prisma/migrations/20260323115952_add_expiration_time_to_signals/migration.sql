-- AlterTable
ALTER TABLE "signals" ADD COLUMN "expiration_time" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "signals_expiration_time_idx" ON "signals"("expiration_time");

-- CreateIndex
CREATE INDEX "signals_asset_expiration_time_idx" ON "signals"("asset", "expiration_time");
