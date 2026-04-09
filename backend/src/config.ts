import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const val = process.env[name];
  if (!val) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val;
}

export const config = {
  port: parseInt(process.env.PORT || "3001", 10),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  internalApiKey: required("INTERNAL_API_KEY"),
  corsOrigin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(","),
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",
  freeSignalsPerDay: parseInt(process.env.FREE_SIGNALS_PER_DAY || "3", 10),
  freeSignalDelayMin: parseInt(process.env.FREE_SIGNAL_DELAY_MIN || "5", 10),
  sessionDurationHours: parseInt(
    process.env.SESSION_DURATION_HOURS || "168",
    10,
  ),
  nowpaymentsIpnSecret: process.env.NOWPAYMENTS_IPN_SECRET || "",
  paypalWebhookId: process.env.PAYPAL_WEBHOOK_ID || "",
  prometheusScraperToken: process.env.PROMETHEUS_SCRAPE_TOKEN || "",
} as const;
