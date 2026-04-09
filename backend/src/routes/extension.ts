import { Router, Request, Response } from "express";
import { logger } from "../lib/logger.js";
import { randomUUID } from "crypto";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { authMiddleware } from "../middleware/auth.js";
import { apiLimiter } from "../middleware/rateLimiter.js";
import { AuthRequest } from "../types/index.js";
import { prisma } from "../lib/prisma.js";
import { addClient } from "../lib/sse.js";
import { verifyToken } from "../lib/jwt.js";
import * as Sentry from "@sentry/node";
import { resolveSignal } from "../services/signalService.js";

import { execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

// Gemini CLI via OAuth (free 1500 req/day), Claude Haiku as fallback
async function analyzeWithGemini(prompt: string): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync("gemini", ["-p", prompt], {
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, GEMINI_API_KEY: "" }, // force OAuth, not API key
    });
    if (stderr && stderr.includes("Error")) {
      logger.warn({ stderr: stderr.substring(0, 200) }, "Gemini CLI stderr");
    }
    const text = stdout.trim();
    if (!text || text.length < 10) return null;
    return text;
  } catch (err: any) {
    logger.warn({ err: err.message?.substring(0, 200) }, "Gemini CLI failed, falling back to Claude");
    return null;
  }
}

const router = Router();

// GET /api/extension/version — extension version check
router.get("/version", (_req: Request, res: Response) => {
  try {
    res.json({ version: "2.0.9", minVersion: "2.0.0" });
  } catch (err) {
    Sentry.captureException(err, {
      contexts: {
        extension: {
          endpoint: "/version GET",
        },
      },
    });
    logger.error({ err }, "Extension version error");
    res.status(500).json({ error: "Failed to get version" });
  }
});

// POST /api/extension/auth — authenticate extension with token
router.post("/auth", async (req: Request, res: Response) => {
  try {
    const { extensionToken } = req.body;
    if (!extensionToken) {
      res.status(400).json({ error: "Extension token required" });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { extensionToken },
      select: { id: true, email: true, role: true, subscription: { select: { status: true } } },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid extension token" });
      return;
    }

    res.json({
      userId: user.id,
      email: user.email,
      role: user.role,
      subscriptionStatus: user.subscription?.status ?? "none",
      authenticated: true,
    });
  } catch (err) {
    Sentry.captureException(err, {
      contexts: {
        extension: {
          endpoint: "/auth",
          extensionToken: req.body.extensionToken?.substring(0, 8),
        },
      },
    });
    logger.error({ err }, "Extension auth error");
    res.status(500).json({ error: "Authentication failed" });
  }
});

// GET /api/extension/signals/live — SSE stream for extension
router.get("/signals/live", async (req: Request, res: Response) => {
  try {
    const token = req.query.token as string;
    if (!token) {
      res.status(401).json({ error: "Token required" });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const clientId = `ext_${randomUUID()}`;
    const added = addClient({
      id: clientId,
      res,
      userId: payload.userId,
      role: payload.role,
      lastHeartbeat: Date.now(),
      connectionTime: Date.now(),
    }, 'extension');

    if (!added) {
      res.status(503).json({ error: "Too many connections" });
      return;
    }
  } catch (err) {
    Sentry.captureException(err, {
      contexts: {
        extension: {
          endpoint: "/signals/live",
          token: req.query.token ? String(req.query.token).substring(0, 8) : undefined,
        },
      },
    });
    logger.error({ err }, "Extension SSE error");
    res.status(500).json({ error: "SSE connection failed" });
  }
});

// GET /api/extension/settings
router.get(
  "/settings",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      let extConfig = await prisma.extensionConfig.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!extConfig) {
        extConfig = await prisma.extensionConfig.create({
          data: { userId: req.user!.userId },
        });
      }

      res.json(extConfig);
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          extension: {
            endpoint: "/settings GET",
            userId: req.user?.userId,
          },
        },
      });
      logger.error({ err }, "Extension settings error");
      res.status(500).json({ error: "Failed to get settings" });
    }
  },
);

// PUT /api/extension/settings
router.put(
  "/settings",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        autoTrade,
        baseAmount,
        maxGale,
        strategy,
        payoutRate,
        enabledAssets,
        blockedHours,
      } = req.body;

      const data: Record<string, unknown> = {};
      if (typeof autoTrade === "boolean") data.autoTrade = autoTrade;
      if (typeof baseAmount === "number" && baseAmount > 0)
        data.baseAmount = baseAmount;
      if (typeof maxGale === "number" && maxGale >= 0 && maxGale <= 2)
        data.maxGale = maxGale;
      if (typeof strategy === "string") data.strategy = strategy;
      if (typeof payoutRate === "number" && payoutRate > 0 && payoutRate < 1)
        data.payoutRate = payoutRate;
      if (Array.isArray(enabledAssets)) data.enabledAssets = enabledAssets;
      if (Array.isArray(blockedHours)) data.blockedHours = blockedHours;

      const extConfig = await prisma.extensionConfig.upsert({
        where: { userId: req.user!.userId },
        create: { id: randomUUID(),
          userId: req.user!.userId, ...data },
        update: data,
      });

      res.json(extConfig);
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          extension: {
            endpoint: "/settings PUT",
            userId: req.user?.userId,
          },
        },
      });
      logger.error({ err }, "Extension settings update error");
      res.status(500).json({ error: "Failed to update settings" });
    }
  },
);

// POST /api/extension/trades — log a trade
router.post(
  "/trades",
  authMiddleware,
  apiLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const { signalId, amount, outcome, pnl, galeLevel, strategy, result, netPnl } =
        req.body;

      // Support both old (outcome/pnl) and new (result/netPnl) field names
      const tradeOutcome = result || outcome || null;
      const tradePnl = netPnl !== undefined ? netPnl : pnl;
      const iteration = galeLevel ?? 0;

      const trade = await prisma.trade.create({
        data: {
          id: randomUUID(),
          userId: req.user!.userId,
          signalId,
          amount,
          outcome: tradeOutcome,
          pnl: tradePnl || null,
          galeLevel: iteration,
          strategy: strategy || "manual",
        },
      });

      // Auto-resolve signal if result is present
      if (signalId && tradeOutcome && (tradeOutcome === 'win' || tradeOutcome === 'loss')) {
        try {
          await resolveSignal(signalId, {
            result: tradeOutcome as 'win' | 'loss',
            galeLevel: iteration,
            resultIteration: iteration,
          });
          logger.info({ signalId, iteration, result: tradeOutcome }, "Signal auto-resolved from trade");
        } catch (resolveErr) {
          // Log but don't fail the trade creation if signal resolution fails
          logger.warn({ err: resolveErr, signalId }, "Failed to auto-resolve signal from trade");
        }
      }

      res.status(201).json(trade);
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          extension: {
            endpoint: "/trades POST",
            userId: req.user?.userId,
            signalId: req.body.signalId,
          },
        },
      });
      logger.error({ err }, "Trade log error");
      res.status(500).json({ error: "Failed to log trade" });
    }
  },
);

// POST /api/extension/token/regenerate
router.post(
  "/token/regenerate",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const newToken = `ext_${randomUUID().replace(/-/g, "")}`;

      await prisma.user.update({
        where: { id: req.user!.userId },
        data: { extensionToken: newToken },
      });

      res.json({ extensionToken: newToken });
    } catch (err) {
      Sentry.captureException(err, {
        contexts: {
          extension: {
            endpoint: "/token/regenerate POST",
            userId: req.user?.userId,
          },
        },
      });
      logger.error({ err }, "Token regenerate error");
      res.status(500).json({ error: "Failed to regenerate token" });
    }
  },
);


// POST /api/extension/market-data — receive candle snapshots from extension
router.post("/market-data", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      res.status(401).json({ error: "Token required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const { snapshots } = req.body;
    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      res.status(400).json({ error: "Snapshots array required" });
      return;
    }

    // Dynamic import to avoid circular dependencies
    const { analyzeMarketData } = await import("../services/indicatorService.js");
    const result = await analyzeMarketData(snapshots, user.id);

    res.json(result);
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ err }, "Market data analysis error");
    res.status(500).json({ error: "Analysis failed" });
  }
});



// POST /api/extension/analyze — AI chart analysis via Claude Agent SDK (Max subscription)
router.post("/analyze", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }

    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const { symbol, candlesM1, candlesM5, indicatorData } = req.body;
    if (!symbol) { res.status(400).json({ error: "Symbol required" }); return; }

    const ind = indicatorData || {};
    const m1Text = (candlesM1 || []).slice(-10).map((c: any) => `O:${c.open?.toFixed(5)} H:${c.high?.toFixed(5)} L:${c.low?.toFixed(5)} C:${c.close?.toFixed(5)}`).join("\n");
    const m5Text = (candlesM5 || []).slice(-5).map((c: any) => `O:${c.open?.toFixed(5)} H:${c.high?.toFixed(5)} L:${c.low?.toFixed(5)} C:${c.close?.toFixed(5)}`).join("\n");
    const prompt = `OTC binary options analyst. Asset: ${symbol}, Expiry: 5min, Market: OTC (synthetic, no orderbook).

INDICATORS: RSI=${ind.rsi ?? "N/A"} MACD=${ind.macdLine ?? "N/A"}/${ind.signalLine ?? "N/A"} Hist=${ind.macdHistogram ?? "N/A"}${ind.histogramRising ? "(rising)" : "(falling)"} SMA20=${ind.sma20 ?? "N/A"} SMA80=${ind.sma80 ?? "N/A"} M5Trend=${ind.m5Trend ?? "flat"} Alligator=${ind.alligatorState ?? "?"} Setups=${ind.activeSetups || "none"}
M5: ${m5Text}
M1: ${m1Text}

RULES: 3+ aligned indicators needed for BUY/SELL. NEVER trade against M5 trend. RSI>70=no buy, RSI<30=no sell. Falling histogram=no buy, rising=no sell. When unsure=WAIT.
Return ONLY JSON: {"action":"BUY"|"SELL"|"WAIT","confidence":0-100,"expiration":5,"patterns":[],"support":null,"resistance":null,"reasoning":"brief"}`;

    // Primary: Gemini CLI (free OAuth), Fallback: Claude Haiku
    let rawText = "";
    let usedModel = "gemini-2.0-flash";
    
    const geminiResult = await analyzeWithGemini(prompt);
    if (geminiResult) {
      rawText = geminiResult;
    } else {
      usedModel = "claude-sonnet-4-6";
      const abortTimer = setTimeout(() => { /* safety net */ }, 60000);
      for await (const message of query({
        prompt,
        options: {
          allowedTools: [],
          maxTurns: 1,
          model: "claude-sonnet-4-6",
          ...(process.env.CLAUDE_PATH ? { pathToClaudeCodeExecutable: process.env.CLAUDE_PATH } : {}),
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === "text") rawText += block.text;
          }
        }
        if (message.type === "result" && typeof message.result === "string") {
          rawText += message.result;
        }
      }
      clearTimeout(abortTimer);
    }
    logger.info({ symbol, rawTextLength: rawText.length, rawTextPreview: rawText.substring(0, 300), model: usedModel }, "AI raw response");

    // Extract JSON from Agent SDK output (may have markdown fences or trailing text)
    let analysis: Record<string, unknown> = { action: "WAIT", confidence: 0, reasoning: "No JSON" };
    const fenceMatch = rawText.match(/```(?:json)?\\s*([\\s\\S]*?)```/);
    const jsonSource = fenceMatch ? fenceMatch[1]!.trim() : rawText.trim();

    // Try direct parse first
    try {
      analysis = JSON.parse(jsonSource);
    } catch {
      // Find first { and try parsing to each } from end backwards
      const start = jsonSource.indexOf("{");
      if (start >= 0) {
        const text = jsonSource.substring(start);
        let end = text.lastIndexOf("}");
        while (end >= 0) {
          try {
            analysis = JSON.parse(text.substring(0, end + 1));
            break;
          } catch {
            end = text.lastIndexOf("}", end - 1);
          }
        }
      }
    }

    logger.info({ symbol, action: analysis.action, confidence: analysis.confidence }, "AI analysis complete");

    res.json({
      action: analysis.action || "WAIT",
      confidence: typeof analysis.confidence === "number" ? analysis.confidence : 0,
      expiration: analysis.expiration || 5,
      patterns: Array.isArray(analysis.patterns) ? analysis.patterns : [],
      support: typeof analysis.support === "number" ? analysis.support : null,
      resistance: typeof analysis.resistance === "number" ? analysis.resistance : null,
      reasoning: analysis.reasoning || "",
      timestamp: Date.now(),
      model: "claude-sonnet-4-6",
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ err }, "AI analysis error");
    res.status(500).json({ error: "AI analysis failed" });
  }
});




// POST /api/extension/analyze-batch — AI batch analysis of multiple pairs in 1 call
router.post("/analyze-batch", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }

    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const { candidates } = req.body;
    if (!Array.isArray(candidates) || candidates.length === 0) {
      res.status(400).json({ error: "Candidates array required" }); return;
    }

    // Build batch prompt — all pairs in one call
    const pairsText = candidates.map((c: any, i: number) => {
      const ind = c.indicatorData || {};
      const m1a = c.m1Alignment;
      const m1Info = m1a ? ` | M1-Align: RSI=${m1a.rsi ?? 'N/A'} hist=${m1a.histogramRising ? 'rising' : 'falling'}` : '';
      return `${i+1}. ${c.symbol} — Local: ${c.direction} ${c.localConfidence}% | Setups: ${(c.setups || []).join(', ')} | M5 Trend: ${c.m5Trend} | RSI: ${ind.rsi ?? 'N/A'} | MACD Hist: ${ind.macdHistogram ?? 'N/A'} ${ind.histogramRising ? '(rising)' : '(falling)'} | SMA20: ${ind.sma20 ?? 'N/A'} | SMA80: ${ind.sma80 ?? 'N/A'} | Alligator: ${ind.alligatorState ?? 'N/A'} | Price: ${ind.price ?? 'N/A'} | Last 5 M1: ${(c.candlesM1 || []).slice(-5).map((x: any) => x.c?.toFixed(5)).join(' → ')} | Last 5 M5: ${(c.candlesM5 || []).slice(-5).map((x: any) => x.c?.toFixed(5)).join(' → ')} | M5-RSI: ${c.m5Indicators?.rsi ?? 'N/A'} | M5-MACD: ${c.m5Indicators?.macdHistogram?.toFixed(6) ?? 'N/A'} ${c.m5Indicators?.histogramRising ? '(rising)' : '(falling)'} | M5-SMA20: ${c.m5Indicators?.sma20?.toFixed(5) ?? 'N/A'}${m1Info}`;
    }).join('\n');

    const prompt = `You are a signal filter for OTC binary options (5-min expiry, M5 candle open entry).
Each signal passed a Strategy Lab pre-filter but the system currently trades at a LOSING rate (44% WR vs 52.2% break-even).
Your job is to REJECT weak signals, not just approve them.

Context per signal (pipe-separated):
  lab-validate:ID|desc|WR:X%|gatedWR:Y%|recent:WWLWLW|pairWR:Z%|roundLevel:yes/no|reversal:yes/no

MANDATORY REJECTION RULES — reject if ANY apply (do NOT override these):
R1. ROUND_LEVEL: roundLevel:yes AND RSI is not strongly confirming (RSI 45-55 range)
R2. REVERSAL: reversal:yes — sharp counter-movement in last 3 M1 candles against signal direction
R3. COUNTERTREND: Last 3 M5 candles ALL closed against signal direction AND RSI confirms that direction
R4. MOMENTUM_EXHAUSTION: RSI > 78 for CALL signals or RSI < 22 for PUT signals
R5. DEAD_MARKET: Last 5 M5 candle ranges sum < 0.0008% of price (market frozen)
R6. WEAK_HISTORY: recent field shows 3+ consecutive losses AND pairWR < 50%

APPROVE when ALL of:
- No mandatory rejection rule applies
- gatedWR >= 52% OR (gatedWR missing and WR >= 54%)
- recent results show no more than 2 consecutive losses in last 5
- Price action is aligned with signal direction

CALIBRATION TARGET: Reject 35-50% of signals. Do not rubber-stamp approvals.

Return JSON array only — one object per signal, in the same order received:
[{"symbol":"EURUSD_otc","action":"BUY"|"SELL"|"WAIT","confidence":60-85,"reasoning":"<15 words>","rejection_code":"R1"|"R2"|"R3"|"R4"|"R5"|"R6"|null,"rank":1}]

Rules:
- action WAIT means reject (do not trade)
- rejection_code: set to the triggered rule (R1-R6) when action is WAIT, null otherwise
- confidence: your certainty in the action (60-85 range)
- rank: 1 = highest priority signal
- reasoning: brief explanation, max 15 words
- No markdown, no extra text, valid JSON only`;

    // Claude Sonnet only — Gemini not reliable enough for strategy validation
    let rawText = "";
    let usedModel = "claude-sonnet-4-6";
    
    {
      for await (const message of query({
        prompt,
        options: {
          allowedTools: [],
          maxTurns: 1,
          model: "claude-sonnet-4-6",
          ...(process.env.CLAUDE_PATH ? { pathToClaudeCodeExecutable: process.env.CLAUDE_PATH } : {}),
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === "text") rawText += block.text;
          }
        }
        if (message.type === "result" && typeof message.result === "string") {
          rawText += message.result;
        }
      }
    }

    logger.info({ pairCount: candidates.length, rawTextLength: rawText.length, model: usedModel }, "AI batch response");

    // Parse JSON array from response
    let results: any[] = [];
    try {
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonSource = fenceMatch ? fenceMatch[1]!.trim() : rawText.trim();
      const bracketStart = jsonSource.indexOf("[");
      if (bracketStart >= 0) {
        const text = jsonSource.substring(bracketStart);
        let end = text.lastIndexOf("]");
        while (end >= 0) {
          try { results = JSON.parse(text.substring(0, end + 1)); break; }
          catch { end = text.lastIndexOf("]", end - 1); }
        }
      }
    } catch { /* parse failed */ }

    res.json({
      results: results.map((r: any, i: number) => ({
        symbol: r.symbol || "",
        action: r.action || "WAIT",
        confidence: typeof r.confidence === "number" ? r.confidence : 0,
        reasoning: r.reasoning || "",
        rank: r.rank || i + 1,
        rejection_code: r.rejection_code || null,
      })),
      model: usedModel,
      timestamp: Date.now(),
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ err }, "AI batch analysis error");
    res.status(500).json({ error: "Batch analysis failed" });
  }
});



// POST /api/extension/ai-prediction — record AI prediction for accuracy tracking
router.post("/ai-prediction", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }
    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const { symbol, predictedAction, predictedConfidence, localConfidence, model, source, tradeId } = req.body;
    if (!symbol || !predictedAction) { res.status(400).json({ error: "symbol and predictedAction required" }); return; }

    await prisma.$executeRaw`
      INSERT INTO ai_predictions (user_id, symbol, predicted_action, predicted_confidence, local_confidence, model, source, trade_id)
      VALUES (${user.id}, ${symbol}, ${predictedAction}, ${predictedConfidence || 0}, ${localConfidence || 0}, ${model || "haiku"}, ${source || "batch"}, ${tradeId || null})
    `;
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "AI prediction log error");
    res.status(500).json({ error: "Failed to log prediction" });
  }
});

// POST /api/extension/ai-feedback — resolve prediction with actual result
router.post("/ai-feedback", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }
    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const { tradeId, result } = req.body;
    if (!tradeId || !result) { res.status(400).json({ error: "tradeId and result required" }); return; }

    await prisma.$executeRaw`
      UPDATE ai_predictions SET actual_result = ${result}, resolved_at = NOW()
      WHERE trade_id = ${tradeId} AND user_id = ${user.id} AND actual_result IS NULL
    `;
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "AI feedback error");
    res.status(500).json({ error: "Failed to log feedback" });
  }
});

// GET /api/extension/ai-stats — AI accuracy statistics
router.get("/ai-stats", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }
    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const stats: any[] = await prisma.$queryRaw`
      SELECT
        model,
        source,
        COUNT(*) as total,
        COUNT(actual_result) as resolved,
        SUM(CASE WHEN (predicted_action IN (BUY,CALL) AND actual_result = win)
                   OR (predicted_action IN (SELL,PUT) AND actual_result = win) THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN actual_result = loss THEN 1 ELSE 0 END) as losses,
        ROUND(AVG(predicted_confidence)::numeric, 1) as avg_confidence,
        ROUND(AVG(local_confidence)::numeric, 1) as avg_local_confidence
      FROM ai_predictions
      WHERE user_id = ${user.id}
        AND created_at > NOW() - INTERVAL 7 days
      GROUP BY model, source
      ORDER BY total DESC
    `;

    const todayStats: any[] = await prisma.$queryRaw`
      SELECT
        COUNT(*) as total,
        COUNT(actual_result) as resolved,
        SUM(CASE WHEN actual_result = win THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN actual_result = loss THEN 1 ELSE 0 END) as losses
      FROM ai_predictions
      WHERE user_id = ${user.id}
        AND created_at > CURRENT_DATE
    `;

    res.json({
      weekly: stats.map(s => ({
        model: s.model,
        source: s.source,
        total: Number(s.total),
        resolved: Number(s.resolved),
        wins: Number(s.wins),
        losses: Number(s.losses),
        winRate: Number(s.resolved) > 0 ? Math.round(Number(s.wins) / Number(s.resolved) * 100) : null,
        avgConfidence: Number(s.avg_confidence),
        avgLocalConfidence: Number(s.avg_local_confidence),
      })),
      today: todayStats.length > 0 ? {
        total: Number(todayStats[0].total),
        resolved: Number(todayStats[0].resolved),
        wins: Number(todayStats[0].wins),
        losses: Number(todayStats[0].losses),
        winRate: Number(todayStats[0].resolved) > 0
          ? Math.round(Number(todayStats[0].wins) / Number(todayStats[0].resolved) * 100) : null,
      } : { total: 0, resolved: 0, wins: 0, losses: 0, winRate: null },
    });
  } catch (err) {
    logger.error({ err }, "AI stats error");
    res.status(500).json({ error: "Failed to get AI stats" });
  }
});


// POST /api/extension/evolve-hypothesis — AI suggests new strategy combinations based on performance data
router.post("/evolve-hypothesis", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }

    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const { topStrategies, bottomStrategies, availableIndicators, currentEvolvedCount, maxBudget } = req.body;

    if (!Array.isArray(topStrategies) || topStrategies.length === 0) {
      res.status(400).json({ error: "topStrategies array required" }); return;
    }

    const topText = topStrategies.map((s: any, i: number) =>
      `${i+1}. "${s.name}" (${s.id}) — WR: ${(s.gatedWinRate*100).toFixed(1)}% | Sharpe: ${s.sharpeRatio?.toFixed(2)} | Trades: ${s.totalTrades} | Consistency: ${(s.consistency*100).toFixed(0)}% | PnL: ${s.flatPnl?.toFixed(2)} | Tags: ${(s.tags||[]).join(",")} | DD: ${s.maxDrawdown?.toFixed(1)}`
    ).join("\n");

    const bottomText = (bottomStrategies || []).map((s: any, i: number) =>
      `${i+1}. "${s.name}" (${s.id}) — WR: ${(s.gatedWinRate*100).toFixed(1)}% | Trades: ${s.totalTrades} | Tags: ${(s.tags||[]).join(",")}`
    ).join("\n");

    const indicatorList = (availableIndicators || [
      "rsi", "macd", "stochastic", "ema", "adx", "cci", "bollingerBands",
      "williamsR", "ichimoku", "sar", "keltner", "donchian", "heikinAshi",
      "pivots", "divergence", "bbSqueeze", "obv", "aroon", "demarker",
      "vortex", "alligator", "fractal", "awesomeOscillator", "supertrend"
    ]).join(", ");

    const prompt = `You are a quantitative strategy researcher for OTC binary options (1-5 minute expiry).

CURRENT TOP PERFORMING STRATEGIES:
${topText}

WORST PERFORMING STRATEGIES:
${bottomText || "None provided"}

AVAILABLE INDICATORS: ${indicatorList}

TASK: Suggest ${maxBudget || 5} NEW strategy ideas that:
1. Combine indicators in ways NOT already covered by the top strategies
2. Avoid patterns similar to the worst performers
3. Use indicators that showed strength in the top strategies but in different combinations
4. Include specific thresholds (e.g., "RSI < 25" not just "RSI oversold")

For each strategy, provide:
- name: short descriptive name
- description: what it detects and why it should work
- indicators: array of indicator names used
- entryConditionCall: specific CALL entry condition in plain English
- entryConditionPut: specific PUT entry condition in plain English
- entryTiming: "next_m1_candle" or "next_m5_candle"
- confidence: 0-100 how confident you are this will work
- reasoning: why this combination should outperform

Return ONLY valid JSON array of strategy objects. No other text.`;

    let rawText = "";
    let usedModel = "gemini-2.0-flash";

    const geminiResult = await analyzeWithGemini(prompt);
    if (geminiResult) {
      rawText = geminiResult;
    } else {
      usedModel = "claude-sonnet-4-6";
      const { query } = await import("@anthropic-ai/claude-code");
      for await (const message of query({
        prompt,
        options: {
          allowedTools: [],
          maxTurns: 1,
          model: "claude-sonnet-4-6",
          ...(process.env.CLAUDE_PATH ? { pathToClaudeCodeExecutable: process.env.CLAUDE_PATH } : {}),
        },
      })) {
        if (message.type === "assistant" && message.message?.content) {
          for (const block of message.message.content) {
            if (block.type === "text") rawText += block.text;
          }
        }
        if (message.type === "result" && typeof message.result === "string") {
          rawText += message.result;
        }
      }
    }

    logger.info({ topCount: topStrategies.length, rawTextLength: rawText.length, model: usedModel }, "AI hypothesis response");

    // Parse JSON array
    let strategies: any[] = [];
    try {
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonSource = fenceMatch ? fenceMatch[1]!.trim() : rawText.trim();
      const bracketStart = jsonSource.indexOf("[");
      if (bracketStart >= 0) {
        const text = jsonSource.substring(bracketStart);
        const end = text.lastIndexOf("]");
        if (end >= 0) {
          strategies = JSON.parse(text.substring(0, end + 1));
        }
      }
    } catch (parseErr) {
      logger.warn({ parseErr, rawText: rawText.substring(0, 200) }, "Failed to parse hypothesis JSON");
    }

    res.json({ strategies, model: usedModel, timestamp: Date.now() });
  } catch (err) {
    logger.error({ err }, "Evolve hypothesis error");
    res.status(500).json({ error: "Hypothesis generation failed" });
  }
});


// POST /api/extension/stats-upload — Receive strategy lab performance stats from extension
router.post("/stats-upload", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }

    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const stats = req.body;
    logger.info({
      userId: user.id,
      totalStrategies: stats.totalStrategies,
      totalTrades: stats.totalTrades,
      top3: stats.top10?.slice(0, 3)?.map((s: any) => `${s.id}:${s.wr}%`).join(","),
      regime: stats.regime?.state,
      tradeLogLen: stats.tradeLog?.length, demoBalance: stats.demoBalance,
      evolution: stats.evolution,
    }, "Strategy lab stats received");

    // Store latest stats for dashboard: in-memory (fast reads) + DB (survives restarts)
    // Preserve tradeLog and demoBalance from service worker uploads if content script sends empty
    const prev = (global as any).__latestLabStats;
    const merged = {
      ...stats,
      userId: user.id,
      receivedAt: Date.now(),
      tradeLog: (stats.tradeLog && stats.tradeLog.length > 0) ? stats.tradeLog : (prev?.tradeLog ?? []),
      demoBalance: stats.demoBalance ?? prev?.demoBalance ?? null,
    };
    (global as any).__latestLabStats = merged;

    // Persist to DB (fire-and-forget — don't block the response)
    prisma.labSnapshot.create({
      data: {
        userId: user.id,
        payload: merged as any,
        metadata: { totalStrategies: stats.totalStrategies, totalTrades: stats.totalTrades },
      },
    }).then(() => {
      // Keep only the last 48 snapshots per user (24h at 30-min intervals)
      return prisma.labSnapshot.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: 48,
        select: { id: true },
      });
    }).then((old: { id: string }[]) => {
      if (old.length > 0) {
        return prisma.labSnapshot.deleteMany({ where: { id: { in: old.map((r: { id: string }) => r.id) } } });
      }
    }).catch((err: unknown) => {
      logger.error({ err }, "Lab snapshot persist error");
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Stats upload error");
    res.status(500).json({ error: "Failed to process stats" });
  }
});

// GET /api/extension/lab-dashboard — Get latest strategy lab stats (for remote monitoring)
router.get("/lab-dashboard", apiLimiter, async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { res.status(401).json({ error: "Token required" }); return; }

    const user = await prisma.user.findUnique({ where: { extensionToken: token } });
    if (!user) { res.status(401).json({ error: "Invalid token" }); return; }

    const stats = (global as any).__latestLabStats;
    if (!stats || stats.userId !== user.id) {
      res.json({ available: false, message: "No stats uploaded yet" });
      return;
    }

    res.json({ available: true, ...stats });
  } catch (err) {
    logger.error({ err }, "Lab dashboard error");
    res.status(500).json({ error: "Failed to get dashboard" });
  }
});
// GET /api/extension/health — Quick health check (no auth, for monitoring)
router.get("/health", (_req: Request, res: Response) => {
  try {
    const stats = (global as any).__latestLabStats;
    if (!stats || !stats.health) {
      res.json({ status: "no_data", message: "No stats uploaded yet" });
      return;
    }
    const h = stats.health;
    const ageMs = Date.now() - (stats.receivedAt || 0);
    const stale = ageMs > 45 * 60 * 1000; // >45min = stale
    const issues: string[] = [];
    if (stale) issues.push("data_stale");
    if (!h.labActive) issues.push("lab_inactive");
    if (h.regimeBlocked) issues.push("regime_blocked");
    if (h.regimeBlockRate > 30) issues.push("high_block_rate");
    if (!h.aiActive) issues.push("ai_inactive");
    if (h.preFilterPassRate < 20 && h.preFilterTotal > 10) issues.push("prefilter_too_strict");
    if (h.routedPairs < 3) issues.push("few_routed_pairs");
    res.json({
      status: issues.length === 0 ? "healthy" : "issues",
      issues,
      health: h,
      dataAge: Math.round(ageMs / 60000) + "min",
      lastUpload: new Date(stats.receivedAt).toISOString(),
    });
  } catch (err) {
    res.status(500).json({ status: "error" });
  }
});

export default router;
